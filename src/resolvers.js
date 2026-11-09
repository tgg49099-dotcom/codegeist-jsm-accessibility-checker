/**
 * Portal Accessibility Checker for JSM — the resolver (the app's only entry point).
 *
 * WHAT THIS FILE IS
 *
 * The manifest declares four module types (see manifest.yml): a
 * `jira:adminPage` interface, a `function` module, an `action` module (the
 * two MCP tools) and a `rovo:mcp` module (the Atlassian MCP server that
 * exposes them). This file is the `function` module behind the page, and it
 * is the ONLY code path to the scan. It enforces
 * three rules, in this order:
 *
 *   1. THE CALLER MUST BE SIGNED IN. A call that carries no account id is
 *      refused.
 *   2. THE CALLER MUST BE A JIRA ADMINISTRATOR. The check is made HERE, on
 *      the server, with the caller's own identity — never in the page. A page
 *      is a display: whoever can call the function directly would otherwise
 *      receive the findings of the customer's site, so the decision belongs
 *      to the resolver.
 *   3. THE SITE IS READ WITH THE CALLER'S OWN PERMISSIONS (`asUser`) and the
 *      two read-only scopes (`read:jira-work`, `read:servicedesk-request`).
 *      The app writes nothing and calls no external service.
 *
 * There is no public module: every module declared in manifest.yml is
 * reachable only from an authenticated session, so there is no URL anybody can
 * call without an account.
 *
 * THE ADMINISTRATOR CHECK — the endpoint, and why this one
 *
 *   - ENDPOINT: `GET /rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN`
 *     "Get my permissions", Jira Cloud REST API v3, group "Permissions":
 *     https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-permissions/
 *     (consulted 09/11/2026). The endpoint answers with the permissions of
 *     the USER the request is made for; called through `asUser()`, that user
 *     is the person who clicked the button.
 *   - THE PERMISSION KEYS are the global ones this same official endpoint
 *     lists for a Jira site (GET /rest/api/3/permissions, HTTP 200 measured
 *     on the app's own site on 09/11/2026):
 *       ADMINISTER  = "Administer Jira"                (type GLOBAL)
 *       SYSTEM_ADMIN = "Jira System Administrators"     (type GLOBAL)
 *     No other name is used: a key that does not exist would simply answer
 *     "no permission" for everybody.
 *   - NO NEW SCOPE IS NEEDED: the official page lists the classic scope
 *     `read:jira-work` as the (recommended) OAuth scope of that endpoint,
 *     and the app already declares it — so manifest.yml is unchanged and
 *     nothing has to be reinstalled.
 *   - THE CHECK FAILS CLOSED. If the platform refuses the call (401/403), if
 *     the answer says nothing about the administration permissions, or if it
 *     cannot be read, the scan does not run: the caller gets a refusal, and
 *     never a report.
 *   - THE DEMO SCAN reads no site: it replays the bundled fixtures, so it
 *     stays available to any signed-in user. `test-admin-cycle139.js` pins
 *     that difference.
 *
 * NO DUPLICATION: `scan()` and `scanDemo()` call the engine in src/index.js
 * (`lancerScan` / `rapportDemo`) — the very same code, the very same rules
 * (src/regles.js) and the very same REST reads, for the demo and for a real
 * site. This file adds the caller checks and the transport; it does not
 * re-implement a single rule.
 */

const { makeResolver } = require('@forge/resolver');
// The whole module, not a destructured `api`: `@forge/api` exports `asUser`,
// `asApp` and `route` at the top level (there is no `api` export — `api` is
// the name of the runtime global, not of the package).
const forgeApi = require('@forge/api');
const { route } = forgeApi;

const moteur = require('./index.js');

/**
 * The global Jira permissions that mean "administrator of this site".
 * Both are GLOBAL permissions of Jira (measured on the app's own site with
 * GET /rest/api/3/permissions on 09/11/2026); they are the two roles that
 * give access to the administration area of Jira.
 */
const PERMISSIONS_ADMINISTRATION = ['ADMINISTER', 'SYSTEM_ADMIN'];

/**
 * The official endpoint that answers which permissions the caller holds.
 * It is asked with `asUser()`: the answer is about the person who clicked
 * the button, not about the app.
 */
const URL_PERMISSIONS = route`/rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN`;

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

/**
 * Whether the caller is a Jira administrator.
 *
 * The answer comes from Jira itself, asked with the caller's own identity:
 * `GET /rest/api/3/mypermissions` returns the permissions of the user the
 * request is made for. The caller's account id is NOT sent and cannot be
 * forged: it is the account the platform authenticates.
 *
 * @returns {Promise<{ok: boolean, permission: string, raison: string}>}
 */
async function droitAdministration() {
  let reponse;
  try {
    reponse = await forgeApi.asUser().requestJira(URL_PERMISSIONS);
  } catch (e) {
    return {
      ok: false,
      permission: '',
      raison: 'the platform refused the administrator check: ' + ((e && e.message) || String(e)),
    };
  }

  const status = reponse && reponse.status;
  if (status !== 200) {
    return {
      ok: false,
      permission: '',
      raison: 'the administrator check answered HTTP ' + status,
    };
  }

  let corps = null;
  try {
    corps = await reponse.json();
  } catch (e) {
    corps = null;
  }
  const permissions = (corps && corps.permissions) || {};

  for (const cle of PERMISSIONS_ADMINISTRATION) {
    const reponsePermission = permissions[cle];
    if (reponsePermission && reponsePermission.havePermission === true) {
      return { ok: true, permission: cle, raison: '' };
    }
  }

  return {
    ok: false,
    permission: '',
    raison:
      'the signed-in account holds none of the global administration permissions (' +
      PERMISSIONS_ADMINISTRATION.join(', ') +
      ')',
  };
}

const REPONSE_NON_AUTHENTIFIE = {
  ok: false,
  error: 'NOT_AUTHENTICATED',
  message:
    'The scan can only be started by a logged-in Jira user, from the administration page of this app.',
};

const REPONSE_NON_ADMINISTRATEUR = {
  ok: false,
  error: 'NOT_ADMINISTRATOR',
  message:
    'This scan is reserved to Jira administrators: the account signed in on this site does not hold the global permission "Administer Jira" (ADMINISTER). Nothing was read.',
};

const REPONSE_FONCTION_INCONNUE = {
  ok: false,
  error: 'UNKNOWN_FUNCTION',
  message: 'This app only answers the "scan" and "scanDemo" functions.',
};

/**
 * The scan of the site.
 *
 * The administrator check is made BEFORE any read of the site: a caller who
 * is not an administrator gets a refusal and the site is never touched.
 *
 * @param {object} req  { payload, context } — the shape @forge/resolver gives
 * @returns {Promise<object>} { ok, requestedBy, report, csv } or a refusal
 */
async function scan(req) {
  const payload = (req && req.payload) || {};
  const context = (req && req.context) || {};
  const accountId = context.accountId || null;
  if (!accountId) return Object.assign({}, REPONSE_NON_AUTHENTIFIE);

  const droit = await droitAdministration();
  if (!droit.ok) {
    return Object.assign({}, REPONSE_NON_ADMINISTRATEUR, { detail: droit.raison });
  }

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
 * It reads nothing, so it stays available to any signed-in user.
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
exports._droitAdministration = droitAdministration;
exports._PERMISSIONS_ADMINISTRATION = PERMISSIONS_ADMINISTRATION;
