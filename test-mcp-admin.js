/**
 * test-mcp-admin.js — THE ADMINISTRATOR CHECK ON THE MCP PATH.
 *
 * THE PROBLEM THIS TEST ANSWERS (Direction, 09/11/2026 21:34): the
 * administration page is reserved to Jira administrators — the resolver
 * (src/resolvers.js) checks it on the server — but the two Rovo MCP tools
 * (src/mcp.js) had a weaker gate: an `asUser` probe on `/rest/api/3/serverInfo`
 * and a host check, but NO administrator check. The page was locked, the MCP
 * door was not.
 *
 * WHAT THIS TEST PROVES
 *
 *   MCP-01  an administrator (the global permission "Administer Jira") gets
 *            the report from `scan_accessibility`;
 *   MCP-02  a SIGNED-IN user who is NOT an administrator is REFUSED by
 *            `scan_accessibility`, and gets no report at all;
 *   MCP-03  that refusal happens BEFORE any read of the site: the site is not
 *            read once for a caller who is not an administrator;
 *   MCP-04  the refusal names the permission that is missing;
 *   MCP-05  the permission is asked with the CALLER's identity (`asUser`),
 *            never with the app's (`asApp` throws in this harness);
 *   MCP-06  the administrator check comes BEFORE the first read of the site,
 *            even for an administrator;
 *   MCP-07  the check FAILS CLOSED: if the platform refuses the permission
 *            check (HTTP 401), the tool refuses, it does not return a report;
 *   MCP-08  the check FAILS CLOSED when the endpoint answers 200 without
 *            saying anything about the administration permissions;
 *   MCP-09  the SECOND tool (`list_last_findings`) refuses the same
 *            non-administrator — both doors, not one;
 *   MCP-10  an administrator gets the findings from `list_last_findings`;
 *   MCP-11  the two entry points share ONE implementation: the live code of
 *            the MCP path and of the resolver both call src/droits-admin.js,
 *            and that file's live code names ADMINISTER, SYSTEM_ADMIN and the
 *            official endpoint;
 *   MCP-12  the live code of the MCP path contains NO `asApp(` call;
 *   MCP-13  the live code of the MCP path does NOT contain a second copy of
 *            the endpoint: the control is written once, not twice.
 *
 * COUNTER-PROOFS (the suite must be able to say NO)
 *
 *   CP-M1  a copy of the MCP path with the administrator check disabled gives
 *          the report back to a non-administrator: the check is load-bearing;
 *   CP-M2  a copy of the shared check that asks for another permission (a typo
 *          in the key) refuses the administrator: the key matters;
 *   CP-M3  a copy of the shared check that treats a SILENT answer (200 with
 *          nothing about the administration permissions) as "administrator"
 *          lets the caller through: the check must fail closed;
 *   CP-M4  a copy of the shared check that treats a REFUSED check (HTTP 401)
 *          as "administrator" lets the caller through: the check must fail
 *          closed.
 *
 * Each counter-proof mutates the file that really carries the behaviour (the
 * MCP path, or the shared check) and MUST change the outcome of the check it
 * is the counter-proof of. A counter-proof that leaves the outcome unchanged
 * proves nothing and is reported as a failure.
 *
 * Each counter-proof runs on SABOTAGED COPIES written next to the real files
 * (so that their `require('./index.js')` still resolves), and is deleted
 * afterwards. A counter-proof whose mutation changed nothing says so instead
 * of passing silently.
 *
 * Usage:
 *   node test-mcp-admin.js [path/to/mcp.js]
 *
 * RC 0 = every check passes, RC 1 = at least one check fails.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const api = require('@forge/api');

const APP = __dirname;
const SRC = path.join(APP, 'src');

// The file under test. The pre-fix copy of the MCP path can be passed as an
// argument: the suite then runs against THAT file, which is how the red
// output was produced before the fix was written.
const FICHIER_SOUS_TEST = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(SRC, 'mcp.js');

// The shared administrator check — ONE implementation, used by the resolver
// and by the MCP tools.
const FICHIER_DROITS = path.join(SRC, 'droits-admin.js');
const FICHIER_RESOLVER = path.join(SRC, 'resolvers.js');

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
const CHEMIN_SERVERINFO = '/rest/api/3/serverInfo';

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
  [CHEMIN_SERVERINFO]: { status: 200, body: { baseUrl: 'https://demo.atlassian.net' } },
  '/rest/servicedeskapi/info': { status: 200, body: { isLicensedForUse: true } },
  '/rest/servicedeskapi/servicedesk': { status: 200, body: { values: [] } },
};

const URL_PORTAL = 'https://demo.atlassian.net/servicedesk/customer/portals';

/** The reads of the site (everything that is not the permission check). */
function lecturesDuSite() {
  return DEMANDES.filter((c) => c !== CHEMIN_PERMISSIONS);
}

