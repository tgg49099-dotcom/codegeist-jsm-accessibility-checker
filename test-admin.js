/**
 * test-admin.js — THE ADMINISTRATOR CHECK, MADE ON THE SERVER.
 *
 * The problem this test answers (jury review `e486`, 09/11/2026, "à corriger"
 * point 1): the administration page is only DISPLAYED to a Jira administrator,
 * but the page is a display. The scan itself is a resolver function, and
 * anything that can call that function could receive the findings of the
 * customer's site. The decision therefore has to be made on the server, in
 * `scan()`, with the caller's own identity — not in the page.
 *
 * WHAT THIS TEST PROVES
 *
 *   ADM-01  an administrator (the global permission "Administer Jira") gets
 *            the report;
 *   ADM-02  a SIGNED-IN user who is NOT an administrator gets a REFUSAL, and
 *            no report at all;
 *   ADM-03  that refusal happens BEFORE any read of the site: the site is not
 *            read once for a caller who is not an administrator;
 *   ADM-04  the refusal names the permission that is missing;
 *   ADM-05  the permission is asked with the CALLER's identity (`asUser`),
 *            never with the app's (`asApp` throws in this harness);
 *   ADM-06  the check FAILS CLOSED: if the platform refuses the permission
 *            check (HTTP 401), the caller gets a refusal, not a report;
 *   ADM-07  the check FAILS CLOSED when the endpoint answers 200 without
 *            saying anything about the administration permissions;
 *   ADM-08  a call without any account id is still refused (NOT_AUTHENTICATED);
 *   ADM-09  the demo scan reads no site and stays available to a signed-in
 *            user (it only replays the bundled fixtures) — the behaviour is
 *            pinned here so it cannot drift silently;
 *   ADM-10  the code names the permission key that the official endpoint
 *            actually uses (ADMINISTER) — no invented name;
 *   ADM-11  the public source no longer talks about "cycles" or about the
 *            module that has been removed (jury improvement 2);
 *   ADM-12  the resolver and the two MCP tools share ONE implementation of
 *            the check (src/droits-admin.js): two copies would be two doors
 *            that could drift apart.
 *
 * COUNTER-PROOFS (the suite must be able to say NO)
 *
 *   CP-1  a copy of the resolver with the administrator check disabled gives
 *         the report back to a non-administrator: the check is load-bearing;
 *   CP-2  a copy of the shared check that asks for another permission (a typo
 *         in the key) refuses the administrator: the key matters;
 *   CP-3  a copy of the shared check that treats a REFUSED check (HTTP 401)
 *         as "administrator" lets the caller through: the check must fail
 *         closed.
 *
 * Each counter-proof mutates the file that really carries the behaviour (the
 * resolver, or the shared check) and MUST change the outcome of the check it
 * is the counter-proof of. A counter-proof that leaves the outcome unchanged
 * proves nothing and is reported as a failure.
 *
 * Each counter-proof runs on a SABOTAGED COPY of the real file, written next
 * to it (so that its `require('./index.js')` still resolves), and is deleted
 * afterwards. A counter-proof that cannot change the file says so instead of
 * passing silently.
 *
 * Usage:
 *   node test-admin.js [path/to/resolvers.js]
 *
 * RC 0 = every check passes, RC 1 = at least one check fails.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const api = require('@forge/api');

const APP = __dirname;
const SRC = path.join(APP, 'src');

// The file under test. The pre-fix copy of the resolver can be passed as an
// argument: the suite then runs against THAT file, which is how the red
// output was produced before the fix was written.
const FICHIER_SOUS_TEST = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(SRC, 'resolvers.js');

// The administrator check itself lives in ONE file, shared with the two MCP
// tools (src/droits-admin.js). The resolver calls it; it does not hold it.
const FICHIER_DROITS = path.join(SRC, 'droits-admin.js');

let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

// ---------------------------------------------------------------------------
// 1. The simulated platform
// ---------------------------------------------------------------------------

/** The answers the platform gives, per path. */
let SCENARIO = {};

