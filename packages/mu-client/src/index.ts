/**
 * @mu-reengineer/client — headless game core (session, connect-server client).
 *
 * The browser renderer is intentionally a separate layer: it consumes the state produced here, which
 * is why the session can be tested end to end without a GPU.
 */

export * from './core/session.js';
export * from './core/connect-client.js';
export * from './net/socket-transport.js';
