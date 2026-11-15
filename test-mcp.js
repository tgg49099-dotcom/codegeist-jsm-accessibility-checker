/**
 * test-mcp.js — OFFLINE PROOF of the two Rovo MCP tools
 * (09/11/2026).
 *
 * WHAT THIS TEST PROVES, AND WHAT IT DOES NOT PROVE
 *
 * The `rovo:mcp` module exposes two tools: `scan_accessibility(url)` and
 * `list_last_findings()`. An agent tool reads the caller's site: the
 * question is therefore not "is the report pretty?" but
 * "can the tool read what the caller is not allowed to read?".
 *
 * This test plugs a FAKE PLATFORM into `@forge/api` (both the `asUser`
 * and `asApp` clients are replaced) and observes what the code actually
 * does:
 *
 *   - which identity is used for each call (asUser or asApp);
 *   - which paths are requested, and whether the given URL is ever requested;
 *   - whether the storage or an external call are touched (never);
 *   - whether the tool refuses when the platform refuses, when the URL points
 *     to another site, or when the content cannot be read;
 *   - whether the administration page (which existed BEFORE the Rovo MCP tools
 *     were added) still reads with the app identity — the MCP module did not
 *     change it.
 *
 * WHAT THIS TEST DOES NOT PROVE: the real MCP call. It cannot be run from
 * this container (it needs an Atlassian administrator session and the user's
 * consent). What is verified here is the CODE; observing the deployment is a
 * separate step (the deployment did not happen: this fix deploys nothing).
 *
 * METHODOLOGICAL POINT: like the other harnesses in the repo, every check
 * is replayed on a SABOTAGED COPY of the `src/mcp.js` file. A check that
 * cannot say no proves nothing. A sabotage that makes the harness CRASH
 * proves nothing either: the detection must be an explicit
 * FAILURE, not an exception.
 *
 * Usage: node test-mcp.js
 * RC 0 = everything passes, RC 1 = at least one check fails.
 */
const fs = require('fs');
const path = require('path');

const api = require('@forge/api');

const APP = __dirname;
const SRC_MCP = path.join(APP, 'src', 'mcp.js');
const SRC_INDEX = path.join(APP, 'src', 'index.js');

let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

// ---------------------------------------------------------------------------
// 1. The fake platform
// ---------------------------------------------------------------------------

/** The observed calls: identity, method, path. */
let APPELS = [];
/** The calls to an external service (api.fetch): must stay at zero. */
let APPELS_EXTERNES = [];
/** The accesses to the storage (api.storage): must stay at zero. */
let ACCES_STOCKAGE = [];
/** The scenario in progress: path -> { status, body }. */
let SCENARIO = {};

function reponse(status, body) {
  return {
    status,
    json: async () => body,
  };
}

function cheminDe(r) {
  if (typeof r === 'string') return r;
  if (r && typeof r.value === 'string') return r.value;
  return String(r);
}

function clientPour(identite) {
  return {
    requestJira: async (r, options) => {
      const chemin = cheminDe(r);
      const methode = (options && options.method) || 'GET';
      APPELS.push({ identite, methode, chemin });
      const def = SCENARIO[chemin];
      if (!def) return reponse(404, { errorMessages: ['not found: ' + chemin] });
      return reponse(def.status, def.body);
    },
    requestConfluence: async () => {
      throw new Error('requestConfluence is not allowed in this app');
    },
  };
}

// We replace the clients ON THE MODULE OBJECT (@forge/api is a singleton:
// src/mcp.js and src/index.js see the same replacements).
api.asUser = () => clientPour('asUser');
api.asApp = () => clientPour('asApp');
api.fetch = async (r) => {
  APPELS_EXTERNES.push(cheminDe(r));
  return reponse(200, {});
};
api.storage = {
  get: async (cle) => {
    ACCES_STOCKAGE.push('get:' + cle);
    return null;
  },
  set: async (cle) => {
    ACCES_STOCKAGE.push('set:' + cle);
  },
  delete: async (cle) => {
    ACCES_STOCKAGE.push('delete:' + cle);
  },
};

// --- the demo fixtures of the repo, reused as they are ----------------------
const TYPES_DEMANDE = require('./src/demo/demo-jsm-requesttypes-DEMO-304.json');
const CHAMPS_DEMANDE = require('./src/demo/demo-jsm-requesttype-fields-DEMO-303.json');

