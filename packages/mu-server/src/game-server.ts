/**
 * GameServer vertical slice.
 *
 * Implemented flow (all packets verified against the protocol package):
 *   login (C3 F1 01)          -> login response (C1 F1 01) + game server entered (C1 F1 00)
 *   character list (C1 F3 00) -> character list (C1 F3 00)
 *   select character (C1 F3 03)-> character information (C3 F3 03) + map changed (C3 1C 0F)
 *   client ready (C1 F3 12)   -> add characters to scope (C2 12) + notify others
 *   walk (C1 D4)              -> object walked (C1 D4) broadcast to characters in scope
 *   ping (C1 0E 00)           -> ping echo (C1 0E 00)
 *   logout (C1 F1 02)         -> logout (C1 F1 02) + leave the world
 *
 * The server is authoritative: movement is validated by the world (bounds, step count, source
 * position) and rejected movements never change the stored position. Unsupported packets are
 * answered with a server message instead of being ignored silently.
 */

import type { Server, Socket } from 'node:net';

import {
  buildAddCharactersToScope,
  buildAddNpcsToScope,
  buildCharacterInformation,
  buildCharacterList,
  buildGameServerEntered,
  buildLogOut,
  buildLoginResponse,
  buildMapChanged,
  buildMapObjectOutOfScope,
  buildObjectWalked,
  buildPing,
  buildServerMessage,
  GAME_CODE,
  LoginResult,
  MuConnection,
  parseLogOut,
  parseLoginLongPassword,
  parsePing,
  parseSelectCharacter,
  parseWalkRequest,
  readPacketHeader,
  type NpcScopeEntry,
  type ScopeCharacter,
} from '@mu-reengineer/protocol';

import type { Account, AccountStore, StoredCharacter } from './accounts.js';
import { createSocketTransport } from './net/socket-transport.js';
import { isNpc, type World, type WorldCharacter } from './world.js';

export type SessionState = 'connected' | 'authenticated' | 'character-selected' | 'in-game' | 'closed';

export interface GameServerOptions {
  accounts: AccountStore;
  world: World;
  gameServerHost: string;
  xor32: boolean;
  log?: (message: string) => void;
}

export interface GameServerMetrics {
  connections: number;
  logins: number;
  loginsFailed: number;
  charactersSelected: number;
  walksAccepted: number;
  walksRejected: number;
  scopePackets: number;
  scopeRemovals: number;
  unsupportedPackets: number;
  disconnects: number;
}

export class GameServer {
  readonly metrics: GameServerMetrics = {
    connections: 0,
    logins: 0,
    loginsFailed: 0,
    charactersSelected: 0,
    walksAccepted: 0,
    walksRejected: 0,
    scopePackets: 0,
    scopeRemovals: 0,
    unsupportedPackets: 0,
    disconnects: 0,
  };

  private readonly sessions = new Set<GameServerSession>();
  readonly internals: {
    remove: (session: GameServerSession) => void;
    options: GameServerOptions;
  };

  constructor(private readonly options: GameServerOptions) {
    this.internals = {
      remove: (session: GameServerSession): void => {
        this.sessions.delete(session);
      },
      options,
    };
  }

  attach(server: Server): void {
    server.on('connection', (socket) => {
      this.metrics.connections += 1;
      const session = new GameServerSession(socket, this);
      this.sessions.add(session);
    });
  }

  /** Sessions that are in game — used for scope broadcast. */
  inGameSessions(): GameServerSession[] {
    return [...this.sessions].filter((session) => session.state === 'in-game');
  }

  /**
   * Brings every in-game session's view in sync with the world.
   *
   * Each session remembers which objects it knows about (`known`), so this single pass covers every
   * case — somebody arrived, somebody walked out of the box, somebody walked into it, somebody
   * disconnected — by diffing the desired view (`World.inScope`) against the remembered one and
   * sending exactly the missing pieces: one `AddCharactersToScope` per batch of newcomers and one
   * `MapObjectOutOfScope` for the objects which left. Objects already known are never re-sent, which
   * keeps the traffic proportional to actual changes.
   */
  syncScopes(): void {
    for (const session of this.inGameSessions()) {
      session.syncView();
    }
  }

  /** Sends the current view to a session from scratch (used by the explicit scope refresh request). */
  resendScope(session: GameServerSession): void {
    session.forgetView();
    session.syncView();
  }

}


export class GameServerSession {
  state: SessionState = 'connected';
  character?: WorldCharacter;
  account?: Account;
  /** Objects this session currently knows about (its view), keyed by object id. */
  private readonly known = new Map<number, WorldCharacter>();

  private readonly connection: MuConnection;

  constructor(
    socket: Socket,
    private readonly server: GameServer,
  ) {
    this.connection = new MuConnection({
      role: 'server',
      transport: createSocketTransport(socket),
      useXor32: this.server.internals.options.xor32,
      log: this.server.internals.options.log,
    });

    this.connection.onPacket((packet) => {
      try {
        this.handlePacket(packet);
      } catch (error) {
        this.server.metrics.unsupportedPackets += 1;
        this.server.internals.options.log?.(`game: packet handling failed: ${(error as Error).message}`);
        this.send(buildServerMessage(0, `packet rejected: ${(error as Error).message}`));
        this.close();
      }
    });

    this.connection.onClose(() => {
      this.handleClose();
    });
  }

