/**
 * Browser transport: a WebSocket carrying raw MU frames.
 *
 * Browsers cannot open TCP sockets, so the WebSocket gateway (`tools/mu-gateway`) bridges to the game
 * server. The transport is binary-clean: WebSocket frames are copied byte-for-byte, and the protocol
 * pipeline above it is exactly the same code the node tests exercise.
 */

import type { MuTransport } from '@mu-reengineer/protocol';

export interface WebSocketTransportOptions {
  url: string;
  timeoutMs?: number;
}

export function connectWebSocketTransport(options: WebSocketTransportOptions): Promise<MuTransport> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(options.url);
    socket.binaryType = 'arraybuffer';
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`websocket timeout after ${options.timeoutMs ?? 5000} ms`));
    }, options.timeoutMs ?? 5000);

    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve({
        remoteLabel: options.url,
        write(data: Uint8Array): void {
          // slice() keeps only the used window of the view and detaches it from any buffer reuse
          socket.send(data.slice().buffer);
        },
        onData(handler: (chunk: Uint8Array) => void): void {
          socket.addEventListener('message', (event) => {
            if (event.data instanceof ArrayBuffer) handler(new Uint8Array(event.data));
          });
        },
        onClose(handler: (error?: Error) => void): void {
          socket.addEventListener('close', (event) => handler(new Error(`websocket closed (code ${event.code})`)));
          socket.addEventListener('error', () => handler(new Error('websocket error')));
        },
        close(): void {
          socket.close();
        },
      });
    });

    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`cannot connect to ${options.url}`));
    });
  });
}