/** Every path the app asked for, in order. */
let DEMANDES = [];

function reponse(status, body) {
  return { status: status, json: async () => body };
}

/**
 * The caller's own identity (`asUser`). It is the ONLY identity this
 * application is allowed to use: `asApp` throws, so any attempt to widen the
 * identity stops the suite immediately.
 */
api.asUser = () => ({
  requestJira: async (p) => {
    const chemin = String((p && p.value_) || p);
    DEMANDES.push(chemin);
    const def = SCENARIO[chemin];
    if (!def) return reponse(404, { errorMessages: ['not found: ' + chemin] });
    return reponse(def.status, def.body);
  },
});
api.asApp = () => ({
  requestJira: async () => {
    throw new Error('asApp() is forbidden in this application (and in this test)');
  },
});
api.fetch = async () => {
  throw new Error('an external call is forbidden in this application (and in this test)');
};

// ---------------------------------------------------------------------------
// 2. The scenarios
// ---------------------------------------------------------------------------

const CHEMIN_PERMISSIONS = '/rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN';

const REPONSE_ADMIN = {
  status: 200,
  body: {
    permissions: {
      ADMINISTER: { key: 'ADMINISTER', name: 'Administer Jira', type: 'GLOBAL', havePermission: true },
      SYSTEM_ADMIN: { key: 'SYSTEM_ADMIN', name: 'Jira System Administrators', type: 'GLOBAL', havePermission: false },
    },
  },
};

const REPONSE_NON_ADMIN = {
  status: 200,
  body: {
    permissions: {
      ADMINISTER: { key: 'ADMINISTER', name: 'Administer Jira', type: 'GLOBAL', havePermission: false },
      SYSTEM_ADMIN: { key: 'SYSTEM_ADMIN', name: 'Jira System Administrators', type: 'GLOBAL', havePermission: false },
    },
  },
};

const REPONSE_SANS_PERMISSION = { status: 200, body: { permissions: {} } };
const REPONSE_401 = { status: 401, body: {} };

/** The reads of the site, when the caller is allowed to make them. */
const LECTURES_SITE = {
  '/rest/api/3/serverInfo': { status: 200, body: { baseUrl: 'https://demo.atlassian.net' } },
  '/rest/servicedeskapi/info': { status: 200, body: { isLicensedForUse: true } },
  '/rest/servicedeskapi/servicedesk': { status: 200, body: { values: [] } },
};

/**
 * One call to the resolver, through the real entry point (`handler`), with a
 * signed-in caller.
 *
 * @param {object} resolver the module under test
 * @param {string} accountId the account of the caller
 * @returns {Promise<object>} the answer of the resolver
 */
function appeler(resolver, accountId) {
  return resolver.handler(
    { call: { functionKey: 'scan', payload: {} }, context: {} },
    { principal: { accountId: accountId } }
  );
}

/** The reads of the site (everything that is not the permission check). */
function lecturesDuSite() {
  return DEMANDES.filter((c) => c !== CHEMIN_PERMISSIONS);
}

// ---------------------------------------------------------------------------
// 3. The checks
// ---------------------------------------------------------------------------

