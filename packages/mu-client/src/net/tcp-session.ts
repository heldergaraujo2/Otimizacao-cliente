/**
 * Node-only convenience wrapper: opens a TCP socket and attaches a {@link ClientSession} to it.
 * The browser build must not import this module (it pulls in `node:net`); it uses the WebSocket
 * transport instead.
 */

import { ClientSession, type SessionOptions } from '../core/session.js';
import { connectSocketTransport, type ConnectOptions } from './socket-transport.js';

export async function connectTcpSession(options: SessionOptions & ConnectOptions): Promise<ClientSession> {
  const transport = await connectSocketTransport(options);
  return ClientSession.attach(transport, options);
}