/** TRUE when the answer is the administrator refusal (and not a report). */
function estRefus(texte) {
  return (
    typeof texte === 'string' &&
    /reserved to Jira administrators/i.test(texte) &&
    !/\nFindings:/.test(texte)
  );
}

// ---------------------------------------------------------------------------
// 3. The checks
// ---------------------------------------------------------------------------

async function controles(mcp) {
  const res = {};

  // --- MCP-01 : the administrator gets the report -------------------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_ADMIN });
  DEMANDES = [];
  const repAdmin = await mcp.scanAccessibility({ url: URL_PORTAL }, {});
  res['MCP-01 an administrator receives the report from scan_accessibility'] =
    typeof repAdmin === 'string' &&
    /Portal Accessibility Checker for JSM/.test(repAdmin) &&
    /\nFindings:/.test(repAdmin);

  // --- MCP-02 : the signed-in user who is not an administrator -------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_NON_ADMIN });
  DEMANDES = [];
  const repNonAdmin = await mcp.scanAccessibility({ url: URL_PORTAL }, {});
  res['MCP-02 a signed-in user who is not an administrator is REFUSED'] = estRefus(repNonAdmin);

  // --- MCP-03 : the site was NOT read once for that caller ----------------
  res['MCP-03 that caller receives NO report and the site was NOT read'] =
    estRefus(repNonAdmin) && lecturesDuSite().length === 0;

  // --- MCP-04 : the refusal names the missing permission ------------------
  res['MCP-04 the refusal names the missing permission'] =
    typeof repNonAdmin === 'string' &&
    /ADMINISTER|Administer Jira/i.test(repNonAdmin) &&
    /administrator/i.test(repNonAdmin);

  // --- MCP-05 : the identity used ----------------------------------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_ADMIN });
  DEMANDES = [];
  await mcp.scanAccessibility({ url: URL_PORTAL }, {});
  res['MCP-05 the permission is asked with the caller identity (asUser), never asApp'] =
    DEMANDES.indexOf(CHEMIN_PERMISSIONS) !== -1;

  // --- MCP-06 : the check comes BEFORE the first read of the site ---------
  const iCheck = DEMANDES.indexOf(CHEMIN_PERMISSIONS);
  const iLecture = DEMANDES.indexOf(CHEMIN_SERVERINFO);
  res['MCP-06 the administrator check happens BEFORE any read of the site'] =
    iCheck !== -1 && iLecture !== -1 && iCheck < iLecture;

  // --- MCP-07 : the platform refuses the permission check -----------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_401 });
  DEMANDES = [];
  const rep401 = await mcp.scanAccessibility({ url: URL_PORTAL }, {});
  res['MCP-07 a refused permission check (HTTP 401) gives a REFUSAL, not a report'] =
    estRefus(rep401) && lecturesDuSite().length === 0;

  // --- MCP-08 : the endpoint answers 200 without saying anything ----------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_SANS_PERMISSION });
  DEMANDES = [];
  const repSilence = await mcp.scanAccessibility({ url: URL_PORTAL }, {});
  res['MCP-08 a permission check that says nothing gives a REFUSAL, not a report'] =
    estRefus(repSilence) && lecturesDuSite().length === 0;

  // --- MCP-09 : the SECOND tool refuses the same caller -------------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_NON_ADMIN });
  DEMANDES = [];
  const repListe = await mcp.listLastFindings({}, {});
  res['MCP-09 list_last_findings refuses the same non-administrator'] =
    estRefus(repListe) && lecturesDuSite().length === 0;

  // --- MCP-10 : an administrator gets the findings from the second tool ----
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_ADMIN });
  DEMANDES = [];
  const repListeAdmin = await mcp.listLastFindings({}, {});
  res['MCP-10 an administrator receives the findings from list_last_findings'] =
    typeof repListeAdmin === 'string' &&
    /current findings/.test(repListeAdmin) &&
    /\nFindings:/.test(repListeAdmin);

  return res;
}

