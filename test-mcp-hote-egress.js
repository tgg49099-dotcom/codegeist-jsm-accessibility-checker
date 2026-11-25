/**
 * test-mcp-hote-egress.js — THE TWO PROPERTIES THAT test-mcp-hote.js ASSERTS
 * BUT DOES NOT PROVE.
 *
 * WHY THIS SUITE EXISTS
 *
 * `test-mcp-hote.js` (delivered 25/11/2026) proves that the URL given to
 * `scan_accessibility` is refused when it names another site. Two of its
 * claims, however, are ASSERTED rather than PROVED, and a hostile re-reading
 * on 25/11/2026 (mutation after mutation, measured) showed that the suite
 * stays GREEN on mutants that break exactly these two claims:
 *
 *   * "H-07 the given URL is never fetched" — the harness only observes
 *     `api.fetch` and `api.asUser().requestJira`. Forge also offers
 *     `api.request(url)` (an external HTTP request) and the global `fetch`
 *     (the Fetch API is available in the Forge runtime), and NEITHER was
 *     observed: a mutant that called the given URL through either of them
 *     still answered "ALL PASS (17 checks)" while the URL was really fetched
 *     (12 calls recorded by an external stub).
 *   * "H-09 a non-administrator is refused BEFORE the URL is even looked at" —
 *     the suite proves that only the permission check left the app, but it
 *     does not prove that the payload's `url` was not READ before the
 *     refusal: a mutant that read `p.url` one line above the administrator
 *     check still answered "ALL PASS (17 checks)".
 *
 * WHAT THIS SUITE PROVES
 *
 *   E-01  the given URL is never fetched: EVERY egress path is observed —
 *         `api.fetch`, `api.request`, `api.asUser().request`,
 *         `api.asApp().request` and the global `fetch` — and the count must
 *         stay at zero.
 *   E-02  the source declares NO other way out: no `require('http')`,
 *         `require('https')`, `require('net')`, `require('dns')`, no
 *         `node-fetch`, no `XMLHttpRequest`, no `WebSocket`, no bare
 *         `fetch(` — so E-01 cannot be dodged by a path nobody watches.
 *   E-03  a non-administrator is refused BEFORE the URL is even READ: the
 *         payload's `url` is an ACCESSOR that records every access, and the
 *         refusal must come back with that recorder still untouched.
 *   E-04  the ORDER is proved, not assumed: a non-administrator who gives a
 *         URL of ANOTHER site gets the ADMINISTRATOR refusal — not the "this
 *         URL points to another site" one — which is only possible if the
 *         administrator check comes first.
 *   E-05  no REST path carries the given URL (the path never leaves the app).
 *
 * COUNTER-PROOFS (this suite must be able to say NO): src/mcp.js is copied
 * next to itself with ONE mutation, and the checks it is the counter-proof of
 * MUST turn red.
 *   CP-E-A  an egress through `api.request`        -> E-01 red
 *   CP-E-B  an egress through the global `fetch`    -> E-01 red
 *   CP-E-C  an egress through `asUser().request`    -> E-01 red
 *   CP-E-D  the URL read before the administrator check -> E-03 red
 *   CP-E-E  the URL block moved before the administrator check -> E-04 red
 *
 * Usage: node test-mcp-hote-egress.js      RC 0 = every check passes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const api = require('@forge/api');

const SRC = path.join(__dirname, 'src');
const LIVE_MCP = path.join(SRC, 'mcp.js');

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

// ---------------------------------------------------------------------------
// The simulated platform — every egress path is watched here.
// ---------------------------------------------------------------------------

const CHEMIN_PERMISSIONS = '/rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN';
const CHEMIN_SERVERINFO = '/rest/api/3/serverInfo';

let SCENARIO = {};
let DEMANDES = [];
let SORTIES = []; // every call that could leave the app, whatever its door

function reponse(status, body) {
  return { status: status, json: async () => body };
}
function cheminDe(p) {
  return String((p && p.value_) || p);
}
function noterSortie(porte, u) {
  SORTIES.push(porte + ' ' + String(u));
}

api.asUser = () => ({
  requestJira: async (p) => {
    const chemin = cheminDe(p);
    DEMANDES.push(chemin);
    const def = SCENARIO[chemin];
    if (!def) return reponse(404, { errorMessages: ['not found: ' + chemin] });
    return reponse(def.status, def.body);
  },
  // Forge also offers asUser().request(url): an external request made with
  // the caller's identity. The delivered suite did NOT watch this door.
  request: async (u) => {
    noterSortie('asUser().request', u);
    throw new Error('an external call is forbidden in this application (and in this test)');
  },
});
api.asApp = () => ({
  requestJira: async () => {
    throw new Error('asApp() is forbidden in this application (and in this test)');
  },
  request: async (u) => {
    noterSortie('asApp().request', u);
    throw new Error('an external call is forbidden in this application (and in this test)');
  },
});
api.fetch = async (u) => {
  noterSortie('api.fetch', u);
  throw new Error('an external call is forbidden in this application (and in this test)');
};
// api.request(url) is the other external door of the Forge API.
api.request = async (u) => {
  noterSortie('api.request', u);
  throw new Error('an external call is forbidden in this application (and in this test)');
};
// The Fetch API is available in the Forge runtime: the global fetch is a door
// too, and it must be watched as well.
const FETCH_NATIF = globalThis.fetch;
globalThis.fetch = async (u) => {
  noterSortie('globalThis.fetch', u);
  throw new Error('an external call is forbidden in this application (and in this test)');
};

function permissions(admin) {
  return {
    status: 200,
    body: {
      permissions: {
        ADMINISTER: { key: 'ADMINISTER', havePermission: admin },
        SYSTEM_ADMIN: { key: 'SYSTEM_ADMIN', havePermission: false },
      },
    },
  };
}

function site(baseUrl, admin) {
  return {
    [CHEMIN_PERMISSIONS]: permissions(admin !== false),
    [CHEMIN_SERVERINFO]: { status: 200, body: baseUrl ? { baseUrl: baseUrl } : {} },
    '/rest/servicedeskapi/info': { status: 200, body: { isLicensedForUse: true } },
    '/rest/servicedeskapi/servicedesk': { status: 200, body: { values: [] } },
  };
}

function estRapport(t) {
  return typeof t === 'string' && /Portal Accessibility Checker for JSM/.test(t) && /\nFindings:/.test(t);
}
function estRefusAdmin(t) {
  return typeof t === 'string' && /reserved to Jira administrators/i.test(t) && !estRapport(t);
}
function estRefusHote(t) {
  return typeof t === 'string' && /points to another site/.test(t) && !estRapport(t);
}

async function appel(mcp, scenario, payload) {
  SCENARIO = scenario;
  DEMANDES = [];
  SORTIES = [];
  let sortie;
  try {
    sortie = await mcp.scanAccessibility(payload, {});
  } catch (e) {
    sortie = 'EXCEPTION: ' + (e && e.message);
  }
  return String(sortie);
}

const SITE = 'https://demo.atlassian.net';
const PORTAIL = SITE + '/servicedesk/customer/portals';

// ---------------------------------------------------------------------------
// The static reading of the source: the doors nobody watches.
// ---------------------------------------------------------------------------

/**
 * The source without its comments: a comment that says "never fetch(" must
 * not be counted as a call. The scanner tracks the quotes so that a URL in a
 * string ('https://…') is not mistaken for the start of a comment.
 *
 * @param {string} texte
 * @returns {string}
 */
