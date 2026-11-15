/**
 * test-mcp.js — preuve HORS LIGNE des deux outils Rovo MCP
 * (09/11/2026).
 *
 * CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS
 *
 * Le module `rovo:mcp` expose deux outils : `scan_accessibility(url)` et
 * `list_last_findings()`. Un outil d'agent lit le site de l'appelant : la
 * question n'est donc pas « est-ce que le rapport est joli ? » mais
 * « l'outil peut-il lire ce que l'appelant n'a pas le droit de lire ? ».
 *
 * Ce test branche un FAUX PLATEFORME sur `@forge/api` (les deux clients
 * `asUser` et `asApp` sont remplacés) et observe ce que le code fait
 * VRAIMENT :
 *
 *   - quelle identité est utilisée pour chaque appel (asUser ou asApp) ;
 *   - quels chemins sont demandés, et si l'URL fournie est jamais demandée ;
 *   - si le stockage ou un appel externe sont touchés (jamais) ;
 *   - si l'outil refuse quand la plateforme refuse, quand l'URL pointe vers
 *     un autre site, ou quand le contenu est en lecture refusée ;
 *   - si la page d'administration (qui existait AVANT l'ajout des outils Rovo MCP) lit
 *     toujours avec l'identité de l'app — le module MCP ne l'a pas changée.
 *
 * CE QUE CE TEST NE PROUVE PAS : l'appel MCP réel. Il ne peut pas être
 * exécuté depuis ce conteneur (il faut une session d'administrateur Atlassian
 * et le consentement de l'utilisateur). Ce qui est vérifié ici, c'est le
 * CODE ; l'observation du déploiement est une autre étape (le déploiement
 * n'a pas eu lieu : ce correctif ne déploie rien).
 *
 * POINT MÉTHODOLOGIQUE : comme les autres harnais du dépôt, chaque contrôle
 * est rejoué sur une COPIE SABOTÉE du fichier `src/mcp.js`. Un contrôle qui
 * ne sait pas dire non ne prouve rien. Un sabotage qui fait CRASER le
 * harnais ne prouve rien non plus : la détection doit être un ÉCHEC
 * explicite, pas une exception.
 *
 * Usage : node test-mcp.js
 * RC 0 = tout passe, RC 1 = au moins un contrôle échoue.
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
// 1. Le faux plateforme
// ---------------------------------------------------------------------------

/** Les appels observés : identité, méthode, chemin. */
let APPELS = [];
/** Les appels à un service extérieur (api.fetch) : doivent rester à zéro. */
let APPELS_EXTERNES = [];
/** Les accès au stockage (api.storage) : doivent rester à zéro. */
let ACCES_STOCKAGE = [];
/** Le scénario en cours : chemin -> { status, body }. */
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

// On remplace les clients SUR L'OBJET DU MODULE (@forge/api est un singleton :
// src/mcp.js et src/index.js voient les mêmes remplacements).
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

// --- les fixtures de démonstration du dépôt, réutilisées telles quelles -----
const TYPES_DEMANDE = require('./src/demo/demo-jsm-requesttypes-DEMO-304.json');
const CHAMPS_DEMANDE = require('./src/demo/demo-jsm-requesttype-fields-DEMO-303.json');

const HOTE_SITE = 'demo-sites.atlassian.net';
const URL_PORTAL = 'https://' + HOTE_SITE + '/servicedesk/customer/portals';
const URL_ETRANGERE = 'https://autre-tenant.atlassian.net/servicedesk/customer/portals';

/**
 * L'endpoint du contrôle d'administration (le MÊME pour la page et pour les
 * outils MCP : src/droits-admin.js).
 */
const CHEMIN_PERMISSIONS = '/rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN';

/**
 * Les appels qui ne lisent PAS le contenu du site : le contrôle
 * d'administration et la sonde d'identité. Tout le reste est une lecture.
 */
function estLectureDeContenu(appel) {
  return appel.chemin !== CHEMIN_PERMISSIONS && appel.chemin !== '/rest/api/3/serverInfo';
}

/** Un site JSM minimal : les mêmes données que la démonstration du dépôt. */
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
  // La recherche Jira (POST) n'est appelée qu'en mode repli, mais elle fait
  // partie des lectures du site : elle doit répondre aussi.
  s['/rest/api/3/search/jql'] = { status: 200, body: { issues: [] } };
  s['/rest/api/3/field'] = { status: 200, body: [] };
  s['/rest/api/3/project'] = { status: 200, body: [] };
  // Le contrôle d'administration du resolver (src/resolvers.js) : sur ce site
  // de démonstration, le compte connecté EST administrateur.
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

