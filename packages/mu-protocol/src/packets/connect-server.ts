/**
 * Connect-server packets: the small "server list" service that a MU client contacts first to learn
 * where the game servers are.
 *
 * Layout follows OpenMU `src/Network/Packets/ConnectServer/ConnectServerPackets.xml`.
 */

import { ByteReader, ByteWriter } from '../codec.js';
import { createPacket, readPacketHeader } from '../framing.js';

export const CONNECT_SERVER_CODE = {
  ServerListRequest: 0xf4,
  ServerListResponse: 0xf4,
  ConnectionInfoRequest: 0xf4,
  ConnectionInfo: 0xf4,
} as const;

export const CONNECT_SERVER_SUBCODE = {
  ServerList: 0x06,
  ConnectionInfo: 0x03,
} as const;

export interface ServerListEntry {
  serverId: number;
  loadPercentage: number;
}

/** C1 F4 06, 4 bytes. */
export function buildServerListRequest(): Uint8Array {
  return createPacket(0xc1, CONNECT_SERVER_CODE.ServerListRequest, CONNECT_SERVER_SUBCODE.ServerList, new Uint8Array(0));
}

/** C2 F4 06: [5] uint16 BE server count, then 3-byte entries {uint16 LE id, uint8 load}. */
export function buildServerListResponse(servers: ServerListEntry[]): Uint8Array {
  const writer = new ByteWriter(8 + servers.length * 3);
  writer.u16be(servers.length);
  for (const server of servers) {
    writer.u16le(server.serverId);
    writer.u8(server.loadPercentage);
  }
  return createPacket(0xc2, CONNECT_SERVER_CODE.ServerListResponse, CONNECT_SERVER_SUBCODE.ServerList, writer.toUint8Array());
}

export function parseServerListResponse(packet: Uint8Array): { servers: ServerListEntry[] } {
  const header = readPacketHeader(packet);
  if (header.code !== 0xf4 || header.subCode !== 0x06) {
    throw new Error('not a server list response');
  }
  const reader = new ByteReader(packet, 5);
  const count = reader.u16be();
  const servers: ServerListEntry[] = [];
  for (let i = 0; i < count; i++) {
    servers.push({ serverId: reader.u16le(), loadPercentage: reader.u8() });
  }
  return { servers };
}

/** C1 F4 03, 6 bytes: [4] uint16 LE server id. */
export function buildConnectionInfoRequest(serverId: number): Uint8Array {
  const writer = new ByteWriter(4).u16le(serverId);
  return createPacket(0xc1, CONNECT_SERVER_CODE.ConnectionInfoRequest, CONNECT_SERVER_SUBCODE.ConnectionInfo, writer.toUint8Array());
}

/** C1 F4 03, 22 bytes: [4] 16-byte ASCII ip, [20] uint16 LE port. */
export function buildConnectionInfoResponse(ipAddress: string, port: number): Uint8Array {
  const writer = new ByteWriter(18).ascii(ipAddress, 16).u16le(port);
  return createPacket(0xc1, CONNECT_SERVER_CODE.ConnectionInfo, CONNECT_SERVER_SUBCODE.ConnectionInfo, writer.toUint8Array());
}

export function parseConnectionInfoResponse(packet: Uint8Array): {
  ipAddress: string;
  port: number;
} {
  const header = readPacketHeader(packet);
  if (header.code !== 0xf4 || header.subCode !== 0x03) throw new Error('not a connection info packet');
  const reader = new ByteReader(packet, 4);
  const ipAddress = reader.ascii(16);
  const port = reader.u16le();
  return { ipAddress, port };
}

export function parseConnectionInfoRequest(packet: Uint8Array): { serverId: number } {
  const header = readPacketHeader(packet);
  if (header.code !== 0xf4 || header.subCode !== 0x03) throw new Error('not a connection info request');
  const reader = new ByteReader(packet, 4);
  return { serverId: reader.u16le() };
}