  get metrics() {
    return this.connection.metrics;
  }

  send(packet: Uint8Array): void {
    if (this.state === 'closed') return;
    this.connection.send(packet);
  }

  close(): void {
    this.state = 'closed';
    this.connection.close();
  }

  canSee(other: WorldCharacter): boolean {
    if (!this.character) return false;
    return (
      this.character.mapId === other.mapId &&
      Math.abs(this.character.x - other.x) <= 10 &&
      Math.abs(this.character.y - other.y) <= 10
    );
  }

  private handleClose(): void {
    if (this.state !== 'closed') this.state = 'closed';
    this.server.metrics.disconnects += 1;
    const character = this.character;
    if (character) this.server.internals.options.world.remove(character.id);
    if (this.account) this.account.connected = false;
    this.server.internals.remove(this);
    if (character) {
      // everybody who had this character in view gets a MapObjectOutOfScope from the diff
      this.server.syncScopes();
    }
  }

  private handlePacket(packet: Uint8Array): void {
    const header = readPacketHeader(packet);

    // ---------------------------------------------------------------- login
    if (header.code === GAME_CODE.Login && header.subCode === 0x01 && this.state === 'connected') {
      this.handleLogin(packet);
      return;
    }

    if (header.code === GAME_CODE.Login && header.subCode === 0x02) {
      parseLogOut(packet);
      this.send(buildLogOut(0));
      this.close();
      return;
    }

    if (this.state === 'connected') {
      this.server.metrics.unsupportedPackets += 1;
      this.server.internals.options.log?.(`game: packet before login (code 0x${header.code.toString(16)})`);
      this.close();
      return;
    }

    // ------------------------------------------------------------ character
    if (header.code === GAME_CODE.Character) {
      if (header.subCode === 0x00 && this.state === 'authenticated') {
        this.sendCharacterList();
        return;
      }
      if (header.subCode === 0x03 && this.state === 'authenticated') {
        this.handleSelectCharacter(packet);
        return;
      }
      if (header.subCode === 0x12 && this.state === 'character-selected') {
        this.enterGame();
        return;
      }
    }

    // ----------------------------------------------------------------- play
    if (header.code === GAME_CODE.ObjectWalked && this.state === 'in-game') {
      this.handleWalk(packet);
      return;
    }

    if (header.code === GAME_CODE.Ping && this.state !== 'closed') {
      const ping = parsePing(packet);
      this.send(buildPing(ping.tickCount, ping.attackSpeed));
      return;
    }

    if (header.code === GAME_CODE.ScopeCharacters && header.subCode === undefined && this.state === 'in-game') {
      // Some clients request a scope refresh after loading: answer with the whole current view.
      this.server.resendScope(this);
      return;
    }

    this.server.metrics.unsupportedPackets += 1;
    this.send(buildServerMessage(0, `unsupported packet 0x${header.code.toString(16)}`));
  }

  private handleLogin(packet: Uint8Array): void {
    const credentials = parseLoginLongPassword(packet);
    const result = this.server.internals.options.accounts.authenticate(credentials.username, credentials.password);

    if (!result.ok || !result.account) {
      this.server.metrics.loginsFailed += 1;
      const code =
        result.reason === 'invalid-account'
          ? LoginResult.InvalidAccount
          : result.reason === 'already-connected'
            ? LoginResult.AccountAlreadyConnected
            : LoginResult.InvalidPassword;
      this.server.internals.options.log?.(
        `game: login rejected for "${credentials.username}" (${result.reason ?? 'unknown'}) from ${this.connection.remoteLabel}`,
      );
      this.send(buildLoginResponse(code));
      this.close();
      return;
    }

    this.account = result.account;
    this.account.connected = true;
    this.state = 'authenticated';
    this.server.metrics.logins += 1;
    this.send(buildLoginResponse(LoginResult.Okay));
    this.send(buildGameServerEntered(true, 0, credentials.clientVersion));
  }

  private sendCharacterList(): void {
    const account = this.account;
    if (!account) throw new Error('character list requested before login');
    this.send(
      buildCharacterList(
        account.characters.map((character) => ({
          slotIndex: character.slotIndex,
          name: character.name,
          level: character.level,
          status: character.status,
          appearance: character.appearance,
          guildPosition: character.guildPosition,
        })),
      ),
    );
  }