const HOTE_SITE = 'demo-sites.atlassian.net';
const URL_PORTAL = 'https://' + HOTE_SITE + '/servicedesk/customer/portals';
const URL_ETRANGERE = 'https://autre-tenant.atlassian.net/servicedesk/customer/portals';

/**
 * The endpoint of the administration check (the SAME one for the page and for
 * the MCP tools: src/droits-admin.js).
 */
const CHEMIN_PERMISSIONS = '/rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN';

/**
 * The calls that do NOT read the site content: the administration check
 * and the identity probe. Everything else is a read.
 */
function estLectureDeContenu(appel) {
  return appel.chemin !== CHEMIN_PERMISSIONS && appel.chemin !== '/rest/api/3/serverInfo';
}

/** A minimal JSM site: the same data as the repo demo. */
function scenarioJsm() {
  const s = {};
  s['/rest/api/3/serverInfo'] = { status: 200, body: { baseUrl: 'https://' + HOTE_SITE } };
  s['/rest/servicedeskapi/info'] = { status: 200, body: { isLicensedForUse: true } };
  s['/rest/servicedeskapi/servicedesk'] = {
    status: 200,
    body: { values: [{ id: '12', projectName: 'Support' }] },
  };
  s['/rest/servicedeskapi/servicedesk/12/requesttype'] = { status: 200, body: TYPES_DEMANDE };
  s['/rest/servicedeskapi/servicedesk/12/requesttype/41/field'] = { status: 200, body: CHAMPS_DEMANDE };
  s['/rest/servicedeskapi/servicedesk/12/requesttype/42/field'] = {
    status: 200,
    body: { requestTypeFields: [] },
  };
  // The Jira search (POST) is only called in fallback mode, but it is
  // part of the site reads: it must answer too.
  s['/rest/api/3/search/jql'] = { status: 200, body: { issues: [] } };
  s['/rest/api/3/field'] = { status: 200, body: [] };
  s['/rest/api/3/project'] = { status: 200, body: [] };
  // The administration check of the resolver (src/resolvers.js): on this demo
  // site, the signed-in account IS an administrator.
  s['/rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN'] = {
    status: 200,
    body: {
      permissions: {
        ADMINISTER: { key: 'ADMINISTER', name: 'Administer Jira', type: 'GLOBAL', havePermission: true },
      },
    },
  };
  return s;
}

/** All the content reads are refused (the 403 case). */
function scenarioLectureRefusee() {
  const s = scenarioJsm();
  s['/rest/api/3/serverInfo'] = { status: 200, body: { baseUrl: 'https://' + HOTE_SITE } };
  for (const chemin of Object.keys(s)) {
    // The administration check and the identity probe answer: the case
    // tested here is "the CONTENT cannot be read", not "the caller
    // is not an administrator" (the latter is covered by the
    // test-mcp-admin.js suite).
    if (chemin === '/rest/api/3/serverInfo' || chemin === CHEMIN_PERMISSIONS) continue;
    s[chemin] = { status: 403, body: { errorMessages: ['forbidden'] } };
  }
  return s;
}

function remettreAZero() {
  APPELS = [];
  APPELS_EXTERNES = [];
  ACCES_STOCKAGE = [];
}

const mcp = require('./src/mcp.js');
const resolver = require('./src/resolvers.js');

// A mutant left over by an interrupted run must not linger in the
// sources: we clean up before starting.
(function nettoyerMutants() {
  const dir = path.join(APP, 'src');
  for (const f of fs.readdirSync(dir)) {
    if (/^\.sabotage-.*\.js$/.test(f)) fs.unlinkSync(path.join(dir, f));
  }
})();

// ---------------------------------------------------------------------------
// 2. The checks
// ---------------------------------------------------------------------------

/** The lines of the "Read" section of the report: paths and statuses, nothing else. */
function lignesRead(texte) {
  const marqueur = 'Read (paths and status only, no content):';
  const i = texte.indexOf(marqueur);
  if (i === -1) return null;
  const suite = texte.slice(i + marqueur.length);
  const fin = suite.indexOf('\n\n');
  return suite.slice(0, fin === -1 ? suite.length : fin).split('\n').filter((l) => l.trim());
}

