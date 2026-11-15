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
 * Depuis le 05/11/2026 : l'entrée est `invoke('scanDemo', …)`, pas une URL
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
  throw new Error('API CALL FORBIDDEN IN DEMO MODE');
};

// --- 1. le resolver renvoie le rapport de démonstration ----------------------
(async () => {
  const sansCompte = await resolver.handler(
    { call: { functionKey: 'scanDemo', payload: {} }, context: {} },
    {}
  );
  check(
    'demo mode refuses a call with no signed-in account',
    sansCompte.ok === false && sansCompte.error === 'NOT_AUTHENTICATED',
    JSON.stringify(sansCompte).slice(0, 100)
  );

  const reponse = await appelerDemo();
  check('the resolver answers ok', reponse.ok === true, JSON.stringify(reponse.ok));
  check(
    'the resolver answers "who asked"',
    reponse.requestedBy && reponse.requestedBy.accountId === COMPTE,
    JSON.stringify(reponse.requestedBy)
  );

  const rapport = reponse.report;
  check('the report is present', !!rapport);
  if (!rapport) {
    api.asApp = asAppOriginal;
    process.exit(1);
  }

  check('the report is in demo mode', rapport.mode === 'demo', rapport.mode);
  check(
    'the report is timestamped (ISO 8601)',
    typeof rapport.generatedAt === 'string' && !isNaN(Date.parse(rapport.generatedAt)),
    rapport.generatedAt
  );
  check('the report contains 23 findings', rapport.constats.length === 23, String(rapport.constats.length));
  check(
    'the verdict is "ok"',
    rapport.contrat.ok === true,
    JSON.stringify({
      manquees: rapport.contrat.fautives_manquees,
      fauxPositifs: rapport.contrat.faux_positifs,
      horsContrat: rapport.contrat.constats_hors_contrat,
    })
  );
  check(
    '23 seeded issues detected out of 23',
    rapport.contrat.fautives_detectees === 23 && rapport.contrat.fautives_total === 23,
    rapport.contrat.fautives_detectees + '/' + rapport.contrat.fautives_total
  );
  check(
    '0 missed seeded issue',
    rapport.contrat.fautives_manquees.length === 0,
    rapport.contrat.fautives_manquees.join(',')
  );
  check(
    '0 false positive on the 6 negative checks',
    rapport.contrat.faux_positifs.length === 0 && rapport.contrat.controles_negatifs_total === 6,
    rapport.contrat.faux_positifs.join(',')
  );
  check(
    '0 finding outside the contract',
    rapport.contrat.constats_hors_contrat.length === 0,
    rapport.contrat.constats_hors_contrat.join(' | ')
  );
  check(
    'the report by criterion covers the 13 criteria of the sheet',
    rapport.rapport_par_critere.criteres.length === 13,
    String(rapport.rapport_par_critere.criteres.length)
  );
  check(
    'the 6 demo files are listed as sources',
    rapport.sources.fixtures.length === 6,
    String(rapport.sources.fixtures.length)
  );
  check(
    'the report reminds that demo mode reads nothing on a site',
    rapport.nature.indexOf('no call is made') !== -1 || rapport.limites.join(' ').indexOf('reads nothing') !== -1,
    rapport.nature.slice(0, 80)
  );
  check(
    'the report reminds that a finding is not a conformance',
    rapport.limites.join(' ').indexOf('never a verdict of conformance') !== -1,
    rapport.limites.join(' | ').slice(0, 120)
  );

  // --- 2. aucun appel API n'a été fait --------------------------------------
  check('no call to the Atlassian API in demo mode', appelsApi === 0, String(appelsApi));

  // --- 3. export CSV via le même point d'entrée -----------------------------
  const reponseCsv = await appelerDemo();
  const lignesCsv = String(reponseCsv.csv).trim().split('\r\n');
  check('the CSV has 24 lines (1 header + 23 findings)', lignesCsv.length === 24, String(lignesCsv.length));
  check(
    'the CSV carries the 9 columns of the sheet, in English',
    lignesCsv[0] === '"criterion","level","confidence","source","resource","location","value","message","to_verify"',
    lignesCsv[0]
  );
  check('no API call during the CSV export', appelsApi === 0, String(appelsApi));

  // --- 4. le mode démo ne contient aucune donnée de site --------------------
  const corps = JSON.stringify(reponse);
  check(
    'the response contains neither a site URL nor a token',
    !/https?:\/\/[^\s"]*atlassian\.net/.test(corps) && !/Bearer\s/.test(corps)
  );
  check(
    'the response contains neither a key, nor a password, nor a secret',
    !/(api[_-]?key|secret|password|passwd|token)\s*[=:]\s*["'][^"']{8,}/i.test(corps)
  );

  api.asApp = asAppOriginal;

  console.log('');
  if (failures === 0) {
    console.log('== ALL PASS (' + checks + ' checks): the resolver returns the 23/23 verdict ==');
    process.exit(0);
  }
  console.log('== ' + failures + ' FAILURE(S) on ' + checks + ' checks ==');
  process.exit(1);
})().catch((e) => {
  api.asApp = asAppOriginal;
  console.log('FAIL  the handler threw an exception: ' + (e && e.stack));
  process.exit(1);
});
