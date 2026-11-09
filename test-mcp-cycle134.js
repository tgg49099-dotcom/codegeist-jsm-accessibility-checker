/**
 * test-mcp-cycle134.js — preuve HORS LIGNE des deux outils Rovo MCP
 * (cycle 134, 09/11/2026).
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
 *   - si la page d'administration (qui existait AVANT le cycle 134) lit
 *     toujours avec l'identité de l'app — le module MCP ne l'a pas changée.
 *
 * CE QUE CE TEST NE PROUVE PAS : l'appel MCP réel. Il ne peut pas être
 * exécuté depuis ce conteneur (il faut une session d'administrateur Atlassian
 * et le consentement de l'utilisateur). Ce qui est vérifié ici, c'est le
 * CODE ; l'observation du déploiement est une autre étape (le déploiement
 * n'a pas eu lieu : ce cycle ne déploie rien).
 *
 * POINT MÉTHODOLOGIQUE : comme les autres harnais du dépôt, chaque contrôle
 * est rejoué sur une COPIE SABOTÉE du fichier `src/mcp.js`. Un contrôle qui
 * ne sait pas dire non ne prouve rien. Un sabotage qui fait CRASER le
 * harnais ne prouve rien non plus : la détection doit être un ÉCHEC
 * explicite, pas une exception.
 *
 * Usage : node test-mcp-cycle134.js
 * RC 0 = tout passe, RC 1 = au moins un contrôle échoue.
 */
const fs = require('fs');
const path = require('path');

const api = require('@forge/api');

const APP = __dirname;
const SRC_MCP = path.join(APP, 'src', 'mcp.js');

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
  return s;
}