async function controles() {
  const res = {};

  // --- A. the platform refuses the caller (401 on the probe) ---------------
  SCENARIO = scenarioJsm();
  SCENARIO['/rest/api/3/serverInfo'] = { status: 401, body: {} };
  remettreAZero();
  const refus401 = await mcp.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
  res['MCP-01 a caller refused by the platform receives a REFUSAL'] =
    /could not be run with your own permissions/.test(refus401);
  res['MCP-02 a refused caller triggers NO read of the site'] =
    APPELS.length === 2 && APPELS.filter(estLectureDeContenu).length === 0;
  res['MCP-03 the refusal explains how to authorize the application'] =
    /Allow access/.test(refus401);

  // --- B. the URL points to another site ----------------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const refusHote = await mcp.scanAccessibility({ url: URL_ETRANGERE }, { accountId: 'acc-1' });
  res['MCP-04 a URL from ANOTHER site is refused'] =
    /only scans the customer portal of the Atlassian site/.test(refusHote);
  res['MCP-05 a URL from another site triggers NO read of the site'] =
    APPELS.length === 2 && APPELS.filter(estLectureDeContenu).length === 0;
  res['MCP-06 the URL is NEVER requested to the platform'] =
    APPELS_EXTERNES.length === 0 && !APPELS.some((a) => a.chemin.indexOf('autre-tenant') !== -1);

  // --- C. a URL that is not a URL ------------------------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const refusUrl = await mcp.scanAccessibility({ url: 'pas une url' }, { accountId: 'acc-1' });
  res['MCP-07 an unreadable URL is refused'] = /No usable portal URL/.test(refusUrl);
  res['MCP-08 an unreadable URL triggers NO read of the site'] =
    APPELS.length === 2 && APPELS.filter(estLectureDeContenu).length === 0;

  // --- D. the normal scan ---------------------------------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const rapport = await mcp.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
  res['MCP-09 the site is read with the CALLER identity (asUser)'] =
    APPELS.length > 1 && APPELS.every((a) => a.identite === 'asUser');
  res['MCP-10 the report contains the findings'] =
    /Findings: \d+/.test(rapport) && /\[\s*\d+\.\d+/.test(rapport);
  res['MCP-11 the report contains the limits of the scan'] = /Limits: read-only/.test(rapport);
  res['MCP-12 the report contains the confidentiality sentence'] =
    /reads your site content through Atlassian read-only REST APIs and stores nothing/.test(rapport);
  res['MCP-13 the report says with which identity the site was read'] =
    /read with the caller's own Jira permissions/.test(rapport);
  res['MCP-14 the report names the site read'] = rapport.indexOf(HOTE_SITE) !== -1;

  const lignes = lignesRead(rapport);
  res['MCP-15 the "Read" section lists only paths and statuses'] =
    Array.isArray(lignes) &&
    lignes.length > 0 &&
    lignes.every((l) => /^ {2}- .+ -> HTTP \d+$/.test(l));
  res['MCP-16 the caller\'s account does NOT appear in the output'] =
    rapport.indexOf('acc-1') === -1;
  res['MCP-17 no call to an external service'] = APPELS_EXTERNES.length === 0;
  res['MCP-18 no access to the storage'] = ACCES_STOCKAGE.length === 0;
  res['MCP-19 no write call (GET only, apart from the Jira search)'] =
    APPELS.every((a) => a.methode === 'GET');

  // --- E. the content cannot be read (403) ---------------------------------
  SCENARIO = scenarioLectureRefusee();
  remettreAZero();
  const refus403 = await mcp.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
  res['MCP-20 content that cannot be read gives a REFUSAL, not an empty report'] =
    /could not be run with your own permissions/.test(refus403) && !/Findings: 0/.test(refus403);

  // --- F. the second tool ----------------------------------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const liste = await mcp.listLastFindings({}, { accountId: 'acc-1' });
  res['MCP-21 the second tool returns the findings'] =
    /current findings/.test(liste) && /Findings: \d+/.test(liste);
  res['MCP-22 the second tool says that no history is kept'] =
    /No history: this app stores nothing/.test(liste);
  res['MCP-23 the second tool reads with the caller\'s identity'] =
    APPELS.length > 1 && APPELS.every((a) => a.identite === 'asUser');

  // --- G. the administration page has NOT changed ----------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const page = await resolver.handler(
    { call: { functionKey: 'scan', payload: {} }, context: {} },
    { principal: { accountId: 'acc-2' } }
  );
  res['MCP-24 the administration page reads with the caller\'s identity (asUser)'] =
    APPELS.length > 0 && APPELS.every((a) => a.identite === 'asUser');
  res['MCP-25 the administration page still renders its report'] =
    page && page.ok === true && !!page.report && !!page.report.findings;

  // --- H. no secret nor key in the code of the tools -----------------------
  const source = fs.readFileSync(SRC_MCP, 'utf8');
  res['MCP-26 the tools code contains neither key nor token'] =
    !/api[_-]?key|secret|token\s*[:=]|Bearer\s/i.test(source);

  return res;
}

