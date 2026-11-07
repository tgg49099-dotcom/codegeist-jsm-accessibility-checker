/**
 * Portal Accessibility Checker for JSM — RESOLVER (the app's only entry point).
 *
 * CYCLE 128 (05/11/2026). This file REPLACES the public trigger.
 *
 * BEFORE: the manifest declared a trigger module whose request was
 * UNAUTHENTICATED (`authentication: none`). Anyone who knew the URL could run
 * a scan of the customer's site and read the findings in clear text — a
 * public endpoint reading a customer's tenant.
 *
 * NOW: the manifest declares a `jira:adminPage` module (see manifest.yml).
 * The platform only renders that page for a logged-in Jira administrator, and
 * the resolver below is the ONLY way to reach the scan:
 *
 *   - there is NO public module left in the manifest (this is checkable by
 *     reading manifest.yml: `modules:` has exactly two entries, an interface
 *     module and a function module);
 *   - the resolver answers ONLY to a call made from the administration page of
 *     the signed-in user, and it returns the findings to that user only;
 *   - the scan reads the site with the app's own read-only scopes
 *     (`read:jira-work`, `read:servicedesk-request`), writes nothing, and
 *     calls no external service.
 *
 * NO DUPLICATION: `scan()` and `scanDemo()` call the engine in src/index.js
 * (`lancerScan` / `rapportDemo`) — the very same code, the very same rules
 * (src/regles.js) and the very same REST reads that the old public trigger
 * used. This file adds the caller check and the transport; it does not
 * re-implement a single rule.
 */

const { makeResolver } = require('@forge/resolver');

const moteur = require('./index.js');

/**
 * The personal values the page may send (fields `nom` and `e-mail`).
 * They are collected exactly like the old HTTP contract did, and the engine
 * masks them in the report it returns: a value received in the request is
 * never returned in clear text.
 */
function valeursRecues(payload) {
  return moteur.champsPvRecus({ body: payload || {} });
}

/**
 * The identity of the caller.
 *
 * Two sources, in this order:
 *   1. `backendRuntimePayload.principal.accountId` — the account of the user
 *      the call is made on behalf of. This is what @forge/resolver itself
 *      uses to build `context.accountId`;
 *   2. `context.accountId` — the account the platform put in the call
 *      context (same value, another carrier).
 *
 * A call without any of them is NOT a call from a signed-in user, and the
 * scan does not run. The check fails closed: an unknown caller gets a
 * refusal, never a report.
 */
function identite(req, backendRuntimePayload) {
  const principal = (backendRuntimePayload && backendRuntimePayload.principal) || {};
  const context = (req && req.context) || {};
  return principal.accountId || context.accountId || null;
}

/**
 * The runtime payload handed to @forge/resolver, with the caller's account
 * guaranteed to be present.
 *
 * @forge/resolver computes `context.accountId` from
 * `backendRuntimePayload.principal.accountId` — and ONLY from there. When the
 * platform carries the account in the call context instead, this copy moves
 * it to where the library looks, so the identity cannot be lost between the
 * two carriers. The original object is never modified.
 */
function runtimeAvecIdentite(req, backendRuntimePayload) {
  const runtime = Object.assign({}, backendRuntimePayload || {});
  const principal = Object.assign({}, runtime.principal || {});
  // UNE seule source de vérité pour l'identité : `identite()`. Le compte
  // trouvé par les deux canaux est recopié là où @forge/resolver le lit.
  const accountId = identite(req, backendRuntimePayload);
  if (accountId) principal.accountId = accountId;
  runtime.principal = principal;
  return runtime;
}

const REPONSE_NON_AUTHENTIFIE = {
  ok: false,
  error: 'NOT_AUTHENTICATED',
  message:
    'The scan can only be started by a logged-in Jira user, from the administration page of this app.',
};

const REPONSE_FONCTION_INCONNUE = {
  ok: false,
  error: 'UNKNOWN_FUNCTION',
  message: 'This app only answers the "scan" and "scanDemo" functions.',
};

/**
 * The scan of the site.
 *
 * @param {object} req  { payload, context } — the shape @forge/resolver gives
 * @returns {Promise<object>} { ok, requestedBy, report, csv }
 */
async function scan(req) {
  const payload = (req && req.payload) || {};
  const context = (req && req.context) || {};
  const accountId = context.accountId || null;
  if (!accountId) return Object.assign({}, REPONSE_NON_AUTHENTIFIE);

  const pvRecus = valeursRecues(payload);
  const report = await moteur.lancerScan({ pvRecus });
  return {
    ok: true,
    requestedBy: { accountId },
    report,
    csv: moteur.csvRapport(report),
  };
}

/**
 * The demo scan: the SAME engine run on the 6 bundled fixtures. No site, no
 * account, no tenant — useful to try the app before pointing it at a portal.
 *
 * @param {object} req  { payload, context }
 * @returns {Promise<object>} { ok, requestedBy, report, csv }
 */
async function scanDemo(req) {
  const payload = (req && req.payload) || {};
  const context = (req && req.context) || {};
  const accountId = context.accountId || null;
  if (!accountId) return Object.assign({}, REPONSE_NON_AUTHENTIFIE);

  const pvRecus = valeursRecues(payload);
  const report = moteur.rapportDemo({ pvRecus });
  return {
    ok: true,
    requestedBy: { accountId },
    report,
    csv: moteur.csvRapport(report),
  };
}

// The named resolvers the page can call: invoke('scan', …) / invoke('scanDemo', …)
const definitions = makeResolver({ scan, scanDemo });

/**
 * The handler the manifest points at (`function: resolver`).
 *
 * The platform calls this handler in two different ways:
 *   1. when it RENDERS the administration page — there is no `call` then,
 *      and there is nothing to compute: the page asks for the scan itself
 *      when the user clicks the button;
 *   2. when the page calls `invoke('scan', payload)` — there is a `call` with
 *      a `functionKey` and a `payload`.
 *
 * Both are handled explicitly, so a call without a function key can never
 * throw.
 */
exports.handler = async function handler(req, backendRuntimePayload) {
  const call = req && req.call;
  if (!call || typeof call.functionKey !== 'string') {
    return {
      ok: true,
      page: 'admin',
      application: 'Portal Accessibility Checker for JSM',
      message:
        'Ready. The scan runs when the signed-in administrator clicks the button.',
    };
  }
  if (call.functionKey !== 'scan' && call.functionKey !== 'scanDemo') {
    // @forge/resolver throws on an unknown function key; we answer a
    // structured refusal instead, so the page can display it.
    return Object.assign({}, REPONSE_FONCTION_INCONNUE);
  }
  const accountId = identite(req, backendRuntimePayload);
  if (!accountId) return Object.assign({}, REPONSE_NON_AUTHENTIFIE);
  return definitions(req, runtimeAvecIdentite(req, backendRuntimePayload));
};

// Exported for the offline test harness (no effect at runtime).
exports._scan = scan;
exports._scanDemo = scanDemo;
exports._identite = identite;