  private handleSelectCharacter(packet: Uint8Array): void {
    const account = this.account;
    if (!account) throw new Error('character selection before login');
    const { name } = parseSelectCharacter(packet);
    const stored = account.characters.find((character) => character.name === name);
    if (!stored) {
      this.send(buildServerMessage(0, `character "${name}" does not exist`));
      return;
    }

    const world = this.server.internals.options.world;
    const existing = world.byAccount(account.username);
    if (existing) world.remove(existing.id);

    this.character = world.add({
      account: account.username,
      name: stored.name,
      mapId: stored.mapId,
      x: stored.x,
      y: stored.y,
      rotation: stored.rotation,
      level: stored.level,
      appearance: stored.appearance.slice(),
      heroState: stored.status,
    });
    this.state = 'character-selected';
    this.server.metrics.charactersSelected += 1;

    this.send(buildCharacterInformation(toCharacterInformation(stored, this.character.id)));
    this.send(buildMapChanged(stored.mapId, stored.x, stored.y, stored.rotation, true));
  }

  private enterGame(): void {
    this.state = 'in-game';
    // an empty view means the first sync sends everything in range (the character itself included)
    this.known.clear();
    this.server.syncScopes();
  }

  /** Drops the remembered view, so the next sync re-sends everything in range. */
  forgetView(): void {
    this.known.clear();
  }

  /**
   * Diffs the world against the remembered view and sends the additions/removals. Called for every
   * in-game session after anything that can change visibility.
   */
  syncView(): void {
    const character = this.character;
    if (!character || this.state !== 'in-game') return;

    const world = this.server.internals.options.world;
    const desired = new Map<number, WorldCharacter>();
    desired.set(character.id, character);
    for (const other of world.inScope(character.id)) desired.set(other.id, other);

    const addedPlayers: WorldCharacter[] = [];
    const addedNpcs: WorldCharacter[] = [];
    for (const [id, other] of desired) {
      if (this.known.has(id)) continue;
      if (isNpc(other)) addedNpcs.push(other);
      else addedPlayers.push(other);
    }
    const removed: number[] = [];
    for (const id of this.known.keys()) {
      if (!desired.has(id)) removed.push(id);
    }

    if (addedPlayers.length > 0) {
      // one packet may carry several entries: the reference encodes a count plus 36-byte records
      this.send(buildAddCharactersToScope(addedPlayers.map(toScopeCharacter)));
      this.server.metrics.scopePackets += addedPlayers.length;
    }
    if (addedNpcs.length > 0) {
      // monsters/NPCs travel in their own packet (C2 13), 10-byte records
      this.send(buildAddNpcsToScope(addedNpcs.map(toNpcScopeEntry)));
      this.server.metrics.scopePackets += addedNpcs.length;
    }
    if (removed.length > 0) {
      this.send(buildMapObjectOutOfScope(removed));
      this.server.metrics.scopeRemovals += removed.length;
    }

    this.known.clear();
    for (const [id, other] of desired) this.known.set(id, other);
  }

  private handleWalk(packet: Uint8Array): void {
    const character = this.character;
    if (!character) return;
    const request = parseWalkRequest(packet);
    const result = this.server.internals.options.world.move(character.id, request.directions, request.sourceX, request.sourceY);

    if (!result.ok) {
      this.server.metrics.walksRejected += 1;
      this.server.internals.options.log?.(`game: walk rejected for "${character.name}": ${result.reason}`);
      this.send(buildServerMessage(0, `movement rejected: ${result.reason}`));
      return;
    }

    this.server.metrics.walksAccepted += 1;
    const objectWalked = buildObjectWalked(character.id, result.x, result.y, result.rotation, request.directions);
    for (const session of this.server.inGameSessions()) {
      if (session.character?.id === character.id) continue; // the walker already predicted its own move
      if (session.canSee(character)) session.send(objectWalked);
    }

    // the move can have changed who sees whom in both directions
    this.server.syncScopes();
  }
}

function toNpcScopeEntry(character: WorldCharacter): NpcScopeEntry {
  return {
    id: character.id,
    typeNumber: character.typeNumber ?? 0,
    currentX: character.x,
    currentY: character.y,
    targetX: character.x,
    targetY: character.y,
    rotation: character.rotation,
  };
}

function toScopeCharacter(character: WorldCharacter): ScopeCharacter {
  return {
    id: character.id,
    currentX: character.x,
    currentY: character.y,
    appearance: character.appearance,
    name: character.name,
    targetX: character.x,
    targetY: character.y,
    rotation: character.rotation,
    heroState: character.heroState,
  };
}

function toCharacterInformation(character: StoredCharacter, _id: number) {
  return {
    x: character.x,
    y: character.y,
    mapId: character.mapId,
    currentExperience: 0,
    experienceForNextLevel: 1000,
    levelUpPoints: character.stats.levelUpPoints,
    strength: character.stats.strength,
    agility: character.stats.agility,
    vitality: character.stats.vitality,
    energy: character.stats.energy,
    currentHealth: character.stats.maxHealth,
    maximumHealth: character.stats.maxHealth,
    currentMana: character.stats.maxMana,
    maximumMana: character.stats.maxMana,
    currentShield: 0,
    maximumShield: 0,
    currentAbility: 0,
    maximumAbility: 0,
    money: character.stats.money,
    heroState: character.status,
    status: character.status,
    leadership: character.stats.leadership,
    inventoryExtensions: 0,
  };
}