// ---------------------------------------------------------------------------
// 3. The counter-proofs: the harness must be able to say NO
// ---------------------------------------------------------------------------

/** Overwrites the source of the tools and returns the sabotaged module. */
function moduleSabotage(nom, mutation) {
  const source = fs.readFileSync(SRC_MCP, 'utf8');
  const mutant = mutation(source);
  if (mutant === source) return { erreur: 'the mutation changed nothing' };
  const chemin = path.join(APP, 'src', '.sabotage-' + nom + '.js');
  fs.writeFileSync(chemin, mutant, 'utf8');
  try {
    return { module: require(chemin), chemin: chemin };
  } catch (e) {
    return { erreur: 'the mutant does not compile: ' + (e && e.message), chemin: chemin };
  }
}

/**
 * Sabotage of the ENGINE (src/index.js): the module of the tools is recompiled
 * to point at the sabotaged engine, otherwise the sabotage would be useless.
 *
 * This is the check that changed nature since the identity check fix: the
 * identity is no longer chosen by a flag, it is unique in the code. The
 * sabotage therefore verifies that the check sees the identity ACTUALLY used.
 */
function moduleSabotageMoteur(nom, mutation) {
  const sourceMoteur = fs.readFileSync(SRC_INDEX, 'utf8');
  const mutantMoteur = mutation(sourceMoteur);
  if (mutantMoteur === sourceMoteur) return { erreur: 'the mutation changed nothing' };
  const cheminMoteur = path.join(APP, 'src', '.sabotage-' + nom + '-index.js');
  fs.writeFileSync(cheminMoteur, mutantMoteur, 'utf8');
  const sourceMcp = fs.readFileSync(SRC_MCP, 'utf8');
  const mutantMcp = sourceMcp.replace(
    "require('./index.js')",
    "require('./.sabotage-" + nom + "-index.js')"
  );
  if (mutantMcp === sourceMcp) {
    return { erreur: 'the mutant does not point to the sabotaged engine', cheminMoteur: cheminMoteur };
  }
  const chemin = path.join(APP, 'src', '.sabotage-' + nom + '.js');
  fs.writeFileSync(chemin, mutantMcp, 'utf8');
  try {
    return { module: require(chemin), chemin: chemin, cheminMoteur: cheminMoteur };
  } catch (e) {
    return {
      erreur: 'the mutant does not compile: ' + (e && e.message),
      chemin: chemin,
      cheminMoteur: cheminMoteur,
    };
  }
}

function remplacerTout(source, avant, apres) {
  return source.split(avant).join(apres);
}

