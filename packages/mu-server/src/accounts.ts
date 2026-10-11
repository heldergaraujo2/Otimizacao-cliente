/**
 * In-memory account/character storage.
 *
 * Deliberately simple: the vertical slice only needs authentication plus a character list. Persistence
 * (and the real OpenMU data model) is a later phase — see docs/ROADMAP.md Fase 11.
 */

import { DEFAULT_CHARACTER_APPEARANCE } from './appearance.js';

export interface StoredCharacter {
  slotIndex: number;
  name: string;
  level: number;
  status: number;
  appearance: Uint8Array;
  guildPosition: number;
  mapId: number;
  x: number;
  y: number;
  rotation: number;
  /** Minimal stat block used by the CharacterInformation packet. */
  stats: {
    strength: number;
    agility: number;
    vitality: number;
    energy: number;
    leadership: number;
    maxHealth: number;
    maxMana: number;
    levelUpPoints: number;
    money: number;
  };
}

export interface Account {
  username: string;
  password: string;
  characters: StoredCharacter[];
  /** Set while a connection is authenticated with this account (single session per account). */
  connected: boolean;
}

export class AccountStore {
  private readonly accounts = new Map<string, Account>();

  constructor(accounts: Account[] = []) {
    for (const account of accounts) this.accounts.set(account.username, account);
  }

  /** Adds the default development accounts (documented in docs/BUILD_AND_RUN.md). */
  static withDemoAccounts(): AccountStore {
    return new AccountStore([demoAccount('demo', 'DarkKnight'), demoAccount('alt', 'ElfArcher')]);
  }

  get(username: string): Account | undefined {
    return this.accounts.get(username);
  }

  authenticate(username: string, password: string): { ok: boolean; reason?: 'invalid-account' | 'invalid-password' | 'already-connected'; account?: Account } {
    const account = this.accounts.get(username);
    if (!account) return { ok: false, reason: 'invalid-account' };
    if (account.password !== password) return { ok: false, reason: 'invalid-password' };
    if (account.connected) return { ok: false, reason: 'already-connected' };
    return { ok: true, account };
  }
}

function demoAccount(username: string, characterName: string): Account {
  return {
    username,
    password: username, // demo credentials: user == password, documented as development-only
    connected: false,
    characters: [
      {
        slotIndex: 0,
        name: characterName,
        level: 1,
        status: 0,
        appearance: DEFAULT_CHARACTER_APPEARANCE.slice(),
        guildPosition: 0,
        mapId: 0,
        x: 125,
        y: 125,
        rotation: 2,
        stats: {
          strength: 18,
          agility: 18,
          vitality: 18,
          energy: 18,
          leadership: 0,
          maxHealth: 110,
          maxMana: 60,
          levelUpPoints: 0,
          money: 1000,
        },
      },
    ],
  };
}
