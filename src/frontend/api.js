/**
 * api.js — the two calls the admin page can make to the resolver.
 *
 * The transport is `createBridge()` from bridge.js (offline-safe). Each
 * function resolves with the resolver's payload or rejects with a structured
 * error; the JSX turns a rejection into a message on the page — never into a
 * silent empty screen.
 *
 * The two resolvers are defined in src/resolvers.js:
 *   - `scan`     : the real scan of the site (read-only);
 *   - `scanDemo` : the same engine on the bundled demo fixtures.
 */

const { createBridge } = require('./bridge.js');

/**
 * The scan of the site.
 *
 * @param {object} payload  { nom?, 'e-mail'? } — the optional personal values
 *                           the page lets you type in, to see them masked.
 */
function runScan(payload) {
  return createBridge().invoke('scan', payload || {});
}

/** The demo scan (no site, no account, no tenant). */
function runDemoScan(payload) {
  return createBridge().invoke('scanDemo', payload || {});
}

module.exports = { runScan, runDemoScan };
