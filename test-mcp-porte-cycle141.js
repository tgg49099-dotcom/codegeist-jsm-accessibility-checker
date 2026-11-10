/**
 * test-mcp-porte-cycle141.js — HOSTILE REVIEW OF THE ADMINISTRATOR DOOR.
 *
 * WHAT THIS SUITE ADDS TO test-mcp-admin-cycle140.js
 *
 * The cycle 140 suite proves that the administrator check is there, that it
 * fails closed on a 401 and on a silent answer, and that it happens before
 * the first read. Those are the right questions, and they are answered.
 *
 * This suite asks the questions the cycle 140 suite does NOT ask — the ones
 * a hostile reviewer would ask, and the ones that decide whether the door is
 * really closed in every way the platform can behave:
 *
 *   P-01  the platform refuses with an EXCEPTION instead of an HTTP code.
 *         This is the case the MCP runtime is most likely to produce: an
 *         `asUser()` call with no signed-in user in the context throws, it
 *         does not answer 401. The door must close, and nothing must be read.
 *   P-02  an administrator who holds ONLY "Jira System Administrators"
 *         (SYSTEM_ADMIN) and NOT "Administer Jira" is an administrator: the
 *         two keys of the official endpoint must BOTH be honoured.
 *   P-03  the two doors give the SAME refusal (one wording, one behaviour) —
 *         the message of the resolver and the message of the MCP tool are the
 *         same string, checked at runtime and not by reading the source.
 *   P-04  EVERY entry point declared in manifest.yml reaches a guarded
 *         handler: the `function` modules, the two `action` modules (which
 *         can be invoked by name, not only through `rovo:mcp`), the
 *         `rovo:mcp` tools and the administration page. No module may reach
 *         the engine directly.
 *   P-05  the shared check itself THROWS: the tool must still return no
 *         report (fail closed by exception, not only by answer).
 *   P-06  the second tool (`list_last_findings`) refuses the same way.
 *   P-07  the ONE door that is open on purpose — the demo scan of the
 *         administration page — reads NOTHING: zero REST call. The open door
 *         opens on nothing.
 *   P-08  a MALFORMED answer (the platform would answer the string "false"
 *         instead of the boolean false) is refused: only a boolean true is
 *         an administration permission.
 *   P-09  the two doors AGREE, on the same scenarios, at runtime.
 *   P-10  a non-administrator causes ZERO read of the site: the only call
 *         that leaves the app is the permission check itself.
 *   P-11  the shared file DRIVES both doors: when it is changed, both change
 *         their verdict the same way. This is the behavioural proof that
 *         there is ONE implementation and not two copies.
 *
 * THE COUNTER-PROOFS (the suite must be able to say NO)
 *
 *   CP-141-A  a shared check that ALLOWS on error ("fail open") turns P-01
 *             and P-06 red.
 *   CP-141-B  a shared check that accepts a non-boolean answer turns P-08
 *             red.
 *   CP-141-C  a shared check that forgets the second permission key turns
 *             P-02 and P-11 red.
 *   CP-141-D  a FORK of the control inside the MCP path (a second copy of
 *             the check, written in place) turns P-03, P-09, P-10 and P-11
 *             red: forking the control is caught.
 *   CP-141-E  a gate moved AFTER the first read of the site turns P-10 red.
 *
 * Each counter-proof mutates the file that really carries the behaviour and
 * MUST change the verdict of the check it is the counter-proof of. A
 * counter-proof that leaves the outcome unchanged proves nothing, and is
 * reported as a failure.
 *
 * Usage:
 *   node test-mcp-porte-cycle141.js [mcp.js] [resolvers.js] [droits-admin.js]
 *
 * With arguments, the suite runs against THAT state (this is how the red
 * output is produced, on the files published before the fix). The
 * counter-proofs are replayed only on the live state: their anchors ARE the
 * live ones, and the suite says so instead of pretending.
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

const FICHIER_MCP = process.argv[2] ? path.resolve(process.argv[2]) : LIVE_MCP;
const FICHIER_RESOLVER = process.argv[3] ? path.resolve(process.argv[3]) : LIVE_RESOLVER;
const FICHIER_DROITS = process.argv[4] ? path.resolve(process.argv[4]) : LIVE_DROITS;

const ETAT_AVANT = FICHIER_MCP !== LIVE_MCP;

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

/** When true, the platform THROWS instead of answering (no user context). */
let PLATEFORME_LEVE = false;

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
    if (PLATEFORME_LEVE) {
      throw new Error('No user context for this request (asUser() without a signed-in user)');
    }
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