/** Toutes les lectures du contenu sont refusées (le cas 403). */
function scenarioLectureRefusee() {
  const s = scenarioJsm();
  s['/rest/api/3/serverInfo'] = { status: 200, body: { baseUrl: 'https://' + HOTE_SITE } };
  for (const chemin of Object.keys(s)) {
    if (chemin === '/rest/api/3/serverInfo') continue;
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
  res['MCP-01 un appelant refusé par la plateforme reçoit un REFUS'] =
    /could not be run with your own permissions/.test(refus401);
  res['MCP-02 un appelant refusé ne déclenche AUCUNE lecture du site'] = APPELS.length === 1;
  res['MCP-03 le refus explique comment autoriser l\'application'] =
    /Allow access/.test(refus401);

  // --- B. l'URL pointe vers un autre site ---------------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const refusHote = await mcp.scanAccessibility({ url: URL_ETRANGERE }, { accountId: 'acc-1' });
  res['MCP-04 une URL d\'un AUTRE site est refusée'] =
    /only scans the customer portal of the Atlassian site/.test(refusHote);
  res['MCP-05 une URL d\'un autre site ne déclenche AUCUNE lecture du site'] = APPELS.length === 1;
  res['MCP-06 l\'URL n\'est JAMAIS demandée à la plateforme'] =
    APPELS_EXTERNES.length === 0 && !APPELS.some((a) => a.chemin.indexOf('autre-tenant') !== -1);

  // --- C. une URL qui n'est pas une URL ------------------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const refusUrl = await mcp.scanAccessibility({ url: 'pas une url' }, { accountId: 'acc-1' });
  res['MCP-07 une URL illisible est refusée'] = /No usable portal URL/.test(refusUrl);
  res['MCP-08 une URL illisible ne déclenche AUCUNE lecture du site'] = APPELS.length === 1;

  // --- D. le scan normal ----------------------------------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const rapport = await mcp.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
  res['MCP-09 le site est lu avec l\'IDENTITÉ de l\'appelant (asUser)'] =
    APPELS.length > 1 && APPELS.every((a) => a.identite === 'asUser');
  res['MCP-10 le rapport contient les constats'] =
    /Findings: \d+/.test(rapport) && /\[\s*\d+\.\d+/.test(rapport);
  res['MCP-11 le rapport contient les limites du scan'] = /Limits: read-only/.test(rapport);
  res['MCP-12 le rapport contient la phrase de confidentialité'] =
    /reads your site content through Atlassian read-only REST APIs and stores nothing/.test(rapport);
  res['MCP-13 le rapport dit avec quelle identité le site a été lu'] =
    /read with the caller's own Jira permissions/.test(rapport);
  res['MCP-14 le rapport annonce le site lu'] = rapport.indexOf(HOTE_SITE) !== -1;

  const lignes = lignesRead(rapport);
  res['MCP-15 la section « Read » ne liste que des chemins et des statuts'] =
    Array.isArray(lignes) &&
    lignes.length > 0 &&
    lignes.every((l) => /^ {2}- .+ -> HTTP \d+$/.test(l));
  res['MCP-16 le compte de l\'appelant n\'apparaît PAS dans la sortie'] =
    rapport.indexOf('acc-1') === -1;
  res['MCP-17 aucun appel à un service extérieur'] = APPELS_EXTERNES.length === 0;
  res['MCP-18 aucun accès au stockage'] = ACCES_STOCKAGE.length === 0;
  res['MCP-19 aucun appel en écriture (GET seulement, hors recherche Jira)'] =
    APPELS.every((a) => a.methode === 'GET');

  // --- E. le contenu est en lecture refusée (403) --------------------------
  SCENARIO = scenarioLectureRefusee();
  remettreAZero();
  const refus403 = await mcp.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
  res['MCP-20 un contenu en lecture refusée donne un REFUS, pas un rapport vide'] =
    /could not be run with your own permissions/.test(refus403) && !/Findings: 0/.test(refus403);

  // --- F. le second outil ----------------------------------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const liste = await mcp.listLastFindings({}, { accountId: 'acc-1' });
  res['MCP-21 le second outil renvoie les constats'] =
    /current findings/.test(liste) && /Findings: \d+/.test(liste);
  res['MCP-22 le second outil dit qu\'aucun historique n\'est conservé'] =
    /No history: this app stores nothing/.test(liste);
  res['MCP-23 le second outil lit avec l\'identité de l\'appelant'] =
    APPELS.length > 1 && APPELS.every((a) => a.identite === 'asUser');

  // --- G. la page d'administration n'a PAS changé ----------------------------
  SCENARIO = scenarioJsm();
  remettreAZero();
  const page = await resolver.handler(
    { call: { functionKey: 'scan', payload: {} }, context: {} },
    { principal: { accountId: 'acc-2' } }
  );
  res['MCP-24 la page d\'administration lit toujours avec l\'identité de l\'app (asApp)'] =
    APPELS.length > 0 && APPELS.every((a) => a.identite === 'asApp');
  res['MCP-25 la page d\'administration rend toujours son rapport'] =
    page && page.ok === true && !!page.report && !!page.report.findings;

  // --- H. aucun secret ni clé dans le code des outils ----------------------
  const source = fs.readFileSync(SRC_MCP, 'utf8');
  res['MCP-26 le code des outils ne contient ni clé ni jeton'] =
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
  if (mutant === source) return { erreur: 'la mutation n\'a rien changé' };
  const chemin = path.join(APP, 'src', '.sabotage-' + nom + '.js');
  fs.writeFileSync(chemin, mutant, 'utf8');
  try {
    return { module: require(chemin), chemin: chemin };
  } catch (e) {
    return { erreur: 'le mutant ne compile pas : ' + (e && e.message), chemin: chemin };
  }
}

function remplacerTout(source, avant, apres) {
  return source.split(avant).join(apres);
}

/** Chaque sabotage : un mutant, un contrôle qui doit devenir FAUX. */
const SABOTAGES = [
  {
    nom: 'les outils lisent avec l\'identité de l\'app au lieu de celle de l\'appelant',
    mutation: (s) => remplacerTout(s, 'asUser: true', 'asUser: false'),
    attendu: 'MCP-09 le site est lu avec l\'IDENTITÉ de l\'appelant (asUser)',
    verifier: async (mutant) => {
      SCENARIO = scenarioJsm();
      remettreAZero();
      await mutant.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
      return APPELS.length > 1 && APPELS.every((a) => a.identite === 'asUser');
    },
  },
  {
    nom: 'la vérification du site de l\'URL est désactivée',
    mutation: (s) => remplacerTout(s, 'if (!autorises.includes(hostUrl)) {', 'if (false) {'),
    attendu: 'MCP-04 une URL d\'un AUTRE site est refusée',
    verifier: async (mutant) => {
      SCENARIO = scenarioJsm();
      remettreAZero();
      const out = await mutant.scanAccessibility({ url: URL_ETRANGERE }, { accountId: 'acc-1' });
      return /only scans the customer portal of the Atlassian site/.test(out);
    },
  },
  {
    nom: 'la porte d\'identité (401) est désactivée',
    mutation: (s) =>
      s.replace('if (!sonde.ok) return sonde.raison;', 'if (false) return sonde.raison;'),
    attendu: 'MCP-01 un appelant refusé par la plateforme reçoit un REFUS',
    verifier: async (mutant) => {
      SCENARIO = scenarioJsm();
      SCENARIO['/rest/api/3/serverInfo'] = { status: 401, body: {} };
      remettreAZero();
      const out = await mutant.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
      return /could not be run with your own permissions/.test(out);
    },
  },
  {
    nom: 'la sonde d\'identité interroge la plateforme avec l\'identité de l\'app',
    mutation: (s) =>
      s.replace(
        'res = await api.asUser().requestJira(route`/rest/api/3/serverInfo`);',
        'res = await api.asApp().requestJira(route`/rest/api/3/serverInfo`);'
      ),
    attendu: 'MCP-09 le site est lu avec l\'IDENTITÉ de l\'appelant (asUser)',
    verifier: async (mutant) => {
      SCENARIO = scenarioJsm();
      remettreAZero();
      await mutant.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
      return APPELS.length > 1 && APPELS.every((a) => a.identite === 'asUser');
    },
  },
  {
    nom: 'l\'URL fournie est envoyée à un service extérieur',
    mutation: (s) =>
      s.replace(
        'const rapport = await moteur.lancerScan({ pvRecus: {}, asUser: true });',
        'await api.fetch(route`/fwd/${encodeURIComponent(url)}`);\n  const rapport = await moteur.lancerScan({ pvRecus: {}, asUser: true });'
      ),
    attendu: 'MCP-17 aucun appel à un service extérieur',
    verifier: async (mutant) => {
      SCENARIO = scenarioJsm();
      remettreAZero();
      await mutant.scanAccessibility({ url: URL_PORTAL }, { accountId: 'acc-1' });
      return APPELS_EXTERNES.length === 0;
    },
  },
  {
    nom: 'les outils stockent l\'historique des scans',
    mutation: (s) =>
      s.replace(
        'const rapport = await moteur.lancerScan({ pvRecus: {}, asUser: true });',
        'await api.storage.set("scan-history", "x");\n  const rapport = await moteur.lancerScan({ pvRecus: {}, asUser: true });'
      ),
    attendu: 'MCP-18 aucun accès au stockage',
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
  console.log('== 1. LES DEUX OUTILS Rovo MCP (plateforme simulée) ==');
  const res = await controles();
  Object.keys(res).forEach((k) => check(k, res[k]));

  console.log('');
  console.log('== 2. CONTRE-ÉPREUVE (le harnais doit devenir rouge) ==');
  for (const s of SABOTAGES) {
    const sab = moduleSabotage(s.nom.replace(/[^a-z0-9]+/gi, '-'), s.mutation);
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
    }
    check(
      'CONTRE-ÉPREUVE « ' + s.nom + ' » est détectée (échec explicite, sans crash)',
      rouge && !crash,
      crash ? 'crash : ' + crash : ''
    );
  }

  console.log('');
  if (failures === 0) {
    console.log('== TOUT PASS (' + checks + ' contrôles) : les outils MCP lisent le site de l\'appelant, et rien d\'autre ==');
  } else {
    console.log('== ' + failures + ' ÉCHEC(S) sur ' + checks + ' contrôles ==');
  }
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(String((e && e.stack) || e));
  process.exit(1);
});
