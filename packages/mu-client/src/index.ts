/**
 * @mu-reengineer/client — headless game core (session, connect-server client, node TCP transport).
 *
 * The browser renderer lives in `src/browser/*` and is bundled by Vite; it is deliberately not
 * exported from this barrel so node consumers (tests, gateway, tools) never pull in three.js.
 */

export * from './core/session.js';
export * from './core/connect-client.js';
export * from './net/socket-transport.js';
export * from './net/tcp-session.js';
export * from './browser/transport.js';