/** Each sabotage: a mutant, a check that must become FALSE. */
const SABOTAGES = [
  {
    nom: 'the engine reads with the app identity instead of the caller\'s',
    moteur: true,
    mutationMoteur: (s) => remplacerTout(s, 'return api.asUser();', 'return api.asApp();'),
    attendu: 'MCP-09 the site is read with the CALLER identity (asUser)',
    verifier: async (mutant) => {
      SCENARIO = scenarioJsm();
      remettreAZero();
      await mutant.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
      return APPELS.length > 1 && APPELS.every((a) => a.identite === 'asUser');
    },
  },
  {
    nom: 'the site check of the URL is disabled',
    mutation: (s) => remplacerTout(s, 'if (!autorises.includes(hostUrl)) {', 'if (false) {'),
    attendu: 'MCP-04 a URL from ANOTHER site is refused',
    verifier: async (mutant) => {
      SCENARIO = scenarioJsm();
      remettreAZero();
      const out = await mutant.scanAccessibility({ url: URL_ETRANGERE }, { accountId: 'acc-1' });
      return /only scans the customer portal of the Atlassian site/.test(out);
    },
  },
  {
    nom: 'the identity gate (401) is disabled',
    mutation: (s) =>
      s.replace('if (!sonde.ok) return sonde.raison;', 'if (false) return sonde.raison;'),
    attendu: 'MCP-01 a caller refused by the platform receives a REFUSAL',
    verifier: async (mutant) => {
      SCENARIO = scenarioJsm();
      SCENARIO['/rest/api/3/serverInfo'] = { status: 401, body: {} };
      remettreAZero();
      const out = await mutant.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
      return /could not be run with your own permissions/.test(out);
    },
  },
  {
    nom: 'the identity probe queries the platform with the app identity',
    mutation: (s) =>
      s.replace(
        'res = await api.asUser().requestJira(route`/rest/api/3/serverInfo`);',
        'res = await api.asApp().requestJira(route`/rest/api/3/serverInfo`);'
      ),
    attendu: 'MCP-09 the site is read with the CALLER identity (asUser)',
    verifier: async (mutant) => {
      SCENARIO = scenarioJsm();
      remettreAZero();
      await mutant.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
      return APPELS.length > 1 && APPELS.every((a) => a.identite === 'asUser');
    },
  },
  {
    nom: 'the given URL is sent to an external service',
    mutation: (s) =>
      s.replace(
        'const rapport = await moteur.lancerScan({ pvRecus: {} });',
        'await api.fetch(route`/fwd/${encodeURIComponent(url)}`);\n  const rapport = await moteur.lancerScan({ pvRecus: {} });'
      ),
    attendu: 'MCP-17 no call to an external service',
    verifier: async (mutant) => {
      SCENARIO = scenarioJsm();
      remettreAZero();
      await mutant.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
      return APPELS_EXTERNES.length === 0;
    },
  },
  {
    nom: 'the tools store the scan history',
    mutation: (s) =>
      s.replace(
        'const rapport = await moteur.lancerScan({ pvRecus: {} });',
        'await api.storage.set("scan-history", "x");\n  const rapport = await moteur.lancerScan({ pvRecus: {} });'
      ),
    attendu: 'MCP-18 no access to the storage',
    verifier: async (mutant) => {
      SCENARIO = scenarioJsm();
      remettreAZero();
      await mutant.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
      return ACCES_STOCKAGE.length === 0;
    },
  },
];

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

(async () => {
  console.log('== 1. THE TWO Rovo MCP TOOLS (simulated platform) ==');
  const res = await controles();
  Object.keys(res).forEach((k) => check(k, res[k]));

  console.log('');
  console.log('== 2. COUNTER-PROOF (the harness must turn RED) ==');
  for (const s of SABOTAGES) {
    const nomFichier = s.nom.replace(/[^a-z0-9]+/gi, '-');
    const sab = s.moteur
      ? moduleSabotageMoteur(nomFichier, s.mutationMoteur)
      : moduleSabotage(nomFichier, s.mutation);
    let rouge = false;
    let crash = null;
    try {
      if (sab.erreur) throw new Error(sab.erreur);
      const encore = await s.verifier(sab.module);
      // The check must become FALSE again on the mutant: it is that "false"
      // which proves that the check can say no.
      rouge = encore === false;
    } catch (e) {
      crash = e && e.message ? e.message : String(e);
    } finally {
      if (sab.chemin && fs.existsSync(sab.chemin)) fs.unlinkSync(sab.chemin);
      if (sab.cheminMoteur && fs.existsSync(sab.cheminMoteur)) fs.unlinkSync(sab.cheminMoteur);
    }
    check(
      'CONTRE-PROOF "' + s.nom + '" is detected (explicit failure, no crash)',
      rouge && !crash,
      crash ? 'crash : ' + crash : ''
    );
  }

  console.log('');
  if (failures === 0) {
    console.log('== ALL PASS (' + checks + ' checks): the MCP tools read the site of the caller, and nothing else ==');
  } else {
    console.log('== ' + failures + ' FAILURE(S) on ' + checks + ' checks ==');
  }
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(String((e && e.stack) || e));
  process.exit(1);
});
