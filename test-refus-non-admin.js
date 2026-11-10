/**
 * test-refus-non-admin.js — PROOF THAT A NON-ADMINISTRATOR IS REFUSED, ON THE
 * PAGE AND ON THE TWO MCP TOOLS, AND THAT THE PROOF CAN SAY NO.
 *
 * WHAT THIS SUITE IS FOR
 *
 * A reviewer asked for the refusal to be tested "in real", with an account
 * that is not an administrator. Creating such an account is a human gesture
 * (an Atlassian sign-up, a session, a click), so it is written down as a
 * procedure in A_ENVOYER/TEST-REFUS-NON-ADMIN.md instead of being faked here.
 *
 * What CAN be proved without an account, and is proved here, is the part the
 * account would exercise: an identity that is signed in but holds none of the
 * global administration permissions must get a REFUSAL — never a report — on
 * BOTH entry points, and the site must not be read.
 *
 * The identity simulated here is the one a real non-administrator produces:
 * the platform answers the permission endpoint with HTTP 200 and both
 * permissions set to `havePermission: false`. That is NOT an error and NOT a
 * missing context: it is the honest answer for a signed-in user who is not a
 * Jira administrator. (The other cases — no user context at all, a 401, a
 * silent answer — are covered by the other suites of this repository.)
 *
 * THE CHECKS
 *
 *   R-00  PRECONDITION: the three real files load and answer, without
 *         throwing. A counter-proof that "detects" by dying would prove
 *         nothing, so the suite must be able to run at all.
 *   R-01  the simulated identity is the one we think it is: Jira answers
 *         HTTP 200, both permissions false. The refusal that follows must
 *         come from that answer, not from an accident.
 *   R-02  THE PAGE refuses: the resolver answers a refusal
 *         (error = NOT_ADMINISTRATOR), never a report.
 *   R-03  THE PAGE reads NOTHING: the only request that left the app is the
 *         permission check itself.
 *   R-04  THE MCP TOOL `scan_accessibility` refuses, with the same wording.
 *   R-05  THE MCP TOOL `list_last_findings` refuses too.
 *   R-06  THE MCP PATH reads NOTHING: same, only the permission check.
 *   R-07  the page and the tools give the SAME refusal — one implementation,
 *         one wording (the tools answer the text the page answers in JSON).
 *   R-08  the refusal says WHY: it names the permissions that were missing.
 *   R-09  THE ADMINISTRATOR IS STILL ALLOWED: the suite must not be green
 *         because everything refuses. With an administrator's answer, the
 *         page goes past the gate.
 *   R-10  the demo scan is NOT closed by this: it reads no site, and stays
 *         open on purpose (the open door opens on nothing).
 *
 * THE COUNTER-PROOFS — the suite must be able to say NO
 *
 *   CP-NONADMIN-A  THE CONTROL IS REMOVED: the shared check
 *                  (src/droits-admin.js) always answers "you are an
 *                  administrator". Both doors must open, and the suite must
 *                  turn RED.
 *   CP-NONADMIN-B  the gate is removed from the PAGE path (src/resolvers.js).
 *   CP-NONADMIN-C  the gate is removed from the MCP path (src/mcp.js, the
 *                  two tools).
 *
 * Each counter-proof must change the verdict of the checks it is the
 * counter-proof of. A counter-proof that leaves the outcome unchanged proves
 * nothing, and is reported as a failure.
 *
 * Usage:
 *   node test-refus-non-admin.js
 *
 * RC 0 = every check passes, RC 1 = at least one check fails.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const api = require('@forge/api');

const APP = __dirname;
const SRC = path.join(APP, 'src');

const LIVE_MCP = path.join(SRC, 'mcp.js');
const LIVE_RESOLVER = path.join(SRC, 'resolvers.js');
const LIVE_DROITS = path.join(SRC, 'droits-admin.js');

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

function cheminDe(p) {
  return String((p && p.value_) || p);
}

/**
 * The caller's own identity (`asUser`). It is the ONLY identity this
 * application is allowed to use: `asApp` throws, so any attempt to widen the
 * identity stops the suite immediately.
 */