// ---------------------------------------------------------------------------
// 4. The static checks (the LIVE code — comments removed)
// ---------------------------------------------------------------------------

/** The source without its comments: an absence guard must look at the code. */
function codeSeul(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function controlesStatiques() {
  const res = {};
  const sourceMcp = fs.readFileSync(FICHIER_SOUS_TEST, 'utf8');
  const codeMcp = codeSeul(sourceMcp);
  const sourceDroits = fs.readFileSync(FICHIER_DROITS, 'utf8');
  const codeDroits = codeSeul(sourceDroits);
  const sourceResolver = fs.readFileSync(FICHIER_RESOLVER, 'utf8');
  const codeResolver = codeSeul(sourceResolver);

  res['MCP-11 the two entry points share ONE implementation of the check'] =
    /require\(['"]\.\/droits-admin\.js['"]\)/.test(codeMcp) &&
    /require\(['"]\.\/droits-admin\.js['"]\)/.test(codeResolver) &&
    /ADMINISTER/.test(codeDroits) &&
    /SYSTEM_ADMIN/.test(codeDroits) &&
    /mypermissions/.test(codeDroits);

  res['MCP-12 the live code of the MCP path contains NO asApp() call'] =
    !/asApp\s*\(/.test(codeMcp);

  res['MCP-13 the endpoint is written ONCE (the MCP path has no second copy)'] =
    !/mypermissions/.test(codeMcp) && /mypermissions/.test(codeDroits);

  return res;
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
 * Write sabotaged copies of the MCP path AND of the shared check next to the
 * real files (so that their `require('./index.js')` still resolves), require
 * the sabotaged MCP path, and delete the copies afterwards.
 *
 * @param {string} nom the suffix of the temporary files
 * @param {object} mutations {mcp: fn, droits: fn} — each receives the source
 * @returns {object} the sabotaged MCP module
 */
function avecSabotage(nom, mutations) {
  const srcMcp = fs.readFileSync(FICHIER_SOUS_TEST, 'utf8');
  const srcDroits = fs.readFileSync(FICHIER_DROITS, 'utf8');

  const nomDroits = 'droits-admin.sabotage-' + nom + '.js';
  const nomMcp = 'mcp.sabotage-' + nom + '.js';

  let mcp = srcMcp;
  let droits = srcDroits;

  if (mutations.mcp) {
    const avant = mcp;
    mcp = mutations.mcp(mcp);
    if (mcp === avant) throw new Error('the mutation of the MCP path changed nothing');
  }
  if (mutations.droits) {
    const avant = droits;
    droits = mutations.droits(droits);
    if (droits === avant) throw new Error('the mutation of the shared check changed nothing');
  }

  // The sabotaged MCP path must call the sabotaged shared check.
  mcp = mcp.replace(/require\(['"]\.\/droits-admin\.js['"]\)/, "require('./" + nomDroits + "')");

  const fichierDroits = path.join(SRC, nomDroits);
  const fichierMcp = path.join(SRC, nomMcp);
  fs.writeFileSync(fichierDroits, droits, 'utf8');
  fs.writeFileSync(fichierMcp, mcp, 'utf8');
  try {
    delete require.cache[require.resolve(fichierMcp)];
    delete require.cache[require.resolve(fichierDroits)];
    return require(fichierMcp);
  } finally {
    for (const f of [fichierDroits, fichierMcp]) {
      try {
        fs.unlinkSync(f);
      } catch (e) {
        /* the file stays; the suite reports it */
      }
    }
  }
}

/** The answer of the sabotaged MCP path for a NON-administrator. */
async function scanAvecSabotage(nom, mutations) {
  const mcp = avecSabotage(nom, mutations);
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_NON_ADMIN });
  DEMANDES = [];
  const rep = await mcp.scanAccessibility({ url: URL_PORTAL }, {});
  return { reponse: rep, lectures: lecturesDuSite().length };
}

// ---------------------------------------------------------------------------
// 6. Execution
// ---------------------------------------------------------------------------

(async () => {
  console.log('== FILE UNDER TEST ==');
  console.log(FICHIER_SOUS_TEST);
  console.log('');

  const mcp = require(FICHIER_SOUS_TEST);

  console.log('== 1. THE CHECKS ==');
  const res = await controles(mcp);
  Object.keys(res).forEach((k) => check(k, res[k]));

  console.log('');
  console.log('== 2. THE STATIC CHECKS ==');
  const statiques = controlesStatiques();
  Object.keys(statiques).forEach((k) => check(k, statiques[k]));

  console.log('');
  console.log('== 3. THE COUNTER-PROOFS (the suite must be able to say NO) ==');

  // CP-M1 : the check disabled -> the non-administrator gets the report back.
  // The scenario is MCP-02/MCP-03: the sabotage MUST make the refusal
  // disappear, otherwise the check would be dead code.
  let cp1 = null;
  try {
    cp1 = await scanAvecSabotage('cp1', {
      mcp: (src) =>
        remplacementUnique(
          src,
          'const droit = await droitsAdmin.droitAdministration();',
          "const droit = { ok: true, permission: 'ADMINISTER', raison: '' };",
          2
        ),
    });
    check(
      'CONTRE-PROOF CP-M1 the administrator check is load-bearing (without it, a non-administrator would get the report)',
      !estRefus(cp1.reponse),
      estRefus(cp1.reponse)
        ? 'the sabotage did NOT change the outcome: the check may be dead code'
        : 'without the check the caller received a report: the check changes the outcome'
    );
  } catch (e) {
    check('CONTRE-PROOF CP-M1 the administrator check is load-bearing', false, e.message);
  }

  // CP-M2 : a wrong permission key -> the administrator is refused.
  // The scenario is MCP-01: the sabotage MUST take the report away.
  let cp2 = null;
  try {
    const mcpSabotage = avecSabotage('cp2', {
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
    const rep = await mcpSabotage.scanAccessibility({ url: URL_PORTAL }, {});
    check(
      'CONTRE-PROOF CP-M2 the permission key matters (with another key, the administrator is refused)',
      estRefus(rep),
      estRefus(rep) ? 'the wrong key refuses the administrator' : 'the wrong key did not change the outcome'
    );
  } catch (e) {
    check('CONTRE-PROOF CP-M2 the permission key matters', false, e.message);
  }

  // CP-M3 : a silent answer treated as "administrator" -> the caller passes.
  // The scenario is MCP-08: the sabotage MUST let the caller through.
  let cp3 = null;
  try {
    const mcpSabotage = avecSabotage('cp3', {
      droits: (src) =>
        remplacementUnique(
          src,
          'if (reponsePermission && reponsePermission.havePermission === true) {',
          'if (true) {',
          1
        ),
    });
    SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_SANS_PERMISSION });
    DEMANDES = [];
    const rep = await mcpSabotage.scanAccessibility({ url: URL_PORTAL }, {});
    check(
      'CONTRE-PROOF CP-M3 a silent answer fails closed (a silent check must not let anybody through)',
      !estRefus(rep),
      estRefus(rep)
        ? 'the sabotage did NOT change the outcome: the check may be dead code'
        : 'the silent answer let the caller through: the check changes the outcome'
    );
  } catch (e) {
    check('CONTRE-PROOF CP-M3 a silent answer fails closed', false, e.message);
  }

  // CP-M4 : a refused check (HTTP 401) treated as "administrator" -> the
  // caller passes. The scenario is MCP-07: the sabotage MUST let it through.
  let cp4 = null;
  try {
    const mcpSabotage = avecSabotage('cp4', {
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
    const rep = await mcpSabotage.scanAccessibility({ url: URL_PORTAL }, {});
    check(
      'CONTRE-PROOF CP-M4 a refused check fails closed (a 401 must not let anybody through)',
      !estRefus(rep),
      estRefus(rep)
        ? 'the sabotage did NOT change the outcome: the check may be dead code'
        : 'the refused check let the caller through: the check changes the outcome'
    );
  } catch (e) {
    check('CONTRE-PROOF CP-M4 a refused check fails closed', false, e.message);
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