async function controles(resolver) {
  const res = {};

  // --- ADM-01 : the administrator gets the report -------------------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_ADMIN });
  DEMANDES = [];
  const repAdmin = await appeler(resolver, 'acc-admin');
  res['ADM-01 an administrator receives the report'] =
    repAdmin && repAdmin.ok === true && !!repAdmin.report && !!repAdmin.csv;
  res['ADM-01b the report is really about the site (mode "jsm")'] =
    repAdmin && repAdmin.report && repAdmin.report.mode === 'jsm';

  // --- ADM-02/03/04 : the signed-in user who is not an administrator ------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_NON_ADMIN });
  DEMANDES = [];
  const repNonAdmin = await appeler(resolver, 'acc-simple');
  res['ADM-02 a signed-in user who is not an administrator is REFUSED'] =
    repNonAdmin && repNonAdmin.ok === false && repNonAdmin.error === 'NOT_ADMINISTRATOR';
  res['ADM-03 that caller receives NO report (no findings, no csv)'] =
    repNonAdmin &&
    repNonAdmin.ok === false &&
    repNonAdmin.report === undefined &&
    repNonAdmin.csv === undefined &&
    !JSON.stringify(repNonAdmin).match(/"findings"/);
  res['ADM-03b the site was NOT read once for that caller'] =
    lecturesDuSite().length === 0;
  res['ADM-04 the refusal names the missing permission'] =
    repNonAdmin &&
    typeof repNonAdmin.message === 'string' &&
    /administrator/i.test(repNonAdmin.message) &&
    /ADMINISTER|Administer Jira/i.test(repNonAdmin.message);

  // --- ADM-05 : the identity used ----------------------------------------
  res['ADM-05 the permission is asked with the caller identity (asUser), never asApp'] =
    DEMANDES.indexOf(CHEMIN_PERMISSIONS) !== -1;

  // --- ADM-06 : the platform refuses the permission check -----------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_401 });
  DEMANDES = [];
  const rep401 = await appeler(resolver, 'acc-admin');
  res['ADM-06 a refused permission check (HTTP 401) gives a REFUSAL, not a report'] =
    rep401 && rep401.ok === false && rep401.report === undefined && lecturesDuSite().length === 0;

  // --- ADM-07 : the endpoint answers 200 without saying anything ----------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_SANS_PERMISSION });
  DEMANDES = [];
  const repSilence = await appeler(resolver, 'acc-admin');
  res['ADM-07 a permission check that says nothing gives a REFUSAL, not a report'] =
    repSilence && repSilence.ok === false && repSilence.report === undefined && lecturesDuSite().length === 0;

  // --- ADM-08 : no signed-in account at all -------------------------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_ADMIN });
  DEMANDES = [];
  const repAnonyme = await resolver.handler(
    { call: { functionKey: 'scan', payload: {} }, context: {} },
    { principal: {} }
  );
  res['ADM-08 a call without any account id is still refused'] =
    repAnonyme && repAnonyme.ok === false && repAnonyme.error === 'NOT_AUTHENTICATED';

  // --- ADM-09 : the demo scan reads no site -------------------------------
  SCENARIO = { [CHEMIN_PERMISSIONS]: REPONSE_NON_ADMIN };
  DEMANDES = [];
  const repDemo = await resolver.handler(
    { call: { functionKey: 'scanDemo', payload: {} }, context: {} },
    { principal: { accountId: 'acc-simple' } }
  );
  res['ADM-09 the demo scan reads no site at all (fixtures only)'] =
    repDemo &&
    repDemo.ok === true &&
    DEMANDES.length === 0 &&
    Array.isArray(repDemo.report && repDemo.report.constats) &&
    repDemo.report.constats.length > 0;

  return res;
}

// ---------------------------------------------------------------------------
// 4. The static checks (the source of the file under test)
// ---------------------------------------------------------------------------

