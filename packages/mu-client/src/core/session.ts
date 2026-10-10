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
  parseObjectWalked,
  parsePing,
  parseServerMessage,
  readPacketHeader,
  type CharacterInformation,
  type CharacterListEntry,
  type ScopeCharacter,
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

  /** Tells the server we finished loading the map and waits for the first scope packets. */
  async clientReady(quietMs = 120): Promise<ScopeCharacter[]> {
    this.connection.send(buildClientReadyAfterMapChange());
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

  /** Sends a walk request; the server answers with an ObjectWalked broadcast to the neighbours. */
  walk(directions: number[], override?: { x: number; y: number }): void {
    const sourceX = override?.x ?? this.player.x;
    const sourceY = override?.y ?? this.player.y;
    this.connection.send(buildWalkRequest(sourceX, sourceY, this.player.rotation, directions));
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
      this.emit('scope', parseAddCharactersToScope(packet).characters);
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