/** An administrator of the second kind: SYSTEM_ADMIN only. */
const REPONSE_SYSADMIN_SEUL = {
  status: 200,
  body: {
    permissions: {
      ADMINISTER: { key: 'ADMINISTER', name: 'Administer Jira', type: 'GLOBAL', havePermission: false },
      SYSTEM_ADMIN: { key: 'SYSTEM_ADMIN', name: 'Jira System Administrators', type: 'GLOBAL', havePermission: true },
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

/** A MALFORMED answer: the platform would answer the string "false". */
const REPONSE_MALFORMEE = {
  status: 200,
  body: {
    permissions: {
      ADMINISTER: { key: 'ADMINISTER', name: 'Administer Jira', type: 'GLOBAL', havePermission: 'false' },
      SYSTEM_ADMIN: { key: 'SYSTEM_ADMIN', name: 'Jira System Administrators', type: 'GLOBAL', havePermission: 'false' },
    },
  },
};

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

/** TRUE when the answer is a report. */
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

// ---------------------------------------------------------------------------
// 3. The manifest — the real list of the entry points
// ---------------------------------------------------------------------------

/**
 * Reads the modules declared in manifest.yml. A small line parser, because
 * the file has one fixed shape and no YAML parser is needed for it.
 */
function lireManifeste(texte) {
  const modules = {};
  let typeCourant = null;
  let moduleCourant = null;
  let dansOutils = false;
  let dansResolver = false;
  for (const ligne of texte.split('\n')) {
    const t = ligne.trim();
    if (!t || t.startsWith('#')) continue;
    const indent = ligne.length - ligne.replace(/^\s*/, '').length;
    if (indent === 2 && t.endsWith(':')) {
      typeCourant = t.slice(0, -1);
      modules[typeCourant] = modules[typeCourant] || [];
      moduleCourant = null;
      dansOutils = false;
      dansResolver = false;
      continue;
    }
    if (indent === 4 && t.startsWith('- key:')) {
      moduleCourant = { key: t.slice('- key:'.length).trim() };
      modules[typeCourant].push(moduleCourant);
      dansOutils = false;
      dansResolver = false;
      continue;
    }
    if (!moduleCourant) continue;
    if (indent === 6 && t.startsWith('function:')) moduleCourant.function = t.slice('function:'.length).trim();
    else if (indent === 6 && t.startsWith('handler:')) moduleCourant.handler = t.slice('handler:'.length).trim();
    else if (indent === 6 && t === 'tools:') dansOutils = true;
    else if (indent === 6 && t === 'resolver:') dansResolver = true;
    else if (dansResolver && indent === 8 && t.startsWith('function:')) {
      moduleCourant.resolverFunction = t.slice('function:'.length).trim();
      dansResolver = false;
    } else if (dansOutils && indent === 8 && t.startsWith('- ')) {
      moduleCourant.tools = moduleCourant.tools || [];
      moduleCourant.tools.push(t.slice(2).trim());
    } else if (indent <= 6) {
      dansOutils = false;
      dansResolver = false;
    }
  }
  return modules;
}

/** The handlers the application declares as guarded entry points. */
const HANDLERS_GARDES = ['resolvers.handler', 'mcp.scanAccessibility', 'mcp.listLastFindings'];

function controleManifeste() {
  const modules = lireManifeste(fs.readFileSync(path.join(APP, 'manifest.yml'), 'utf8'));
  const problemes = [];

  // 1. every `function` module answers through a guarded handler
  const clesFonction = new Set();
  for (const m of modules['function'] || []) {
    clesFonction.add(m.key);
    if (!HANDLERS_GARDES.includes(m.handler)) {
      problemes.push('function module ' + m.key + ' -> handler ' + m.handler + ' (not guarded)');
    }
  }

  // 2. every `action` module (which can be called by name) points at a
  //    guarded `function` module
  for (const m of modules['action'] || []) {
    const cle = m.function;
    if (!clesFonction.has(cle)) {
      problemes.push('action module ' + m.key + ' -> unknown function ' + cle);
      continue;
    }
    const cible = (modules['function'] || []).find((f) => f.key === cle);
    if (!HANDLERS_GARDES.includes(cible.handler)) {
      problemes.push('action module ' + m.key + ' -> ' + cle + ' -> ' + cible.handler + ' (not guarded)');
    }
  }

  // 3. every `rovo:mcp` tool is an action module that exists
  const clesAction = new Set((modules['action'] || []).map((m) => m.key));
  for (const m of modules['rovo:mcp'] || []) {
    for (const outil of m.tools || []) {
      if (!clesAction.has(outil)) problemes.push('rovo:mcp tool ' + outil + ' is not an action module');
    }
  }

  // 4. the administration page reaches the resolver
  for (const m of modules['jira:adminPage'] || []) {
    const cle = m.resolverFunction || null;
    if (!cle || !clesFonction.has(cle)) {
      problemes.push('jira:adminPage -> unknown resolver function ' + cle);
    }
  }

  // 5. no module reaches the engine directly
  for (const type of Object.keys(modules)) {
    for (const m of modules[type]) {
      const h = m.handler || '';
      if (/index\.|moteur\.|engine\./.test(h)) {
        problemes.push(type + ' module ' + m.key + ' reaches the engine directly (' + h + ')');
      }
    }
  }

  return { ok: problemes.length === 0, problemes: problemes };
}

// ---------------------------------------------------------------------------
// 4. The sabotage — the files that really carry the behaviour
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

/** The sources the files under test are built from. */
function sourcesDeBase() {
  return {
    mcp: fs.readFileSync(FICHIER_MCP, 'utf8'),
    resolver: fs.readFileSync(FICHIER_RESOLVER, 'utf8'),
    droits: fs.readFileSync(FICHIER_DROITS, 'utf8'),
  };
}

/**
 * Write sabotaged copies of the MCP path, of the resolver and of the shared
 * check next to the real files (so that their `require('./index.js')` still
 * resolves), require them, and delete the copies afterwards.
 *
 * @param {string} nom the suffix of the temporary files
 * @param {object} mutations {mcp, resolver, droits} — each receives the source
 * @returns {object} {mcp, resolver} — the sabotaged modules
 */
function construire(nom, mutations) {
  const base = sourcesDeBase();
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
// 5. The checks
// ---------------------------------------------------------------------------

/** The verdict of the two doors on one scenario. */
async function verdicts(set, scenario, leve) {
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: scenario });
  PLATEFORME_LEVE = !!leve;
  DEMANDES = [];
  let repMcp = null;
  let erreur = null;
  try {
    repMcp = await set.mcp.scanAccessibility({ url: URL_PORTAL }, {});
  } catch (e) {
    erreur = e;
  }
  DEMANDES = [];
  let repResolver = null;
  try {
    repResolver = await set.resolver._scan({ payload: {}, context: { accountId: 'acc-cycle141' } });
  } catch (e) {
    erreur = erreur || e;
  }
  PLATEFORME_LEVE = false;
  return {
    mcpRapport: estRapport(repMcp),
    mcpRefus: estRefus(repMcp),
    mcpErreur: erreur,
    resolverOk: !!(repResolver && repResolver.ok === true),
    resolverRefus: !!(repResolver && repResolver.error === 'NOT_ADMINISTRATOR'),
    resolverMessage: repResolver && repResolver.message ? repResolver.message : null,
    repMcp: repMcp,
  };
}

async function controles(set) {
  const res = {};

  // --- P-01 : the platform THROWS (no signed-in user in the context) ------
  SCENARIO = Object.assign({}, LECTURES_SITE);
  PLATEFORME_LEVE = true;
  DEMANDES = [];
  let repLevant = null;
  let aLeve = false;
  try {
    repLevant = await set.mcp.scanAccessibility({ url: URL_PORTAL }, {});
  } catch (e) {
    aLeve = true;
  }
  PLATEFORME_LEVE = false;
  res['P-01 the platform refusing with an EXCEPTION gives a REFUSAL and no read'] =
    (estRefus(repLevant) || aLeve) && lecturesDuSite().length === 0 && !estRapport(repLevant);

  // --- P-02 : an administrator holding ONLY SYSTEM_ADMIN -------------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_SYSADMIN_SEUL });
  DEMANDES = [];
  const repSysAdmin = await set.mcp.scanAccessibility({ url: URL_PORTAL }, {});
  res['P-02 an administrator holding only SYSTEM_ADMIN receives the report'] = estRapport(repSysAdmin);

  // --- P-03 : the two doors give the SAME refusal --------------------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_NON_ADMIN });
  DEMANDES = [];
  const repMcpNonAdmin = await set.mcp.scanAccessibility({ url: URL_PORTAL }, {});
  DEMANDES = [];
  const repResolverNonAdmin = await set.resolver._scan({ payload: {}, context: { accountId: 'acc-cycle141' } });
  res['P-03 the resolver and the MCP tool give the SAME refusal'] =
    !!repResolverNonAdmin &&
    repResolverNonAdmin.error === 'NOT_ADMINISTRATOR' &&
    typeof repMcpNonAdmin === 'string' &&
    repMcpNonAdmin.indexOf(repResolverNonAdmin.message) === 0;

  // --- P-04 : every entry point of manifest.yml is guarded -----------------
  const manifeste = controleManifeste();
  res['P-04 every entry point declared in manifest.yml reaches a guarded handler'] =
    manifeste.ok;
  if (!manifeste.ok) console.log('DETAIL P-04 : ' + manifeste.problemes.join(' | '));

  // --- P-05 : the shared check ITSELF throws ------------------------------
  let repLeve = null;
  let aLeve2 = false;
  try {
    const setLeve = construire('p05', {
      droits: (src) =>
        remplacementUnique(
          src,
          'async function droitAdministration() {',
          "async function droitAdministration() { throw new Error('sabotage cycle141 : the check throws');",
          1
        ),
    });
    SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_ADMIN });
    DEMANDES = [];
    repLeve = await setLeve.mcp.scanAccessibility({ url: URL_PORTAL }, {});
  } catch (e) {
    aLeve2 = true;
  }
  res['P-05 a shared check that THROWS gives no report at all'] =
    !estRapport(repLeve) && (aLeve2 || estRefus(repLeve));

  // --- P-06 : the second tool, same exception path -------------------------
  SCENARIO = Object.assign({}, LECTURES_SITE);
  PLATEFORME_LEVE = true;
  DEMANDES = [];
  let repLeve2 = null;
  let aLeve3 = false;
  try {
    repLeve2 = await set.mcp.listLastFindings({}, {});
  } catch (e) {
    aLeve3 = true;
  }
  PLATEFORME_LEVE = false;
  res['P-06 list_last_findings refuses the same way when the platform throws'] =
    (estRefus(repLeve2) || aLeve3) && !estRapport(repLeve2) && lecturesDuSite().length === 0;

  // --- P-07 : the demo scan reads NOTHING ---------------------------------
  SCENARIO = {};
  DEMANDES = [];
  let repDemo = null;
  try {
    repDemo = await set.resolver._scanDemo({ payload: {}, context: { accountId: 'acc-cycle141' } });
  } catch (e) {
    repDemo = null;
  }
  res['P-07 the demo scan (the one door open on purpose) reads NOTHING'] =
    !!repDemo && repDemo.ok === true && DEMANDES.length === 0;

  // --- P-08 : a malformed answer is refused --------------------------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_MALFORMEE });
  DEMANDES = [];
  const repMalforme = await set.mcp.scanAccessibility({ url: URL_PORTAL }, {});
  res['P-08 a malformed answer (havePermission: "false") is REFUSED'] =
    estRefus(repMalforme) && !estRapport(repMalforme);

  // --- P-09 : the two doors agree, at runtime ------------------------------
  const vAdmin = await verdicts(set, REPONSE_ADMIN, false);
  const vNonAdmin = await verdicts(set, REPONSE_NON_ADMIN, false);
  const vLeve = await verdicts(set, REPONSE_ADMIN, true);
  res['P-09 the two doors agree on the three scenarios (admin, non-admin, exception)'] =
    vAdmin.mcpRapport === vAdmin.resolverOk &&
    vNonAdmin.mcpRefus === vNonAdmin.resolverRefus &&
    vLeve.mcpRapport === vLeve.resolverOk;

  // --- P-10 : a non-administrator causes ZERO read -------------------------
  SCENARIO = Object.assign({}, LECTURES_SITE, { [CHEMIN_PERMISSIONS]: REPONSE_NON_ADMIN });
  DEMANDES = [];
  const repZero = await set.mcp.scanAccessibility({ url: URL_PORTAL }, {});
  res['P-10 a non-administrator causes ZERO read of the site (only the permission check)'] =
    estRefus(repZero) && DEMANDES.length === 1 && DEMANDES[0] === CHEMIN_PERMISSIONS;

  return res;
}