function controlesStatiques() {
  const res = {};
  const source = fs.readFileSync(FICHIER_SOUS_TEST, 'utf8');
  const sansCommentaires = source
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''))
    .join('\n');

  // The check itself lives in ONE file, shared with the MCP tools
  // (src/droits-admin.js). ADM-10 therefore looks at the LIVE CODE of the
  // file the resolver actually uses — a comment can no longer make it pass.
  const FICHIER_DROITS = path.join(SRC, 'droits-admin.js');
  const utiliseLeControlePartage = /require\(['"]\.\/droits-admin\.js['"]\)/.test(sansCommentaires);
  const fichierDuControle = utiliseLeControlePartage ? FICHIER_DROITS : FICHIER_SOUS_TEST;
  const codeDuControle = existe(fichierDuControle)
    ? fs
        .readFileSync(fichierDuControle, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
    : '';

  res['ADM-10 the code asks for the global permission ADMINISTER (the key the official endpoint uses)'] =
    /ADMINISTER/.test(codeDuControle) && /mypermissions/.test(codeDuControle);
  res['ADM-11 the public source no longer talks about a cycle'] =
    !/\bcycle\b|\bCYCLE\b/.test(source);
  res['ADM-11b the public source no longer talks about the removed trigger module'] =
    !/webtrigger|productTrigger|scheduleTrigger|authentication: none/i.test(sansCommentaires);
  res['ADM-12 the resolver and the MCP tools share ONE implementation of the check'] =
    utiliseLeControlePartage && existe(FICHIER_DROITS);
  return res;
}

/** TRUE when the file exists. */
function existe(f) {
  try {
    fs.accessSync(f);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 5. The counter-proofs: the suite must be able to say NO
// ---------------------------------------------------------------------------

/**
 * Replace a string that must appear EXACTLY `nb` times. A counter-proof whose
 * anchor is not unique would silently mutate the wrong thing — so the count
 * is checked, and a mismatch is an error, not a pass.
 */
function remplacementUnique(source, motif, remplacement, nb) {
  const parties = source.split(motif);
  if (parties.length - 1 !== nb) {
    throw new Error(
      'the anchor appears ' + (parties.length - 1) + ' time(s), expected ' + nb + ': ' + motif
    );
  }
  return parties.join(remplacement);
}

/**
 * Write sabotaged copies of the resolver AND of the shared administrator check
 * next to the real files (so that their `require('./index.js')` still
 * resolves), require the sabotaged resolver, and delete the copies afterwards.
 *
 * The check now lives in ONE file (src/droits-admin.js), shared with the MCP
 * tools: a counter-proof that wants to change the check must change THAT
 * file, and a counter-proof that wants to change the resolver must change
 * the resolver.
 *
 * @param {string} nom the suffix of the temporary files
 * @param {object} mutations {resolver: fn, droits: fn} — each receives the source
 * @returns {object} the sabotaged resolver
 */
function avecSabotage(nom, mutations) {
  const srcResolver = fs.readFileSync(FICHIER_SOUS_TEST, 'utf8');
  const srcDroits = fs.readFileSync(FICHIER_DROITS, 'utf8');

  const nomDroits = 'droits-admin.sabotage-' + nom + '.js';
  const nomResolver = 'resolvers.sabotage-' + nom + '.js';

  let resolver = srcResolver;
  let droits = srcDroits;

  if (mutations.resolver) {
    const avant = resolver;
    resolver = mutations.resolver(resolver);
    if (resolver === avant) throw new Error('the mutation of the resolver changed nothing');
  }
  if (mutations.droits) {
    const avant = droits;
    droits = mutations.droits(droits);
    if (droits === avant) throw new Error('the mutation of the shared check changed nothing');
  }

  // The sabotaged resolver must call the sabotaged shared check.
  resolver = resolver.replace(
    /require\(['"]\.\/droits-admin\.js['"]\)/,
    "require('./" + nomDroits + "')"
  );

  const fichierDroits = path.join(SRC, nomDroits);
  const fichierResolver = path.join(SRC, nomResolver);
  fs.writeFileSync(fichierDroits, droits, 'utf8');
  fs.writeFileSync(fichierResolver, resolver, 'utf8');
  try {
    delete require.cache[require.resolve(fichierResolver)];
    delete require.cache[require.resolve(fichierDroits)];
    return require(fichierResolver);
  } finally {
    for (const f of [fichierDroits, fichierResolver]) {
      try {
        fs.unlinkSync(f);
      } catch (e) {
        /* the file stays; the suite reports it */
      }
    }
  }
}

/** The answer of the sabotaged resolver for a NON-administrator. */
async function scanAvecSabotage(nom, mutations) {
  const resolver = avecSabotage(nom, mutations);
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_NON_ADMIN });
  DEMANDES = [];
  const rep = await appeler(resolver, 'acc-simple');
  return { reponse: rep, lectures: lecturesDuSite().length };
}

// ---------------------------------------------------------------------------
// 6. Execution
// ---------------------------------------------------------------------------

(async () => {
  console.log('== FILE UNDER TEST ==');
  console.log(FICHIER_SOUS_TEST);
  console.log('');

  const resolver = require(FICHIER_SOUS_TEST);

  console.log('== 1. THE CHECKS ==');
  const res = await controles(resolver);
  Object.keys(res).forEach((k) => check(k, res[k]));

  console.log('');
  console.log('== 2. THE STATIC CHECKS ==');
  const statiques = controlesStatiques();
  Object.keys(statiques).forEach((k) => check(k, statiques[k]));

  console.log('');
  console.log('== 3. THE COUNTER-PROOFS (the suite must be able to say NO) ==');

  // CP-1 : the check disabled -> the non-administrator gets the report back.
  let cp1 = null;
  try {
    cp1 = await scanAvecSabotage('cp1', {
      resolver: (src) => src.replace(/if \(!droit\.ok\)/, 'if (false)'),
    });
    check(
      'CONTRE-PROOF CP-1 the administrator check is load-bearing (without it, a non-administrator would get the report)',
      !!(cp1.reponse && cp1.reponse.ok === true),
      cp1.reponse && cp1.reponse.ok === true
        ? 'without the check the caller received a report: the check changes the outcome'
        : 'the sabotage did NOT change the outcome: the check may be dead code'
    );
  } catch (e) {
    check('CONTRE-PROOF CP-1 the administrator check is load-bearing', false, e.message);
  }

  // CP-2 : a wrong permission key -> the administrator is refused.
  let cp2 = null;
  try {
    cp2 = avecSabotage('cp2', {
      droits: (src) =>
        remplacementUnique(
          src,
          'const URL_PERMISSIONS = route`/rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN`;',
          'const URL_PERMISSIONS = route`/rest/api/3/mypermissions?permissions=BROWSE_PROJECTS`;',
          1
        ),
    });
    SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_ADMIN });
    DEMANDES = [];
    const rep = await appeler(cp2, 'acc-admin');
    check(
      'CONTRE-PROOF CP-2 the permission key matters (with another key, the administrator is refused)',
      !!(rep && rep.ok === false),
      rep && rep.ok === false ? 'the wrong key refuses the administrator' : 'the wrong key did not change the outcome'
    );
  } catch (e) {
    check('CONTRE-PROOF CP-2 the permission key matters', false, e.message);
  }

  // CP-3 : a refused check treated as "administrator" -> the caller passes.
  // The scenario is ADM-06: the sabotage MUST let the caller through.
  let cp3 = null;
  try {
    cp3 = avecSabotage('cp3', {
      droits: (src) =>
        remplacementUnique(
          src,
          'if (status !== 200) {',
          "if (status !== 200) { return { ok: true, permission: 'ADMINISTER', raison: '' }; } if (false) {",
          1
        ),
    });
    SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_401 });
    DEMANDES = [];
    const rep = await appeler(cp3, 'acc-admin');
    check(
      'CONTRE-PROOF CP-3 the check fails closed (a failing check must not let anybody through)',
      !!(rep && rep.ok === true),
      rep && rep.ok === true
        ? 'the sabotaged check let the caller through: the check changes the outcome'
        : 'the sabotage did NOT change the outcome: the check may be dead code'
    );
  } catch (e) {
    check('CONTRE-PROOF CP-3 the check fails closed', false, e.message);
  }

  console.log('');
  if (failures === 0) {
    console.log('== TOUT PASS (' + checks + ' checks) ==');
  } else {
    console.log('== ' + failures + ' FAILURE(S) out of ' + checks + ' checks ==');
  }
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(String((e && e.stack) || e));
  process.exit(1);
});
