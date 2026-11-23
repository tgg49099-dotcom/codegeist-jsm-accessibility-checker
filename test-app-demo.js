/**
 * Offline test of the app entry point in DEMO mode, through the RESOLVER
 * (src/resolvers.js).
 *
 * test-demo.js proves that the ENGINE (src/regles.js + src/demo.js) detects
 * the 24 issues (1.3.5 rule updated 23/11/2026). This test proves that the APP itself — the resolver that
 * the administration page calls, that is to say the code that will really
 * be deployed — returns that verdict, and that it makes NO call to any site
 * in demo mode.
 *
 * Since 05/11/2026: the entry point is `invoke('scanDemo', …)`, not a public
 * URL. A call with no signed-in account must be refused (GATE): demo
 * mode is not a back door.
 *
 * Usage: node test-app-demo.js
 * RC 0 = everything passes, RC 1 = at least one check fails.
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

// --- 0. the Atlassian API is neutralized: demo mode must call nothing --------
const asAppOriginal = api.asApp;
let appelsApi = 0;
api.asApp = () => {
  appelsApi += 1;
  throw new Error('API CALL FORBIDDEN IN DEMO MODE');
};

// --- 1. the resolver returns the demo report ---------------------------------
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
  check('the report contains 24 findings', rapport.constats.length === 24, String(rapport.constats.length));
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
    '24 seeded issues detected out of 24',
    rapport.contrat.fautives_detectees === 24 && rapport.contrat.fautives_total === 24,
    rapport.contrat.fautives_detectees + '/' + rapport.contrat.fautives_total
  );
  check(
    '0 missed seeded issue',
    rapport.contrat.fautives_manquees.length === 0,
    rapport.contrat.fautives_manquees.join(',')
  );
  check(
    '0 false positive on the 5 negative checks',
    rapport.contrat.faux_positifs.length === 0 && rapport.contrat.controles_negatifs_total === 5,
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

  // --- 2. no API call was made ----------------------------------------------
  check('no call to the Atlassian API in demo mode', appelsApi === 0, String(appelsApi));

  // --- 3. CSV export through the same entry point ---------------------------
  const reponseCsv = await appelerDemo();
  const lignesCsv = String(reponseCsv.csv).trim().split('\r\n');
  check('the CSV has 25 lines (1 header + 24 findings)', lignesCsv.length === 25, String(lignesCsv.length));
  check(
    'the CSV carries the 9 columns of the sheet, in English',
    lignesCsv[0] === '"criterion","level","confidence","source","resource","location","value","message","to_verify"',
    lignesCsv[0]
  );
  check('no API call during the CSV export', appelsApi === 0, String(appelsApi));

  // --- 4. demo mode contains no site data -----------------------------------
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
    console.log('== ALL PASS (' + checks + ' checks): the resolver returns the 24/24 verdict ==');
    process.exit(0);
  }
  console.log('== ' + failures + ' FAILURE(S) on ' + checks + ' checks ==');
  process.exit(1);
})().catch((e) => {
  api.asApp = asAppOriginal;
  console.log('FAIL  the handler threw an exception: ' + (e && e.stack));
  process.exit(1);
});
