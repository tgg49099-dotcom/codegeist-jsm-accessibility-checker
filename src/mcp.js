/**
 * Portal Accessibility Checker for JSM — Rovo MCP TOOLS (cycle 134, 09/11/2026).
 *
 * WHY THIS FILE EXISTS
 *
 * The Codegeist 2026 bonus "Best app with Atlassian MCP" asks for "a Forge
 * app that exposes tools via the Atlassian MCP server using the rovo:mcp
 * module" (rules read on https://codegeist2026.devpost.com/rules). The
 * manifest therefore declares ONE `rovo:mcp` module — Atlassian allows at
 * most one per app — that exposes TWO actions as tools:
 *
 *   * `scan_accessibility(url)` — runs the WCAG 2.2 AA scan and returns the
 *     report (findings, the endpoints that were read, the limits).
 *   * `list_last_findings()` — returns only the findings, as a compact list.
 *
 * WHAT THE TOOLS DO, AND WHAT THEY DO NOT DO
 *
 *  * They read the Atlassian site where the app is installed, with the
 *    CALLER's own permissions (`asUser`), through the app's two READ-ONLY
 *    scopes (`read:jira-work`, `read:servicedesk-request`). A tool that an
 *    agent can call must never read what the person calling it cannot read
 *    themselves — that is why the identity is taken from the platform, never
 *    from a value the model produced.
 *  * They write nothing, store nothing, and call no external service: they
 *    run the SAME engine as the administration page (src/index.js) on the
 *    SAME rules (src/regles.js). Not one rule is re-implemented here.
 *  * They never read another tenant. The platform binds an app to the site
 *    where it is installed; the URL given to `scan_accessibility` is CHECKED
 *    against that site and is never fetched.
 *
 * The two existing modules of the app (`jira:adminPage` + `function`) are not
 * touched: the administration page behaves exactly as before.
 */

const api = require('@forge/api');
const { route } = require('@forge/api');

const moteur = require('./index.js');

// ---------------------------------------------------------------------------
// Constants — the texts the agent reads are part of the contract.
// ---------------------------------------------------------------------------

const TITRE = 'Portal Accessibility Checker for JSM — WCAG 2.2 AA';

const REFUS_URL_INVALIDE =
  'No usable portal URL was given. Give the absolute URL of the customer portal, for example ' +
  'https://your-site.atlassian.net/servicedesk/customer/portals .';

const REFUS_HOTE_DIFFERENT =
  'This tool only scans the customer portal of the Atlassian site where the app is installed ' +
  '({SITE}). The URL given points to another site ({URL}), so nothing was scanned. Give a URL ' +
  'of {SITE}.';

/**
 * The refusal returned when the platform refuses the caller's own token.
 * Atlassian documents this case: an `asUser()` call can fail when the
 * caller has no app consent entry (see "Read Jira issues with a Rovo MCP
 * tool": "Without this consent entry, asUser() calls can fail when invoked
 * remotely"). The message says what to do instead of hiding the failure —
 * and the tool stays on the safe identity: it never falls back to a wider one.
 */
