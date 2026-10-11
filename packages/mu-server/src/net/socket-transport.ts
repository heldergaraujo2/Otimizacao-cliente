/**
 * `net.Socket` implementation of the protocol transport used by the server.
 */

import type { Socket } from 'node:net';

import type { MuTransport } from '@mu-reengineer/protocol';

export function createSocketTransport(socket: Socket): MuTransport {
  return {
    get remoteLabel(): string {
      return `${socket.remoteAddress ?? '?'}:${socket.remotePort ?? 0}`;
    },
    write(data: Uint8Array): void {
      socket.write(data);
    },
    onData(handler: (chunk: Uint8Array) => void): void {
      socket.on('data', (chunk: Buffer) => handler(new Uint8Array(chunk)));
    },
    onClose(handler: (error?: Error) => void): void {
      socket.on('close', () => handler());
      socket.on('error', (error: Error) => handler(error));
    },
    close(): void {
      socket.destroy();
    },
  };
}
