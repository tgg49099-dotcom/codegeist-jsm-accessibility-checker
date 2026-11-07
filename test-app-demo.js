/**
 * Test hors ligne du point d'entrée de l'app en mode DÉMO, via le RESOLVER
 * (src/resolvers.js).
 *
 * test-demo.js prouve que le MOTEUR (src/regles.js + src/demo.js) détecte les
 * 23 fautives. Ce test prouve que l'APP elle-même — le resolver que la page
 * d'administration appelle, c'est-à-dire le code qui sera réellement
 * déployé — renvoie ce verdict, et qu'elle ne fait AUCUN appel à un site en
 * mode démo.
 *
 * CYCLE 128 (05/11/2026) : l'entrée est `invoke('scanDemo', …)`, pas une URL
 * publique. Un appel sans compte connecté doit être refusé (GATE) : le mode
 * démo n'est pas une porte dérobée.
 *
 * Usage : node test-app-demo.js
 * RC 0 = tout passe, RC 1 = au moins un contrôle échoue.
 */
const path = require('path');
const api = require('@forge/api');
const resolver = require(path.join(__dirname, 'src', 'resolvers.js'));

let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

const COMPTE = 'acc-id-utilisateur-connecte';
const runtime = { principal: { accountId: COMPTE } };

function appelerDemo(payload) {
  return resolver.handler(
    { call: { functionKey: 'scanDemo', payload: payload || {} }, context: {} },
    runtime
  );
}

// --- 0. l'API Atlassian est neutralisée : le mode démo ne doit rien appeler --
const asAppOriginal = api.asApp;
let appelsApi = 0;
api.asApp = () => {
  appelsApi += 1;
  throw new Error('APPEL API INTERDIT DANS LE MODE DÉMO');
};

// --- 1. le resolver renvoie le rapport de démonstration ----------------------
(async () => {
  const sansCompte = await resolver.handler(
    { call: { functionKey: 'scanDemo', payload: {} }, context: {} },
    {}
  );
  check(
    'le mode démo refuse un appel sans compte connecté',
    sansCompte.ok === false && sansCompte.error === 'NOT_AUTHENTICATED',
    JSON.stringify(sansCompte).slice(0, 100)
  );

  const reponse = await appelerDemo();
  check('le resolver répond ok', reponse.ok === true, JSON.stringify(reponse.ok));
  check(
    'le resolver répond « qui a demandé »',
    reponse.requestedBy && reponse.requestedBy.accountId === COMPTE,
    JSON.stringify(reponse.requestedBy)
  );

  const rapport = reponse.report;
  check('le rapport est présent', !!rapport);
  if (!rapport) {
    api.asApp = asAppOriginal;
    process.exit(1);
  }

  check('le rapport est en mode démo', rapport.mode === 'demo', rapport.mode);
  check(
    'le rapport est horodaté (ISO 8601)',
    typeof rapport.generatedAt === 'string' && !isNaN(Date.parse(rapport.generatedAt)),
    rapport.generatedAt
  );
  check('le rapport contient 23 constats', rapport.constats.length === 23, String(rapport.constats.length));
  check(
    'le verdict est « ok »',
    rapport.contrat.ok === true,
    JSON.stringify({
      manquees: rapport.contrat.fautives_manquees,
      fauxPositifs: rapport.contrat.faux_positifs,
      horsContrat: rapport.contrat.constats_hors_contrat,
    })
  );
  check(
    '23 fautives détectées sur 23',
    rapport.contrat.fautives_detectees === 23 && rapport.contrat.fautives_total === 23,
    rapport.contrat.fautives_detectees + '/' + rapport.contrat.fautives_total
  );
  check(
    '0 faute manquée',
    rapport.contrat.fautives_manquees.length === 0,
    rapport.contrat.fautives_manquees.join(',')
  );
  check(
    '0 faux positif sur les 6 contrôles négatifs',
    rapport.contrat.faux_positifs.length === 0 && rapport.contrat.controles_negatifs_total === 6,
    rapport.contrat.faux_positifs.join(',')
  );
  check(
    '0 constat hors contrat',
    rapport.contrat.constats_hors_contrat.length === 0,
    rapport.contrat.constats_hors_contrat.join(' | ')
  );
  check(
    'le rapport par critère couvre les 13 critères de la fiche',
    rapport.rapport_par_critere.criteres.length === 13,
    String(rapport.rapport_par_critere.criteres.length)
  );
  check(
    'les 6 fichiers de démonstration sont listés comme sources',
    rapport.sources.fixtures.length === 6,
    String(rapport.sources.fixtures.length)
  );
  check(
    'le rapport rappelle que le mode démo ne lit rien sur un site',
    rapport.nature.indexOf('no call is made') !== -1 || rapport.limites.join(' ').indexOf('reads nothing') !== -1,
    rapport.nature.slice(0, 80)
  );
  check(
    'le rapport rappelle qu\'un constat n\'est pas une conformité',
    rapport.limites.join(' ').indexOf('never a verdict of conformance') !== -1,
    rapport.limites.join(' | ').slice(0, 120)
  );

  // --- 2. aucun appel API n'a été fait --------------------------------------
  check('aucun appel à l\'API Atlassian en mode démo', appelsApi === 0, String(appelsApi));

  // --- 3. export CSV via le même point d'entrée -----------------------------
  const reponseCsv = await appelerDemo();
  const lignesCsv = String(reponseCsv.csv).trim().split('\r\n');
  check('le CSV a 24 lignes (1 en-tête + 23 constats)', lignesCsv.length === 24, String(lignesCsv.length));
  check(
    'le CSV porte les 9 colonnes de la fiche, en anglais',
    lignesCsv[0] === '"criterion","level","confidence","source","resource","location","value","message","to_verify"',
    lignesCsv[0]
  );
  check('aucun appel API pendant l\'export CSV', appelsApi === 0, String(appelsApi));

  // --- 4. le mode démo ne contient aucune donnée de site --------------------
  const corps = JSON.stringify(reponse);
  check(
    'la réponse ne contient ni URL de site ni jeton',
    !/https?:\/\/[^\s"]*atlassian\.net/.test(corps) && !/Bearer\s/.test(corps)
  );
  check(
    'la réponse ne contient ni clé, ni mot de passe, ni secret',
    !/(api[_-]?key|secret|password|passwd|token)\s*[=:]\s*["'][^"']{8,}/i.test(corps)
  );

  api.asApp = asAppOriginal;

  console.log('');
  if (failures === 0) {
    console.log('== TOUT PASS (' + checks + ' contrôles) : le resolver renvoie le verdict 23/23 ==');
    process.exit(0);
  }
  console.log('== ' + failures + ' ÉCHEC(S) sur ' + checks + ' contrôles ==');
  process.exit(1);
})().catch((e) => {
  api.asApp = asAppOriginal;
  console.log('FAIL  le handler a levé une exception : ' + (e && e.stack));
  process.exit(1);
});