/** Toutes les lectures du contenu sont refusées (le cas 403). */
function scenarioLectureRefusee() {
  const s = scenarioJsm();
  s['/rest/api/3/serverInfo'] = { status: 200, body: { baseUrl: 'https://' + HOTE_SITE } };
  for (const chemin of Object.keys(s)) {
    // Le contrôle d'administration et la sonde d'identité répondent : le cas
    // testé ici est « le CONTENU est en lecture refusée », pas « l'appelant
    // n'est pas administrateur » (celui-ci est couvert par la suite
    // test-mcp-admin.js).
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

// Un mutant laissé par une exécution interrompue ne doit pas traîner dans les
// sources : on nettoie avant de commencer.
(function nettoyerMutants() {
  const dir = path.join(APP, 'src');
  for (const f of fs.readdirSync(dir)) {
    if (/^\.sabotage-.*\.js$/.test(f)) fs.unlinkSync(path.join(dir, f));
  }
})();

// ---------------------------------------------------------------------------
// 2. Les contrôles
// ---------------------------------------------------------------------------

/** Les lignes de la section « Read » du rapport : chemins et statuts, rien d'autre. */
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

  // --- A. la plateforme refuse l'appelant (401 sur la sonde) ---------------
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

  // --- B. l'URL pointe vers un autre site ---------------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const refusHote = await mcp.scanAccessibility({ url: URL_ETRANGERE }, { accountId: 'acc-1' });
  res['MCP-04 a URL from ANOTHER site is refused'] =
    /only scans the customer portal of the Atlassian site/.test(refusHote);
  res['MCP-05 a URL from another site triggers NO read of the site'] =
    APPELS.length === 2 && APPELS.filter(estLectureDeContenu).length === 0;
  res['MCP-06 the URL is NEVER requested to the platform'] =
    APPELS_EXTERNES.length === 0 && !APPELS.some((a) => a.chemin.indexOf('autre-tenant') !== -1);

  // --- C. une URL qui n'est pas une URL ------------------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const refusUrl = await mcp.scanAccessibility({ url: 'pas une url' }, { accountId: 'acc-1' });
  res['MCP-07 an unreadable URL is refused'] = /No usable portal URL/.test(refusUrl);
  res['MCP-08 an unreadable URL triggers NO read of the site'] =
    APPELS.length === 2 && APPELS.filter(estLectureDeContenu).length === 0;

  // --- D. le scan normal ----------------------------------------------------
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

  // --- E. le contenu est en lecture refusée (403) --------------------------
  SCENARIO = scenarioLectureRefusee();
  remettreAZero();
  const refus403 = await mcp.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
  res['MCP-20 content that cannot be read gives a REFUSAL, not an empty report'] =
    /could not be run with your own permissions/.test(refus403) && !/Findings: 0/.test(refus403);

  // --- F. le second outil ----------------------------------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const liste = await mcp.listLastFindings({}, { accountId: 'acc-1' });
  res['MCP-21 the second tool returns the findings'] =
    /current findings/.test(liste) && /Findings: \d+/.test(liste);
  res['MCP-22 the second tool says that no history is kept'] =
    /No history: this app stores nothing/.test(liste);
  res['MCP-23 the second tool reads with the caller\'s identity'] =
    APPELS.length > 1 && APPELS.every((a) => a.identite === 'asUser');

  // --- G. la page d'administration n'a PAS changé ----------------------------
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

  // --- H. aucun secret ni clé dans le code des outils ----------------------
  const source = fs.readFileSync(SRC_MCP, 'utf8');
  res['MCP-26 the tools code contains neither key nor token'] =
    !/api[_-]?key|secret|token\s*[:=]|Bearer\s/i.test(source);

  return res;
}

// ---------------------------------------------------------------------------
// 3. Les contre-épreuves : le harnais doit savoir dire NON
// ---------------------------------------------------------------------------

/** Écrase la source des outils et renvoie le module saboté. */
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
 * Sabotage du MOTEUR (src/index.js) : le module des outils est recompilé
 * pour pointer sur le moteur saboté, sinon le sabotage ne servirait à rien.
 *
 * C'est le contrôle qui change de nature depuis le correctif du contrôle d'identité : l'identité
 * n'est plus choisie par un drapeau, elle estUnique dans le code. Le
 * sabotage vérifie donc que le contrôle voit l'identité RÉELLEMENT utilisée.
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

/** Chaque sabotage : un mutant, un contrôle qui doit devenir FAUX. */
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
// Exécution
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
      // Le contrôle doit redevenir FAUX sur le mutant : c'est ce « faux »
      // qui prouve que le contrôle sait dire non.
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