function refusAutorisation(status) {
  return (
    'The scan could not be run with your own permissions (the platform answered HTTP ' +
    status +
    '). Your account has not authorised this app to read the site on your behalf. ' +
    'Ask a Jira administrator to grant the app access (Apps > Manage apps > ' +
    'Portal Accessibility Checker for JSM > Allow access), and accept the app in your own ' +
    'Connected apps (id.atlassian.com/manage-profile/apps) if you call the tool from an ' +
    'external client. Then call the tool again. Nothing was read.'
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The host of an absolute URL, or null when the string is not an absolute URL.
 * @param {string} url
 * @returns {string|null}
 */
function hote(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    return new URL(url.trim()).hostname.toLowerCase() || null;
  } catch (e) {
    return null;
  }
}

/**
 * The hosts of the Atlassian app context carried by the platform (the issue
 * or the page the caller was looking at). They are platform values, so they
 * are trustworthy — unlike the inputs.
 *
 * @param {object} payload
 * @param {object} context
 * @returns {string[]}
 */
function hotesDuContexte(payload, context) {
  const ctx = (context && typeof context === 'object') ? context : {};
  const pctx =
    (payload && payload.context && typeof payload.context === 'object') ? payload.context : {};
  const liste = [];
  for (const source of [ctx, pctx]) {
    for (const app of ['jira', 'confluence']) {
      const url = source[app] && source[app].url;
      const h = typeof url === 'string' ? hote(url) : null;
      if (h && !liste.includes(h)) liste.push(h);
    }
  }
  return liste;
}

/**
 * The probe that gates everything.
 *
 * It calls `/rest/api/3/serverInfo` WITH THE CALLER'S OWN TOKEN (`asUser`).
 * A 200 answer proves that there IS a signed-in caller the platform accepts
 * for this app, and it returns the base URL of the site — the tenant the app
 * is installed on. A 401/403 is the platform refusing: the tool refuses too
 * (fail closed), it never falls back to a wider identity.
 *
 * `serverInfo` is used on purpose: `/rest/api/3/myself` would need the extra
 * `read:jira-user` scope, and this app must not ask for a new consent. The
 * authorisation to READ the content of the site is not assumed here: it is
 * checked afterwards, on the reads of the scan itself (`autorisationRefusee`).
 *
 * @returns {Promise<{ok: boolean, status: number, host: string|null, raison: string|null}>}
 */
async function sonderAppareil() {
  let res = null;
  try {
    res = await api.asUser().requestJira(route`/rest/api/3/serverInfo`);
  } catch (e) {
    return {
      ok: false,
      status: 0,
      host: null,
      raison:
        'The Atlassian API could not be called: ' + (e && e.message ? e.message : String(e)),
    };
  }
  const status = res && typeof res.status === 'number' ? res.status : 0;
  if (status !== 200) {
    return {
      ok: false,
      status,
      host: null,
      raison:
        status === 401 || status === 403
          ? refusAutorisation(status)
          : 'The Atlassian API answered HTTP ' + status + '.',
    };
  }
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  const baseUrl = body && typeof body.baseUrl === 'string' ? body.baseUrl : null;
  return {
    ok: true,
    status,
    host: hote(baseUrl),
    raison: null,
  };
}

/**
 * TRUE when every read of the scan was refused with 401/403: the caller is
 * authenticated but is not allowed to read the content of the site. The tool
 * then refuses instead of returning an empty report that would look like a
 * site without any accessibility problem.
 *
 * Only the REAL reads count. The report also carries a synthetic line — the
 * union of the fields shown on the create screens — which has a `note` and a
 * hard-coded 200 because no HTTP call was made for it; counting it would
 * hide a refusal.
 *
 * @param {object} sources  the `read` section of the report
 * @returns {number|null} the HTTP status, or null when the reads succeeded
 */
function autorisationRefusee(sources) {
  const cles = Object.keys(sources || {}).filter((cle) => !(sources[cle] || {}).note);
  if (!cles.length) return null;
  for (const cle of cles) {
    const statut = (sources[cle] || {}).httpStatus;
    if (statut !== 401 && statut !== 403) return null;
  }
  return (sources[cles[0]] || {}).httpStatus;
}

/**
 * The hosts a portal URL may point to: the host of the site the app is
 * installed on, plus the hosts the platform carried in the call context.
 *
 * @param {string|null} hostSite
 * @param {string[]} hotesContexte
 * @returns {string[]}
 */
function hotesAutorises(hostSite, hotesContexte) {
  const liste = [];
  if (hostSite) liste.push(hostSite);
  for (const h of hotesContexte || []) if (!liste.includes(h)) liste.push(h);
  return liste;
}

/** One finding, as one line + one detail line. */
function ligneConstat(f, i) {
  const critere = f.critere || '?';
  const niveau = f.niveau || '?';
  const ou = f.ou || f.ressource || '';
  const emplacement = f.emplacement ? ' — ' + f.emplacement : '';
  return String(i + 1) + '. [' + critere + ' | ' + niveau + '] ' + ou + emplacement + '\n   ' + (f.message || '');
}

/** The findings, as a compact list. */
function rendreConstats(findings) {
  if (!findings.length) {
    return 'No finding: the checks that can be verified through the REST API found nothing on this site.';
  }
  return findings.map(ligneConstat).join('\n');
}

/** How many findings of each level. */
function compterNiveaux(findings) {
  let aa = 0;
  let a = 0;
  for (const f of findings) {
    if (f.niveau === 'AA') aa += 1;
    else if (f.niveau === 'A') a += 1;
  }
  return { aa, a };
}

/**
 * The endpoints that were read — their path and their HTTP status, NEVER
 * their content: the content of the site is what the app checks, and it goes
 * back to the caller, not into a tool output that may travel to a
 * third-party MCP client.
 */
function rendreSources(sources) {
  const lignes = [];
  for (const chemin of Object.keys(sources || {})) {
    const s = sources[chemin] || {};
    lignes.push(
      '  - ' + chemin + ' -> HTTP ' + (s.httpStatus === undefined ? '?' : s.httpStatus)
    );
  }
  return lignes.length ? lignes.join('\n') : '  (none)';
}

/** The mode of the scan, in words. */
function nommerMode(mode) {
  if (mode === 'jsm') return 'jsm — Jira Service Management is active on this site';
  if (mode === 'jira-fallback')
    return 'jira-fallback — Jira Service Management is not active on this site, the same checks run on Jira issues';
  return String(mode || '?');
}

// ---------------------------------------------------------------------------
// Tool 1 — scan_accessibility(url)
// ---------------------------------------------------------------------------

/**
 * Runs the scan of the site where the app is installed and returns the
 * report.
 *
 * @param {object} payload  { url, context? }
 * @param {object} context
 * @returns {Promise<string>} the report, as text the agent can relay
 */
async function scanAccessibility(payload, context) {
  const p = payload && typeof payload === 'object' ? payload : {};

  // 1. The caller. The gate is the platform's own answer (the asUser probe),
  //    never a value the model produced.
  const sonde = await sonderAppareil();
  if (!sonde.ok) return sonde.raison;

  // 2. The URL. It must point to the site the app is installed on; it is
  //    NEVER fetched, only compared.
  const url = typeof p.url === 'string' ? p.url.trim() : '';
  const hostUrl = hote(url);
  if (!hostUrl) return REFUS_URL_INVALIDE;
  const autorises = hotesAutorises(sonde.host, hotesDuContexte(p, context));
  if (!autorises.includes(hostUrl)) {
    return REFUS_HOTE_DIFFERENT.replace('{SITE}', autorises.join(', ') || 'the site of the app').replace(
      '{URL}',
      url
    );
  }

  // 3. The scan, with the caller's own permissions.
  const rapport = await moteur.lancerScan({ pvRecus: {}, asUser: true });

  // 4. If the platform refused every read, the caller cannot read the site:
  //    say so instead of returning an empty report.
  const refus = autorisationRefusee(rapport.read);
  if (refus !== null) return refusAutorisation(refus);

  const findings = rapport.findings || [];
  const niveaux = compterNiveaux(findings);

  const lignes = [];
  lignes.push(TITRE);
  lignes.push('Site: ' + (sonde.host || '(unknown host)'));
  lignes.push('Mode: ' + nommerMode(rapport.mode));
  lignes.push('Findings: ' + findings.length + ' (AA: ' + niveaux.aa + ', A: ' + niveaux.a + ')');
  lignes.push('');
  lignes.push(rendreConstats(findings));
  lignes.push('');
  lignes.push('Read (paths and status only, no content):');
  lignes.push(rendreSources(rapport.read));
  lignes.push('');
  lignes.push('Limits: ' + (rapport.limites || []).join(' | '));
  lignes.push('Privacy: ' + (rapport.privacy && rapport.privacy.statement ? rapport.privacy.statement : ''));
  lignes.push("Identity: the site was read with the caller's own Jira permissions; nothing was stored.");
  return lignes.join('\n');
}

// ---------------------------------------------------------------------------
// Tool 2 — list_last_findings()
// ---------------------------------------------------------------------------

/**
 * The findings of the caller's site, as a compact list.
 *
 * The app stores nothing — that is published in its privacy notice — so it
 * keeps NO history of the scans it has run. This tool therefore returns the
 * findings that are CURRENT at the time of the call: it reads the same
 * read-only sources as `scan_accessibility`, with the caller's own
 * permissions, and returns the list. It says so, rather than pretending a
 * history exists.
 *
 * @param {object} payload
 * @param {object} context
 * @returns {Promise<string>} the findings, as text the agent can relay
 */
async function listLastFindings(payload, context) {
  const sonde = await sonderAppareil();
  if (!sonde.ok) return sonde.raison;

  const rapport = await moteur.lancerScan({ pvRecus: {}, asUser: true });

  const refus = autorisationRefusee(rapport.read);
  if (refus !== null) return refusAutorisation(refus);

  const findings = rapport.findings || [];
  const niveaux = compterNiveaux(findings);

  const lignes = [];
  lignes.push(TITRE + ' — current findings');
  lignes.push('Site: ' + (sonde.host || '(unknown host)'));
  lignes.push('Mode: ' + nommerMode(rapport.mode));
  lignes.push('Findings: ' + findings.length + ' (AA: ' + niveaux.aa + ', A: ' + niveaux.a + ')');
  lignes.push('');
  lignes.push(rendreConstats(findings));
  lignes.push('');
  lignes.push(
    'No history: this app stores nothing and keeps no record of the scans it has run, so these are ' +
      'the findings current at the time of this call (scanned at ' +
      (rapport.generatedAt || '?') +
      ').'
  );
  lignes.push("Identity: the site was read with the caller's own Jira permissions.");
  return lignes.join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// The two tools, as the manifest's `function` modules point at them.
exports.scanAccessibility = scanAccessibility;
exports.listLastFindings = listLastFindings;

// Exported for the offline test harness (no effect at runtime).
exports._hote = hote;
exports._hotesDuContexte = hotesDuContexte;
exports._hotesAutorises = hotesAutorises;
exports._sonderAppareil = sonderAppareil;
exports._autorisationRefusee = autorisationRefusee;
exports._rendreConstats = rendreConstats;
exports._compterNiveaux = compterNiveaux;
exports._refusAutorisation = refusAutorisation;
