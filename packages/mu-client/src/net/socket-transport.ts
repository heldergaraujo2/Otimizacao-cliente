/**
 * Client-side `net.Socket` transport used by the headless session (tests, CLI drivers) and by the
 * browser through a WebSocket bridge in a later phase.
 */

import { connect, type Socket } from 'node:net';

import type { MuTransport } from '@mu-reengineer/protocol';

export interface ConnectOptions {
  host: string;
  port: number;
  timeoutMs?: number;
}

export async function connectSocketTransport(options: ConnectOptions): Promise<MuTransport> {
  const socket: Socket = await new Promise((resolve, reject) => {
    const socket = connect({ host: options.host, port: options.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`connect timeout after ${options.timeoutMs ?? 5000} ms`));
    }, options.timeoutMs ?? 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  return {
    get remoteLabel(): string {
      return `${socket.remoteAddress ?? options.host}:${socket.remotePort ?? options.port}`;
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