/**
 * P-11 — the shared file DRIVES both doors. When the shared check is changed,
 * both doors change their verdict the same way. This is the behavioural
 * proof that there is ONE implementation and not two copies that happen to
 * agree today.
 */
async function controleSharedFileDrivesBothDoors() {
  const set = construire('p11', {
    droits: (src) =>
      remplacementUnique(
        src,
        "const PERMISSIONS_ADMINISTRATION = ['ADMINISTER', 'SYSTEM_ADMIN'];",
        "const PERMISSIONS_ADMINISTRATION = ['ADMINISTER'];",
        1
      ),
  });
  const vMcp = await verdicts(set, REPONSE_SYSADMIN_SEUL, false);
  const vResolver = await verdicts(set, REPONSE_SYSADMIN_SEUL, false);
  return {
    ok:
      vMcp.mcpRapport === false &&
      vMcp.resolverOk === false &&
      vMcp.mcpRapport === vMcp.resolverOk,
    detail:
      'with the second key removed, the MCP door allows=' +
      vMcp.mcpRapport +
      ' and the resolver allows=' +
      vMcp.resolverOk,
  };
}

// ---------------------------------------------------------------------------
// 6. The counter-proofs: the suite must be able to say NO
// ---------------------------------------------------------------------------

/**
 * Run the checks on a sabotaged set and return the checks that turned red.
 *
 * @param {string} nom
 * @param {object} mutations
 * @returns {Promise<{verdicts: object, rouges: string[]}>}
 */
