/**
 * ConnectServer client: the first two packets a real client exchanges before it knows where the game
 * server lives (the connect server exchange is unencrypted C1).
 */

import {
  buildConnectionInfoRequest,
  buildServerListRequest,
  MuConnection,
  parseConnectionInfoResponse,
  parseServerListResponse,
  type ServerListEntry,
} from '@mu-reengineer/protocol';

import { connectSocketTransport } from '../net/socket-transport.js';

async function exchange(
  host: string,
  port: number,
  request: Uint8Array,
  timeoutMs: number,
): Promise<Uint8Array> {
  const transport = await connectSocketTransport({ host, port, timeoutMs });
  const connection = new MuConnection({ role: 'client', transport, useEncryption: false, useXor32: false });
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`connect server timeout after ${timeoutMs} ms`)), timeoutMs);
      connection.onPacket((packet) => {
        clearTimeout(timer);
        resolve(packet);
      });
      connection.onClose((error) => {
        clearTimeout(timer);
        reject(error ?? new Error('connect server closed the connection'));
      });
      connection.send(request);
    });
  } finally {
    connection.close();
  }
}

export async function fetchServerList(host: string, port: number, timeoutMs = 3000): Promise<ServerListEntry[]> {
  const response = await exchange(host, port, buildServerListRequest(), timeoutMs);
  return parseServerListResponse(response).servers;
}

export async function fetchConnectionInfo(
  host: string,
  port: number,
  serverId: number,
  timeoutMs = 3000,
): Promise<{ ipAddress: string; port: number }> {
  const response = await exchange(host, port, buildConnectionInfoRequest(serverId), timeoutMs);
  return parseConnectionInfoResponse(response);
}
