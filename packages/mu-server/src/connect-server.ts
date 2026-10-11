/**
 * ConnectServer: hands out the server list and the game server address.
 *
 * Implemented packets: `F4 06` (server list, request and response) and `F4 03` (connection info,
 * request and response). Both are unencrypted C1 packets, as in the reference protocol.
 */

import type { Server } from 'node:net';

import {
  buildConnectionInfoResponse,
  buildServerListResponse,
  CONNECT_SERVER_CODE,
  CONNECT_SERVER_SUBCODE,
  MuConnection,
  parseConnectionInfoRequest,
  parseServerListResponse,
  readPacketHeader,
  type ServerListEntry,
} from '@mu-reengineer/protocol';

import { createSocketTransport } from './net/socket-transport.js';

export interface ConnectServerOptions {
  serverList: ServerListEntry[];
  gameServerHost: string;
  gameServerPort: number;
  xor32: boolean;
  log?: (message: string) => void;
}

export interface ConnectServerMetrics {
  connections: number;
  serverListRequests: number;
  connectionInfoRequests: number;
  rejected: number;
}

export function attachConnectServer(server: Server, options: ConnectServerOptions): ConnectServerMetrics {
  const metrics: ConnectServerMetrics = {
    connections: 0,
    serverListRequests: 0,
    connectionInfoRequests: 0,
    rejected: 0,
  };

  server.on('connection', (socket) => {
    metrics.connections += 1;
    const connection = new MuConnection({
      role: 'server',
      transport: createSocketTransport(socket),
      useEncryption: false, // the connect server exchange is plain C1
      useXor32: false,
      log: options.log,
    });

    connection.onPacket((packet) => {
      let header;
      try {
        header = readPacketHeader(packet);
      } catch (error) {
        metrics.rejected += 1;
        options.log?.(`connect: malformed packet: ${(error as Error).message}`);
        connection.close();
        return;
      }

      if (header.code !== CONNECT_SERVER_CODE.ServerListResponse) {
        metrics.rejected += 1;
        options.log?.(`connect: unexpected code 0x${header.code.toString(16)}`);
        connection.close();
        return;
      }

      if (header.subCode === CONNECT_SERVER_SUBCODE.ServerList) {
        metrics.serverListRequests += 1;
        connection.send(buildServerListResponse(options.serverList));
        return;
      }

      if (header.subCode === CONNECT_SERVER_SUBCODE.ConnectionInfo) {
        metrics.connectionInfoRequests += 1;
        // Validate the request we received so a malformed packet is never silently accepted.
        try {
          parseConnectionInfoRequest(packet);
        } catch (error) {
          metrics.rejected += 1;
          options.log?.(`connect: bad connection info request: ${(error as Error).message}`);
          connection.close();
          return;
        }
        connection.send(buildConnectionInfoResponse(options.gameServerHost, options.gameServerPort));
        return;
      }

      metrics.rejected += 1;
      options.log?.(`connect: unsupported sub code 0x${header.subCode?.toString(16) ?? '??'}`);
      connection.close();
    });

    connection.onClose(() => {
      options.log?.(`connect: connection from ${connection.remoteLabel} closed`);
    });
  });

  return metrics;
}

/** Exposed for tests: parses a server-list response the way a client would. */
export { parseServerListResponse };
