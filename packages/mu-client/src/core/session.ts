/**
 * Headless client session: the game-side state machine on top of the protocol pipeline.
 *
 * Everything the browser renderer needs is produced here (position, scope, server messages), so the
 * session can be driven and asserted without a GPU — that is how Levels 3/4 are tested.
 */

import {
  buildClientReadyAfterMapChange,
  buildLoginLongPassword,
  buildPing,
  buildRequestCharacterList,
  buildSelectCharacter,
  applyWalk,
  buildWalkRequest,
  GAME_CODE,
  MuConnection,
  packetName,
  parseAddCharactersToScope,
  parseCharacterInformation,
  parseCharacterList,
  parseGameServerEntered,
  parseLoginResponse,
  parseMapChanged,
  parseMapObjectOutOfScope,
  parseObjectWalked,
  parsePing,
  parseServerMessage,
  readPacketHeader,
  type CharacterInformation,
  type CharacterListEntry,
  type ScopeCharacter,
  type WalkOutcome,
} from '@mu-reengineer/protocol';

import type { MuTransport } from '@mu-reengineer/protocol';

export interface SessionOptions {
  xor32?: boolean;
  defaultTimeoutMs?: number;
  log?: (message: string) => void;
}

/** Transport factory: node TCP in tests/CLI, WebSocket in the browser. */
export type TransportFactory = () => Promise<MuTransport>;

export interface MapChangedInfo {
  isMapChange: boolean;
  mapNumber: number;
  x: number;
  y: number;
  rotation: number;
}

export interface PlayerState {
  name?: string;
  id?: number;
  mapId: number;
  x: number;
  y: number;
  rotation: number;
  information?: CharacterInformation;
}

export interface SessionEvents {
  scope: ScopeCharacter[];
  scopeRemoved: { objectIds: number[] };
  walked: { objectId: number; targetX: number; targetY: number; rotation: number };
  serverMessage: { type: number; message: string };
  packet: { name: string; size: number };
  closed: { error?: Error };
}

type Handler<K extends keyof SessionEvents> = (event: SessionEvents[K]) => void;

export class ClientSession {
  readonly player: PlayerState = { mapId: 0, x: 0, y: 0, rotation: 0 };
  readonly received: { name: string; packet: Uint8Array }[] = [];
  readonly connection: MuConnection;

  private readonly queue: Uint8Array[] = [];
  private readonly waiters: { predicate: (packet: Uint8Array) => boolean; resolve: (packet: Uint8Array) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }[] = [];
  private readonly handlers = new Map<keyof SessionEvents, Set<Handler<never>>>();
  private readonly scope = new Map<number, ScopeCharacter>();
  private readonly defaultTimeoutMs: number;
  private closedError?: Error;

  private constructor(connection: MuConnection, options: SessionOptions) {
    this.connection = connection;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 3000;
    connection.onPacket((packet) => this.dispatch(packet));
    connection.onClose((error) => {
      this.closedError = error ?? new Error('connection closed');
      this.emit('closed', { error });
      for (const waiter of this.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(this.closedError);
      }
    });
  }

  /**
   * Attaches a session to any transport (node TCP, browser WebSocket, in-memory pipe).
   * Keeping the transport injected is what lets the same core run headless in tests and in the
   * browser renderer.
   */
  static attach(transport: MuTransport, options: SessionOptions = {}): ClientSession {
    const connection = new MuConnection({
      role: 'client',
      transport,
      useXor32: options.xor32 ?? true,
      log: options.log,
    });
    return new ClientSession(connection, options);
  }

  get metrics() {
    return this.connection.metrics;
  }

  get isClosed(): boolean {
    return this.closedError !== undefined;
  }

