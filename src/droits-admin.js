/**
 * Portal Accessibility Checker for JSM — THE ADMINISTRATOR CHECK, IN ONE PLACE.
 *
 * WHY THIS FILE EXISTS
 *
 * The app has TWO entry points that can produce a report about the customer's
 * site:
 *
 *   1. the administration page, through the resolver (src/resolvers.js) — the
 *      function module `resolver` of manifest.yml;
 *   2. the two Rovo MCP tools, through src/mcp.js — the function modules
 *      `mcp-scan` and `mcp-last-findings`, exposed by the `rovo:mcp` module.
 *
 * Both must apply THE SAME administrator check, made on the server, before any
 * read of the site. Two copies of that check would be two doors that could
 * drift apart, so there is only ONE implementation, in this file, and both
 * paths call it. This file is the single source of truth: the endpoint, the
 * permission keys and the fail-closed behaviour are written once.
 *
 * THE CHECK — the endpoint, and why this one
 *
 *   - ENDPOINT: `GET /rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN`
 *     "Get my permissions", Jira Cloud REST API v3, group "Permissions":
 *     https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-permissions/
 *     (consulted 09/11/2026). The endpoint answers with the permissions of
 *     the USER the request is made for; called through `asUser()`, that user
 *     is the person who pressed the button or asked the tool.
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
 * The identity used here is ALWAYS the caller's own (`asUser()`). The wider
 * identity of the app (`asApp()`) is never used anywhere in this application:
 * zero call, which `test-identite-cycle136.js` counts on the live code.
 */

const forgeApi = require('@forge/api');
const { route } = forgeApi;

/**
 * The global Jira permissions that mean "administrator of this site".
 * Both are GLOBAL permissions of Jira (measured on the app's own site with
 * GET /rest/api/3/permissions on 09/11/2026); they are the two roles that
 * give access to the administration area of Jira.
 */
const PERMISSIONS_ADMINISTRATION = ['ADMINISTER', 'SYSTEM_ADMIN'];

/**
 * The official endpoint that answers which permissions the caller holds.
 * It is asked with `asUser()`: the answer is about the person who called, not
 * about the app.
 */
const URL_PERMISSIONS = route`/rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN`;

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

/**
 * The refusal both entry points answer when the caller is not an
 * administrator. The wording is written once, so the page and the MCP tools
 * say exactly the same thing to the person who has to act on it.
 */
const REFUS_ADMINISTRATEUR = {
  ok: false,
  error: 'NOT_ADMINISTRATOR',
  message:
    'This scan is reserved to Jira administrators: the account signed in on this site does not hold the global permission "Administer Jira" (ADMINISTER). Nothing was read.',
};

/**
 * The same refusal, as the text an MCP tool returns.
 *
 * @param {string} raison the technical reason (refused, HTTP code, silent answer)
 * @returns {string}
 */
function refusAdministrateur(raison) {
  return raison ? REFUS_ADMINISTRATEUR.message + ' Reason: ' + raison : REFUS_ADMINISTRATEUR.message;
}

module.exports = {
  PERMISSIONS_ADMINISTRATION,
  URL_PERMISSIONS,
  REFUS_ADMINISTRATEUR,
  droitAdministration,
  refusAdministrateur,
};