api.asUser = () => ({
  requestJira: async (p) => {
    const chemin = cheminDe(p);
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
// 2. The identities
// ---------------------------------------------------------------------------

const CHEMIN_PERMISSIONS = '/rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN';
const CHEMIN_SERVERINFO = '/rest/api/3/serverInfo';

const REPONSE_NON_ADMIN = {
  status: 200,
  body: {
    permissions: {
      ADMINISTER: { key: 'ADMINISTER', name: 'Administer Jira', type: 'GLOBAL', havePermission: false },
      SYSTEM_ADMIN: { key: 'SYSTEM_ADMIN', name: 'Jira System Administrators', type: 'GLOBAL', havePermission: false },
    },
  },
};

const REPONSE_ADMIN = {
  status: 200,
  body: {
    permissions: {
      ADMINISTER: { key: 'ADMINISTER', name: 'Administer Jira', type: 'GLOBAL', havePermission: true },
      SYSTEM_ADMIN: { key: 'SYSTEM_ADMIN', name: 'Jira System Administrators', type: 'GLOBAL', havePermission: false },
    },
  },
};

/** The reads of the site (everything that is not the permission check). */
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

/** TRUE when the answer is a report (and not a refusal). */
function estRapport(texte) {
  return (
    typeof texte === 'string' &&
    /Portal Accessibility Checker for JSM/.test(texte) &&
    /\nFindings:/.test(texte)
  );
}

/** TRUE when the answer is the administrator refusal (and not a report). */
function estRefus(texte) {
  return typeof texte === 'string' && /reserved to Jira administrators/i.test(texte) && !estRapport(texte);
}

/** The message the page answers. */
function messagePage(rep) {
  return rep && typeof rep.message === 'string' ? rep.message : '';
}

// ---------------------------------------------------------------------------
// 3. The sabotage — the files that really carry the behaviour
// ---------------------------------------------------------------------------

/**
 * Replace a string that must appear EXACTLY `nb` times. A counter-proof
 * whose anchor is not unique would mutate the wrong thing — so the count is
 * checked, and a mismatch is an error, not a pass.
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
 * Write sabotaged copies of the MCP path, of the resolver and of the shared
 * check next to the real files (so that their `require('./index.js')` still
 * resolves), require them, and delete the copies afterwards — in every case,
 * including when the sabotage does not apply (a leaking harness fills /tmp
 * and makes the whole suite crash).
 *
 * @param {string} nom the suffix of the temporary files
 * @param {object} mutations {mcp, resolver, droits} — each receives the source
 * @returns {object} {mcp, resolver} — the sabotaged modules
 */
function construire(nom, mutations) {
  const base = {
    mcp: fs.readFileSync(LIVE_MCP, 'utf8'),
    resolver: fs.readFileSync(LIVE_RESOLVER, 'utf8'),
    droits: fs.readFileSync(LIVE_DROITS, 'utf8'),
  };

  const nomDroits = 'droits-admin.sabotage-' + nom + '.js';
  const nomMcp = 'mcp.sabotage-' + nom + '.js';
  const nomResolver = 'resolvers.sabotage-' + nom + '.js';

  let mcp = base.mcp;
  let resolver = base.resolver;
  let droits = base.droits;

  for (const [cle, mut] of [['mcp', mutations.mcp], ['resolver', mutations.resolver], ['droits', mutations.droits]]) {
    if (!mut) continue;
    const avant = cle === 'mcp' ? mcp : cle === 'resolver' ? resolver : droits;
    const apres = mut(avant);
    if (apres === avant) throw new Error('the mutation of ' + cle + ' changed nothing');
    if (cle === 'mcp') mcp = apres;
    else if (cle === 'resolver') resolver = apres;
    else droits = apres;
  }

  // The sabotaged files must call the sabotaged shared check.
  mcp = mcp.replace(/require\(['"]\.\/droits-admin\.js['"]\)/, "require('./" + nomDroits + "')");
  resolver = resolver.replace(/require\(['"]\.\/droits-admin\.js['"]\)/, "require('./" + nomDroits + "')");

  const fichierDroits = path.join(SRC, nomDroits);
  const fichierMcp = path.join(SRC, nomMcp);
  const fichierResolver = path.join(SRC, nomResolver);
  fs.writeFileSync(fichierDroits, droits, 'utf8');
  fs.writeFileSync(fichierMcp, mcp, 'utf8');
  fs.writeFileSync(fichierResolver, resolver, 'utf8');
  try {
    for (const f of [fichierMcp, fichierResolver, fichierDroits]) delete require.cache[require.resolve(f)];
    return { mcp: require(fichierMcp), resolver: require(fichierResolver) };
  } finally {
    for (const f of [fichierDroits, fichierMcp, fichierResolver]) {
      try {
        fs.unlinkSync(f);
      } catch (e) {
        /* the file stays; the suite reports it */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. The checks
// ---------------------------------------------------------------------------

/**
 * Run the whole scenario on a set of modules.
 * @returns {object} the verdicts of the two doors
 */
async function scenarioNonAdmin(set) {
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_NON_ADMIN });

  // --- the page ---
  DEMANDES = [];
  let repPage = null;
  let erreurPage = null;
  try {
    repPage = await set.resolver._scan({ payload: {}, context: { accountId: 'acc-non-admin' } });
  } catch (e) {
    erreurPage = e;
  }
  const demandesPage = DEMANDES.slice();

  // --- the MCP tools ---
  DEMANDES = [];
  let repScan = null;
  let erreurScan = null;
  try {
    repScan = await set.mcp.scanAccessibility({ url: URL_PORTAL }, {});
  } catch (e) {
    erreurScan = e;
  }
  const demandesScan = DEMANDES.slice();

  DEMANDES = [];
  let repListe = null;
  let erreurListe = null;
  try {
    repListe = await set.mcp.listLastFindings({}, {});
  } catch (e) {
    erreurListe = e;
  }
  const demandesListe = DEMANDES.slice();

  return {
    repPage: repPage,
    erreurPage: erreurPage,
    demandesPage: demandesPage,
    repScan: repScan,
    erreurScan: erreurScan,
    demandesScan: demandesScan,
    repListe: repListe,
    erreurListe: erreurListe,
    demandesListe: demandesListe,
  };
}

/** The checks, as a map label -> boolean. */
async function controles(set) {
  const res = {};
  const s = await scenarioNonAdmin(set);

  // R-01 the simulated identity is the one we think it is
  res['R-01 the simulated identity is a signed-in account with NEITHER permission (HTTP 200, both false)'] =
    REPONSE_NON_ADMIN.status === 200 &&
    REPONSE_NON_ADMIN.body.permissions.ADMINISTER.havePermission === false &&
    REPONSE_NON_ADMIN.body.permissions.SYSTEM_ADMIN.havePermission === false;

  // R-02 the page refuses
  res['R-02 THE PAGE refuses a non-administrator (NOT_ADMINISTRATOR, never a report)'] =
    !s.erreurPage &&
    !!s.repPage &&
    s.repPage.ok !== true &&
    s.repPage.error === 'NOT_ADMINISTRATOR';

  // R-03 the page reads nothing
  res['R-03 THE PAGE reads nothing of the site (only the permission check leaves the app)'] =
    s.demandesPage.length === 1 && s.demandesPage[0] === CHEMIN_PERMISSIONS;

  // R-04 the MCP tool scan_accessibility refuses
  res['R-04 THE MCP TOOL scan_accessibility refuses a non-administrator'] =
    !s.erreurScan && estRefus(s.repScan) && !estRapport(s.repScan);

  // R-05 the MCP tool list_last_findings refuses
  res['R-05 THE MCP TOOL list_last_findings refuses a non-administrator'] =
    !s.erreurListe && estRefus(s.repListe) && !estRapport(s.repListe);

  // R-06 the MCP path reads nothing
  res['R-06 THE MCP PATH reads nothing of the site (only the permission check)'] =
    s.demandesScan.length === 1 &&
    s.demandesScan[0] === CHEMIN_PERMISSIONS &&
    s.demandesListe.length === 1 &&
    s.demandesListe[0] === CHEMIN_PERMISSIONS;

  // R-07 the same refusal on both paths.
  // The page answers a JSON object with the shared message in `message` and
  // the technical reason in `detail`; an MCP tool answers plain text, so it
  // appends the same reason after the same message. What must be identical is
  // the MESSAGE (one implementation, one wording); the reason must be present
  // on both sides, in the field the carrier allows.
  const messagePageRefus = messagePage(s.repPage);
  const messageOutil = String(s.repScan || '');
  const messageListe = String(s.repListe || '');
  res['R-07 the page and the two tools give the SAME refusal MESSAGE (one implementation, one wording)'] =
    messagePageRefus.length > 0 &&
    messageOutil.indexOf(messagePageRefus) === 0 &&
    messageListe.indexOf(messagePageRefus) === 0;

  // R-08 the refusal says why — on both sides
  const detailPage = s.repPage && typeof s.repPage.detail === 'string' ? s.repPage.detail : '';
  const raisonOutil = messageOutil.slice(messagePageRefus.length);
  res['R-08 the refusal says WHY on both sides (names the missing global permissions)'] =
    /ADMINISTER/.test(detailPage) &&
    /SYSTEM_ADMIN/.test(detailPage) &&
    /ADMINISTER/.test(raisonOutil) &&
    /SYSTEM_ADMIN/.test(raisonOutil);

  // R-09 the administrator is still allowed — the suite is not green because
  // everything refuses
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_ADMIN });
  DEMANDES = [];
  let repAdmin = null;
  let erreurAdmin = null;
  try {
    repAdmin = await set.resolver._scan({ payload: {}, context: { accountId: 'acc-admin' } });
  } catch (e) {
    erreurAdmin = e;
  }
  res['R-09 an ADMINISTRATOR is still allowed (the suite is not green because everything refuses)'] =
    !erreurAdmin && !!repAdmin && repAdmin.ok === true && repAdmin.error !== 'NOT_ADMINISTRATOR';

  // R-10 the demo scan is not closed by this test
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_NON_ADMIN });
  DEMANDES = [];
  let repDemo = null;
  let erreurDemo = null;
  try {
    repDemo = await set.resolver._scanDemo({ payload: {}, context: { accountId: 'acc-non-admin' } });
  } catch (e) {
    erreurDemo = e;
  }
  res['R-10 the demo scan stays open and reads NOTHING (the open door opens on nothing)'] =
    !erreurDemo && !!repDemo && repDemo.ok === true && DEMANDES.length === 0;

  return res;
}

/**
 * Run the checks on a sabotaged set and return the checks that turned red.
 * @param {string} nom
 * @param {object} mutations
 */
async function verdictsSabotes(nom, mutations) {
  let set = null;
  let erreur = null;
  try {
    set = construire(nom, mutations);
  } catch (e) {
    return { verdicts: {}, rouges: [], erreur: e };
  }
  let res = null;
  try {
    res = await controles(set);
  } catch (e) {
    return { verdicts: {}, rouges: [], erreur: e };
  }
  const rouges = Object.keys(res).filter((k) => res[k] === false);
  return { verdicts: res, rouges: rouges, erreur: null };
}

// ---------------------------------------------------------------------------
// 5. The run
// ---------------------------------------------------------------------------

(async () => {
  console.log('== FILES UNDER TEST ==');
  console.log('src/droits-admin.js: ' + LIVE_DROITS);
  console.log('src/resolvers.js   : ' + LIVE_RESOLVER);
  console.log('src/mcp.js         : ' + LIVE_MCP);
  console.log('');

  // --- R-00 : the precondition. The real files must load and answer. ---
  let set = null;
  let erreurChargement = null;
  try {
    set = { mcp: require(LIVE_MCP), resolver: require(LIVE_RESOLVER) };
  } catch (e) {
    erreurChargement = e;
  }
  check(
    'R-00 PRECONDITION the three real files load and answer, without throwing',
    !erreurChargement && !!set,
    erreurChargement ? String(erreurChargement && erreurChargement.message) : ''
  );
  if (erreurChargement) {
    console.log('');
    console.log('The suite cannot run: the real files do not load.');
    process.exit(1);
  }

  console.log('');
  console.log('== 1. THE CHECKS ==');
  const res = await controles(set);
  Object.keys(res).forEach((k) => check(k, res[k]));

  // The refusal itself, printed: it is the evidence the reviewer wants to read.
  const s = await scenarioNonAdmin(set);
  console.log('');
  console.log('== THE REFUSAL AS THE CALLER RECEIVES IT ==');
  console.log('page  : ' + JSON.stringify(messagePage(s.repPage)).slice(0, 400));
  console.log('tool  : ' + JSON.stringify(String(s.repScan)).slice(0, 400));

  console.log('');
  console.log('== 2. THE COUNTER-PROOFS (the suite must be able to say NO) ==');

  // --- CP-NONADMIN-A : THE CONTROL IS REMOVED -------------------------
  const cpA = await verdictsSabotes('cp-a', {
    droits: (src) =>
      remplacementUnique(
        src,
        'if (reponsePermission && reponsePermission.havePermission === true) {',
        'if (true) {',
        1
      ),
  });
  check(
    'CONTRE-PROOF CP-NONADMIN-A THE CONTROL IS REMOVED (the shared check always allows) turns the page and the tools RED',
    cpA.erreur === null &&
      cpA.rouges.indexOf('R-02 THE PAGE refuses a non-administrator (NOT_ADMINISTRATOR, never a report)') !== -1 &&
      cpA.rouges.indexOf('R-04 THE MCP TOOL scan_accessibility refuses a non-administrator') !== -1 &&
      cpA.rouges.indexOf('R-05 THE MCP TOOL list_last_findings refuses a non-administrator') !== -1,
    cpA.erreur ? 'the counter-proof could not run: ' + String(cpA.erreur.message) : 'red: ' + cpA.rouges.join(', ')
  );

  // --- CP-NONADMIN-B : the gate is removed from the PAGE path ----------
  const cpB = await verdictsSabotes('cp-b', {
    resolver: (src) =>
      remplacementUnique(
        src,
        'const droit = await droitAdministration();',
        "const droit = { ok: true, permission: 'ADMINISTER', raison: '' };",
        1
      ),
  });
  check(
    'CONTRE-PROOF CP-NONADMIN-B the gate is removed from the PAGE path turns R-02 and R-03 RED',
    cpB.erreur === null &&
      cpB.rouges.indexOf('R-02 THE PAGE refuses a non-administrator (NOT_ADMINISTRATOR, never a report)') !== -1 &&
      cpB.rouges.indexOf('R-03 THE PAGE reads nothing of the site (only the permission check leaves the app)') !== -1,
    cpB.erreur ? 'the counter-proof could not run: ' + String(cpB.erreur.message) : 'red: ' + cpB.rouges.join(', ')
  );

  // --- CP-NONADMIN-C : the gate is removed from the MCP path ----------
  const cpC = await verdictsSabotes('cp-c', {
    mcp: (src) =>
      remplacementUnique(
        src,
        'const droit = await droitsAdmin.droitAdministration();',
        "const droit = { ok: true, permission: 'ADMINISTER', raison: '' };",
        2
      ),
  });
  check(
    'CONTRE-PROOF CP-NONADMIN-C the gate is removed from the MCP path turns R-04, R-05 and R-06 RED',
    cpC.erreur === null &&
      cpC.rouges.indexOf('R-04 THE MCP TOOL scan_accessibility refuses a non-administrator') !== -1 &&
      cpC.rouges.indexOf('R-05 THE MCP TOOL list_last_findings refuses a non-administrator') !== -1 &&
      cpC.rouges.indexOf('R-06 THE MCP PATH reads nothing of the site (only the permission check)') !== -1,
    cpC.erreur ? 'the counter-proof could not run: ' + String(cpC.erreur.message) : 'red: ' + cpC.rouges.join(', ')
  );

  console.log('');
  console.log('SUMMARY: ' + (checks - failures) + ' PASS / ' + failures + ' FAIL (' + checks + ' checks)');
  process.exit(failures === 0 ? 0 : 1);
})();