function sansCommentaires(texte) {
  let out = '';
  let i = 0;
  let dansChaine = null;
  while (i < texte.length) {
    const c = texte[i];
    const d = texte[i + 1];
    if (dansChaine) {
      out += c;
      if (c === '\\') {
        out += d || '';
        i += 2;
        continue;
      }
      if (c === dansChaine) dansChaine = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      dansChaine = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && d === '/') {
      while (i < texte.length && texte[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < texte.length && !(texte[i] === '*' && texte[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const PORTES_INTERDITES = [
  { nom: "require('http')", re: /require\(\s*['"]http['"]\s*\)/ },
  { nom: "require('https')", re: /require\(\s*['"]https['"]\s*\)/ },
  { nom: "require('net')", re: /require\(\s*['"]net['"]\s*\)/ },
  { nom: "require('dns')", re: /require\(\s*['"]dns['"]\s*\)/ },
  { nom: "require('tls')", re: /require\(\s*['"]tls['"]\s*\)/ },
  { nom: "require('node-fetch')", re: /require\(\s*['"]node-fetch['"]\s*\)/ },
  { nom: "require('axios')", re: /require\(\s*['"]axios['"]\s*\)/ },
  { nom: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
  { nom: 'WebSocket', re: /\bWebSocket\b/ },
  { nom: 'fetch( ', re: /\bfetch\s*\(/ },
  { nom: 'api.fetch(', re: /\bapi\s*\.\s*fetch\s*\(/ },
  { nom: 'api.request(', re: /\bapi\s*\.\s*request\s*\(/ },
];

/** The doors the source opens, other than the ones E-01 watches. */
function portesNonSurveillees(texte) {
  const code = sansCommentaires(texte);
  const trouvees = [];
  for (const p of PORTES_INTERDITES) if (p.re.test(code)) trouvees.push(p.nom);
  return trouvees;
}

// ---------------------------------------------------------------------------
// The checks, on a given mcp module. Returns { label: ok }.
// ---------------------------------------------------------------------------

async function verifier(mcp, afficher) {
  const r = {};
  const note = (label, ok, detail) => {
    r[label] = ok;
    if (afficher) check(label, ok, detail);
  };

  // --- E-01 / E-05 : the accepted path, with EVERY door watched ------------
  let s = await appel(mcp, site(SITE), { url: PORTAIL });
  note('E-01 the given URL is never fetched (every egress path watched)', SORTIES.length === 0, JSON.stringify(SORTIES.slice(0, 4)));
  note(
    'E-05 no REST path carries the given URL',
    DEMANDES.every((c) => !/servicedesk\/customer\/portals|https?:/.test(c)),
    JSON.stringify(DEMANDES.slice(0, 4))
  );

  // --- E-01 again, on the REFUSED path (a foreign URL must not be fetched
  //     either — the refusal must not "verify" the URL it refuses) ----------
  s = await appel(mcp, site(SITE), { url: 'https://other-company.atlassian.net/servicedesk/customer/portals' });
  note('E-01 a refused URL is not fetched either', SORTIES.length === 0, JSON.stringify(SORTIES.slice(0, 4)));

  // --- E-03 : the URL is not even READ before the administrator check -------
  let lectures = 0;
  const payloadSurveille = {};
  Object.defineProperty(payloadSurveille, 'url', {
    enumerable: true,
    get() {
      lectures += 1;
      return PORTAIL;
    },
  });
  s = await appel(mcp, site(SITE, false), payloadSurveille);
  note('E-03 a non-administrator is refused', estRefusAdmin(s), s.slice(0, 80));
  note('E-03 the URL was not even read before the refusal', lectures === 0, lectures + ' read(s)');

  // --- E-04 : the ORDER, proved by the message ------------------------------
  s = await appel(mcp, site(SITE, false), { url: 'https://other-company.atlassian.net/servicedesk/customer/portals' });
  note(
    'E-04 a non-administrator gets the ADMINISTRATOR refusal, not the "another site" one',
    estRefusAdmin(s) && !estRefusHote(s),
    s.slice(0, 110)
  );

  return r;
}

// ---------------------------------------------------------------------------
// Counter-proofs: a mutated copy of src/mcp.js, next to the real one.
// ---------------------------------------------------------------------------

async function contreEpreuve(nom, remplacements, doiventRougir) {
  let texte = fs.readFileSync(LIVE_MCP, 'utf8');
  for (const [depuis, vers] of remplacements) {
    if (!texte.includes(depuis)) {
      check(nom + ' : anchor found in src/mcp.js', false, depuis);
      return;
    }
    texte = texte.replace(depuis, vers);
  }
  const fichier = path.join(SRC, '.cp-mcp-egress-' + process.pid + '.js');
  fs.writeFileSync(fichier, texte, 'utf8');
  try {
    delete require.cache[require.resolve(fichier)];
    const r = await verifier(require(fichier), false);
    const rouges = doiventRougir.filter((l) => r[l] === false);
    check(
      nom + ' : the mutation turns ' + doiventRougir.length + ' check(s) red',
      rouges.length === doiventRougir.length,
      rouges.length + '/' + doiventRougir.length + ' red'
    );
  } finally {
    fs.unlinkSync(fichier);
  }
}

const ANCRE_URL = `  const url = typeof p.url === 'string' ? p.url.trim() : '';
  const hostUrl = hote(url);
  if (!hostUrl) return REFUS_URL_INVALIDE;
  const autorises = hotesAutorises(sonde.host, hotesDuContexte(p, context));
  if (!autorises.includes(hostUrl)) {
    return REFUS_HOTE_DIFFERENT.replace('{SITE}', autorises.join(', ') || 'the site of the app').replace(
      '{URL}',
      url
    );
  }
`;

const ANCRE_ADMIN = `  const droit = await droitsAdmin.droitAdministration();
  if (!droit.ok) return droitsAdmin.refusAdministrateur(droit.raison);
`;

// The three steps, as they stand in src/mcp.js (administrator check, then the
// caller probe, then the URL). CP-E-E puts them in another order.
const ANCRE_REGION = `  // 0. THE ADMINISTRATOR CHECK — the same control as the administration page,
  //    made BEFORE any read of the site, with the caller's own identity.
  //    It fails closed: a refusal, a non-200 answer or a silent answer means
  //    no report at all.
  const droit = await droitsAdmin.droitAdministration();
  if (!droit.ok) return droitsAdmin.refusAdministrateur(droit.raison);

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
`;

// The same steps, with the URL compared BEFORE the administrator check.
const REGION_REORDONNEE = `  // 1. The caller.
  const sonde = await sonderAppareil();
  if (!sonde.ok) return sonde.raison;

  // 2. The URL.
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

  // 0. THE ADMINISTRATOR CHECK — moved after the URL.
  const droit = await droitsAdmin.droitAdministration();
  if (!droit.ok) return droitsAdmin.refusAdministrateur(droit.raison);
`;

(async () => {
  console.log('== Live state: src/mcp.js');
  await verifier(require(LIVE_MCP), true);

  console.log('== E-02 the doors the source opens');
  const source = fs.readFileSync(LIVE_MCP, 'utf8');
  const portes = portesNonSurveillees(source);
  check('E-02 the source declares no other door out', portes.length === 0, JSON.stringify(portes));

  console.log('== Counter-proofs');
  // A counter-proof that throws must PRINT a FAIL, never crash the suite:
  // a harness that dies cannot tell "detected" from "broken".
  const contre = async (nom, construire, doiventRougir) => {
    try {
      await contreEpreuve(nom, construire(), doiventRougir);
    } catch (e) {
      check(nom + ' : the counter-proof ran without crashing', false, String((e && e.message) || e));
    }
  };
  await contre(
    'CP-E-A (egress through api.request)',
    () => [[ANCRE_URL, ANCRE_URL + '\n  try { await api.request(url); } catch (e) { /* ignore */ }\n']],
    ['E-01 the given URL is never fetched (every egress path watched)']
  );
  await contre(
    'CP-E-B (egress through the global fetch)',
    () => [[ANCRE_URL, ANCRE_URL + '\n  try { await globalThis.fetch(url); } catch (e) { /* ignore */ }\n']],
    ['E-01 the given URL is never fetched (every egress path watched)']
  );
  await contre(
    'CP-E-C (egress through asUser().request)',
    () => [[ANCRE_URL, ANCRE_URL + '\n  try { await api.asUser().request(url); } catch (e) { /* ignore */ }\n']],
    ['E-01 the given URL is never fetched (every egress path watched)']
  );
  await contre(
    'CP-E-D (the URL read before the administrator check)',
    () => [[ANCRE_ADMIN, '  const _luAvantLeCheckAdmin = p.url;\n' + ANCRE_ADMIN]],
    ['E-03 the URL was not even read before the refusal']
  );
  await contre(
    'CP-E-E (the URL block moved before the administrator check)',
    () => [[ANCRE_REGION, REGION_REORDONNEE]],
    ['E-04 a non-administrator gets the ADMINISTRATOR refusal, not the "another site" one']
  );

  if (failures === 0) {
    console.log('== ALL PASS (' + checks + ' checks): the URL is never fetched, and never even read before the refusal ==');
    process.exit(0);
  }
  console.log('== ' + failures + ' FAIL(S) out of ' + checks + ' checks ==');
  process.exit(1);
})();