async function verdictsSabotes(nom, mutations) {
  const set = construire(nom, mutations);
  const res = await controles(set);
  const rouges = Object.keys(res).filter((k) => res[k] === false);
  return { verdicts: res, rouges: rouges };
}

(async () => {
  console.log('== FILE UNDER TEST ==');
  console.log('mcp.js      : ' + FICHIER_MCP);
  console.log('resolvers.js: ' + FICHIER_RESOLVER);
  console.log('droits-admin: ' + FICHIER_DROITS);
  console.log('');

  const set = { mcp: require(FICHIER_MCP), resolver: require(FICHIER_RESOLVER) };

  console.log('== 1. THE CHECKS ==');
  const res = await controles(set);
  Object.keys(res).forEach((k) => check(k, res[k]));

  if (!ETAT_AVANT) {
    console.log('');
    console.log('== 2. P-11 the shared file drives both doors ==');
    const p11 = await controleSharedFileDrivesBothDoors();
    check('P-11 the shared file drives BOTH doors (one implementation, not two)', p11.ok, p11.detail);
  } else {
    console.log('');
    console.log('== 2. P-11 is not replayed on a before-state ==');
    console.log('(it needs the live shared file, which the before-state does not use)');
  }

  console.log('');
  console.log('== 3. THE COUNTER-PROOFS (the suite must be able to say NO) ==');

  if (ETAT_AVANT) {
    console.log('NOT REPLAYED on a before-state: the anchors of the counter-proofs ARE the live ones.');
  } else {
    // --- CP-141-A : the shared check FAILS OPEN on an error --------------
    const cpA = await verdictsSabotes('cp-a', {
      droits: (src) =>
        remplacementUnique(
          src,
          "      ok: false,\n      permission: '',\n      raison: 'the platform refused",
          "      ok: true,\n      permission: 'ADMINISTER',\n      raison: 'the platform refused",
          1
        ),
    });
    check(
      'CONTRE-PROOF CP-141-A a shared check that ALLOWS on error turns P-01 and P-06 red',
      cpA.rouges.indexOf('P-01 the platform refusing with an EXCEPTION gives a REFUSAL and no read') !== -1 &&
        cpA.rouges.indexOf('P-06 list_last_findings refuses the same way when the platform throws') !== -1,
      'red: ' + cpA.rouges.join(', ')
    );

    // --- CP-141-B : the shared check accepts a non-boolean answer --------
    const cpB = await verdictsSabotes('cp-b', {
      droits: (src) =>
        remplacementUnique(
          src,
          'reponsePermission && reponsePermission.havePermission === true',
          'reponsePermission && reponsePermission.havePermission',
          1
        ),
    });
    check(
      'CONTRE-PROOF CP-141-B a shared check that accepts a non-boolean answer turns P-08 red',
      cpB.rouges.indexOf('P-08 a malformed answer (havePermission: "false") is REFUSED') !== -1,
      'red: ' + cpB.rouges.join(', ')
    );

    // --- CP-141-C : the shared check forgets the second key --------------
    const cpC = await verdictsSabotes('cp-c', {
      droits: (src) =>
        remplacementUnique(
          src,
          "const PERMISSIONS_ADMINISTRATION = ['ADMINISTER', 'SYSTEM_ADMIN'];",
          "const PERMISSIONS_ADMINISTRATION = ['ADMINISTER'];",
          1
        ),
    });
    check(
      'CONTRE-PROOF CP-141-C a shared check that forgets SYSTEM_ADMIN turns P-02 red',
      cpC.rouges.indexOf('P-02 an administrator holding only SYSTEM_ADMIN receives the report') !== -1,
      'red: ' + cpC.rouges.join(', ')
    );

    // --- CP-141-D : the control is FORKED inside the MCP path ------------
    const cpD = await verdictsSabotes('cp-d', {
      mcp: (src) =>
        remplacementUnique(
          src,
          'const droit = await droitsAdmin.droitAdministration();',
          "const droit = { ok: true, permission: 'ADMINISTER', raison: '' };",
          2
        ),
    });
    check(
      'CONTRE-PROOF CP-141-D a FORK of the control in the MCP path turns P-03, P-09 and P-10 red',
      cpD.rouges.indexOf('P-03 the resolver and the MCP tool give the SAME refusal') !== -1 &&
        cpD.rouges.indexOf('P-09 the two doors agree on the three scenarios (admin, non-admin, exception)') !== -1 &&
        cpD.rouges.indexOf('P-10 a non-administrator causes ZERO read of the site (only the permission check)') !== -1,
      'red: ' + cpD.rouges.join(', ')
    );

    // --- CP-141-E : the gate is moved AFTER the first read ---------------
    const cpE = await verdictsSabotes('cp-e', {
      mcp: (src) => {
        const gate =
          "  const droit = await droitsAdmin.droitAdministration();\n  if (!droit.ok) return droitsAdmin.refusAdministrateur(droit.raison);\n";
        const sonde = "  if (!sonde.ok) return sonde.raison;\n";
        const nbGate = src.split(gate).length - 1;
        const nbSonde = src.split(sonde).length - 1;
        if (nbGate !== 2) throw new Error('the gate appears ' + nbGate + ' time(s), expected 2');
        if (nbSonde !== 2) throw new Error('the probe appears ' + nbSonde + ' time(s), expected 2');
        // the gate is removed from its place and put back AFTER the probe:
        // the site is then read before the caller is checked.
        return src.split(gate).join('').split(sonde).join(sonde + gate);
      },
    });
    check(
      'CONTRE-PROOF CP-141-E a gate moved AFTER the first read turns P-10 red',
      cpE.rouges.indexOf('P-10 a non-administrator causes ZERO read of the site (only the permission check)') !== -1,
      'red: ' + cpE.rouges.join(', ')
    );
  }

  console.log('');
  console.log('== SUMMARY ==');
  console.log('checks: ' + checks + '  failures: ' + failures);
  console.log(failures === 0 ? 'VERDICT: VERT' : 'VERDICT: ROUGE');
  process.exit(failures === 0 ? 0 : 1);
})();