  on<K extends keyof SessionEvents>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set?.delete(handler as Handler<never>);
  }

  close(): void {
    this.connection.close();
  }

  // ---------------------------------------------------------------- commands

  async login(username: string, password: string, tickCount = Date.now() % 0xffffffff): Promise<number> {
    this.connection.send(buildLoginLongPassword(username, password, tickCount));
    const response = await this.waitFor((packet) => {
      const header = readPacketHeader(packet);
      return header.code === GAME_CODE.Login && header.subCode === 0x01;
    });
    const { success } = parseLoginResponse(response);
    if (success !== 0) return success;

    const entered = await this.waitFor((packet) => {
      const header = readPacketHeader(packet);
      return header.code === GAME_CODE.Login && header.subCode === 0x00;
    });
    const info = parseGameServerEntered(entered);
    if (!info.success) return -1;
    this.player.id = info.playerId;
    return 0;
  }

  async requestCharacterList(): Promise<CharacterListEntry[]> {
    this.connection.send(buildRequestCharacterList(0));
    const response = await this.waitFor((packet) => {
      const header = readPacketHeader(packet);
      return header.code === GAME_CODE.Character && header.subCode === 0x00;
    });
    return parseCharacterList(response).characters;
  }

  async selectCharacter(name: string): Promise<{ information: CharacterInformation; map: MapChangedInfo }> {
    this.connection.send(buildSelectCharacter(name));
    const informationPacket = await this.waitFor((packet) => {
      const header = readPacketHeader(packet);
      return header.code === GAME_CODE.Character && header.subCode === 0x03;
    });
    const information = parseCharacterInformation(informationPacket);
    const mapPacket = await this.waitFor((packet) => {
      const header = readPacketHeader(packet);
      return header.code === GAME_CODE.MapChanged && header.subCode === 0x0f;
    });
    const map = parseMapChanged(mapPacket);
    this.player.name = name;
    this.player.information = information;
    this.player.mapId = map.mapNumber;
    this.player.x = map.x;
    this.player.y = map.y;
    this.player.rotation = map.rotation;
    return { information, map };
  }

  /**
   * Asks the server to re-send the current view (C1 F3 12).
   *
   * Used both as "client finished loading" and as the recovery step after a rejected prediction: the
   * scope packets contain the server's authoritative position for our own character, which
   * {@link resyncPosition} adopts.
   */
  requestScopeRefresh(): void {
    this.connection.send(buildClientReadyAfterMapChange());
  }

  /** Tells the server we finished loading the map and waits for the first scope packets. */
  async clientReady(quietMs = 120): Promise<ScopeCharacter[]> {
    this.scope.clear();
    this.requestScopeRefresh();
    const scope: ScopeCharacter[] = [];
    for (;;) {
      const packet = await this.waitFor((candidate) => {
        const header = readPacketHeader(candidate);
        return header.code === GAME_CODE.ScopeCharacters;
      }, quietMs).catch(() => undefined);
      if (!packet) break;
      scope.push(...parseAddCharactersToScope(packet).characters);
    }
    const self = scope.find((entry) => entry.name === this.player.name);
    if (self) this.player.id = self.id;
    return scope;
  }

  /**
   * Sends a walk request, predicting the move locally.
   *
   * The prediction is what makes the client playable: the local model is moved immediately (the
   * renderer can follow without waiting for the network) and the *next* walk declares that predicted
   * position, which is also what the server validates against. The server's `ObjectWalked` broadcast
   * keeps every other character in sync, and a rejection (`serverMessage` starting with
   * "movement rejected") means the prediction was wrong — {@link resyncPosition} then takes the
   * server's word through the next authoritative state.
   */
  walk(directions: number[], options: { x?: number; y?: number; predict?: boolean } = {}): WalkOutcome {
    const sourceX = options.x ?? this.player.x;
    const sourceY = options.y ?? this.player.y;
    this.connection.send(buildWalkRequest(sourceX, sourceY, this.player.rotation, directions));

    if (options.predict === false) {
      return { ok: true, x: sourceX, y: sourceY, rotation: this.player.rotation, steps: directions.length };
    }
    const predicted = applyWalk(sourceX, sourceY, this.player.rotation, directions);
    if (predicted.ok) {
      this.player.x = predicted.x;
      this.player.y = predicted.y;
      this.player.rotation = predicted.rotation;
    }
    return predicted;
  }

  /**
   * Adopts an authoritative position (for example from a `MapChanged` packet or after a rejected
   * prediction). Keeps the local model honest instead of letting prediction drift forever.
   */
  resyncPosition(x: number, y: number, rotation = this.player.rotation): void {
    this.player.x = x;
    this.player.y = y;
    this.player.rotation = rotation;
  }

  async ping(): Promise<{ tickCount: number; attackSpeed: number }> {
    const tick = Date.now() % 0xffffffff;
    this.connection.send(buildPing(tick, 0));
    const response = await this.waitFor((packet) => {
      const header = readPacketHeader(packet);
      return header.code === GAME_CODE.Ping;
    });
    return parsePing(response);
  }

  /** Waits for the next packet matching `predicate` (buffered packets are consumed first). */
  waitFor(predicate: (packet: Uint8Array) => boolean, timeoutMs = this.defaultTimeoutMs): Promise<Uint8Array> {
    const bufferedIndex = this.queue.findIndex(predicate);
    if (bufferedIndex >= 0) {
      const [packet] = this.queue.splice(bufferedIndex, 1);
      return Promise.resolve(packet!);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`timeout after ${timeoutMs} ms waiting for a packet`));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  /**
   * Currently visible characters, as tracked from the scope packets.
   *
   * Kept by the session (not by the renderer) so tests, tools and the renderer share one source of
   * truth: additions come from `AddCharactersToScope`, removals from `MapObjectOutOfScope`.
   */
  scopeSnapshot(): ScopeCharacter[] {
    return [...this.scope.values()];
  }

  get scopeSize(): number {
    return this.scope.size;
  }

  // ------------------------------------------------------------------ events

  private dispatch(packet: Uint8Array): void {
    const name = packetName(packet);
    this.received.push({ name, packet });
    this.emit('packet', { name, size: packet.length });

    const index = this.waiters.findIndex((waiter) => waiter.predicate(packet));
    if (index >= 0) {
      const [waiter] = this.waiters.splice(index, 1);
      clearTimeout(waiter!.timer);
      waiter!.resolve(packet);
      return;
    }

    const header = readPacketHeader(packet);
    if (header.code === GAME_CODE.ScopeCharacters) {
      const characters = parseAddCharactersToScope(packet).characters;
      for (const character of characters) {
        this.scope.set(character.id, character);
        // the server's own entry for us is authoritative: adopt its position (reconciliation)
        if (this.player.id !== undefined && character.id === this.player.id) {
          this.resyncPosition(character.currentX, character.currentY, character.rotation);
        }
      }
      this.emit('scope', characters);
      return;
    }
    if (header.code === GAME_CODE.MapObjectOutOfScope) {
      const { objectIds } = parseMapObjectOutOfScope(packet);
      for (const objectId of objectIds) this.scope.delete(objectId);
      this.emit('scopeRemoved', { objectIds });
      return;
    }
    if (header.code === GAME_CODE.ObjectWalked) {
      const walked = parseObjectWalkedPacket(packet);
      if (walked) this.emit('walked', walked);
      return;
    }
    if (header.code === GAME_CODE.ServerMessage) {
      this.emit('serverMessage', parseServerMessage(packet));
      return;
    }
    this.queue.push(packet);
  }

  private emit<K extends keyof SessionEvents>(event: K, payload: SessionEvents[K]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      (handler as Handler<K>)(payload);
    }
  }
}

function parseObjectWalkedPacket(packet: Uint8Array): SessionEvents['walked'] | undefined {
  try {
    const parsed = parseObjectWalked(packet);
    return {
      objectId: parsed.objectId,
      targetX: parsed.targetX,
      targetY: parsed.targetY,
      rotation: parsed.targetRotation,
    };
  } catch {
    return undefined;
  }
}
