/**
 * bridge.js — the transport between the admin page and the Forge resolver.
 *
 * Pure JS (no JSX, no React), so it can be required both by the JSX files
 * and by the offline test harness.
 *
 * WHY THIS FILE LOOKS THE WAY IT DOES (the sibling app was bitten by it):
 *
 *   1. `@forge/bridge` calls `getCallBridge()` AT IMPORT TIME and THROWS a
 *      BridgeAPIError when `globalThis.__bridge` is absent. The require must
 *      therefore be LAZY: the offline harness runs in plain Node where there
 *      is no `__bridge`, and a top-level require would throw before the suite
 *      could even start.
 *   2. Because the import can fail while the runtime IS present, the
 *      fallback must be keyed on the RUNTIME (`globalThis.__bridge`), never
 *      on the result of the import. "The import failed, carry on offline" is
 *      the failure that hid for 60 cycles in the sibling app.
 *
 * The documented path is `import { invoke } from '@forge/bridge'`
 * https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/invoke/
 */

function runtimeIsPresent() {
  return (
    typeof globalThis !== 'undefined' &&
    !!globalThis.__bridge &&
    typeof globalThis.__bridge.callBridge === 'function'
  );
}

function rejectWith(name, message, resolver, payload) {
  return Promise.reject({
    name: name,
    message: message,
    resolver: resolver,
    payload: payload || null,
  });
}

function offlineBridge(resolver, payload) {
  return rejectWith(
    'BRIDGE_UNAVAILABLE',
    'The Forge runtime is not available in this context. This call would normally reach the ' +
      resolver +
      ' resolver.',
    resolver,
    payload
  );
}

function loadFailedBridge(reason) {
  return {
    invoke(resolver, payload) {
      return rejectWith(
        'BRIDGE_LOAD_FAILED',
        'The Forge Custom UI bridge is present (globalThis.__bridge.callBridge exists) but @forge/bridge could not be imported: ' +
          reason,
        resolver,
        payload
      );
    },
  };
}

function createBridge() {
  if (!runtimeIsPresent()) {
    return {
      invoke(resolver, payload) {
        return offlineBridge(resolver, payload);
      },
    };
  }

  let invoke;
  try {
    invoke = require('@forge/bridge').invoke;
  } catch (err) {
    return loadFailedBridge((err && err.message) || String(err) || '(no message)');
  }
  if (typeof invoke !== 'function') {
    return loadFailedBridge('it exports no invoke() function');
  }
  return { invoke: invoke };
}

/** True in a Forge Custom UI iframe, false in plain Node. */
function isAvailable() {
  return runtimeIsPresent();
}

module.exports = { createBridge, isAvailable, runtimeIsPresent };
