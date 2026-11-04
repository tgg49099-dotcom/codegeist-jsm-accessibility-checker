/**
 * Test hors ligne du POINT D'ENTRÉE de l'app (src/index.js) en mode démo.
 *
 * test-demo.js prouve que le MOTEUR (src/regles.js + src/demo.js) détecte les
 * 23 fautives. Ce test prouve que l'APP elle-même — le handler du web
 * trigger, c'est-à-dire le code qui sera réellement déployé — renvoie ce
 * verdict, et qu'elle ne fait AUCUN appel à un site en mode démo.
 *
 * Usage : node test-app-demo.js
 * RC 0 = tout passe, RC 1 = au moins un contrôle échoue.
 */
const path = require('path');
const api = require('@forge/api');
const app = require(path.join(__dirname, 'src', 'index.js'));

let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

// --- 0. l'API Atlassian est neutralisée : le mode démo ne doit rien appeler --
const asAppOriginal = api.asApp;
let appelsApi = 0;
api.asApp = () => {
  appelsApi += 1;
  throw new Error('APPEL API INTERDIT DANS LE MODE DÉMO');
};

// --- 1. le handler renvoie le rapport de démonstration ------------------------
(async () => {
  // La forme OFFICIELLE de `queryParameters` est `{ [clé]: string[] }`
  // (référence Atlassian « Web triggers ») : c'est cette forme qui est testée
  // en premier, parce que c'est celle que la plateforme envoie réellement.
  const reponse = await app.run({ queryParameters: { demo: ['1'] } });
  check('le handler répond 200', reponse.statusCode === 200, String(reponse.statusCode));
  check(
    'le Content-Type est du JSON',
    (reponse.headers['Content-Type'][0] || '').indexOf('application/json') === 0,
    reponse.headers['Content-Type'][0]
  );

  let rapport = null;
  try {
    rapport = JSON.parse(reponse.body);
  } catch (e) {
    check('le corps est du JSON analysable', false, e.message);
  }
  if (!rapport) {
    process.exit(1);
  }

  check('le rapport est en mode démo', rapport.mode === 'demo', rapport.mode);
  check(
    'le rapport dit d\'où le drapeau a été lu',
    rapport.mode_declare_par === 'queryParameters.demo',
    rapport.mode_declare_par
  );
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
    rapport.nature.indexOf('aucun appel') !== -1 || rapport.limites.join(' ').indexOf('ne lit rien') !== -1
  );
  check(
    'le rapport rappelle qu\'un constat n\'est pas une conformité',
    rapport.limites.join(' ').indexOf('jamais un verdict de conformité') !== -1
  );

  // --- 2. aucun appel API n'a été fait --------------------------------------
  check('aucun appel à l\'API Atlassian en mode démo', appelsApi === 0, String(appelsApi));

  // --- 3. export CSV via le même point d'entrée -----------------------------
  const reponseCsv = await app.run({ queryParameters: { demo: ['1'], format: ['csv'] } });
  check(
    'l\'export CSV répond en text/csv',
    (reponseCsv.headers['Content-Type'][0] || '').indexOf('text/csv') === 0,
    reponseCsv.headers['Content-Type'][0]
  );
  const lignesCsv = String(reponseCsv.body).trim().split('\r\n');
  check('le CSV a 24 lignes (1 en-tête + 23 constats)', lignesCsv.length === 24, String(lignesCsv.length));
  check(
    'le CSV porte les 9 colonnes de la fiche',
    lignesCsv[0] === '"critere","niveau","confiance","source","ressource","emplacement","valeur","message","a_verifier"',
    lignesCsv[0]
  );
  check('aucun appel API pendant l\'export CSV', appelsApi === 0, String(appelsApi));

  // --- 4. le détecteur ne se déclenche pas par accident ----------------------
  const d = app._detecterDemo;
  check('sans drapeau : pas de mode démo (requête vide)', d({}).demo === false);
  check(
    'sans drapeau : pas de mode démo (queryParameters vides)',
    d({ queryParameters: {} }).demo === false
  );
  check(
    'sans drapeau : pas de mode démo (autres paramètres)',
    d({ queryParameters: { foo: 'bar' } }).demo === false
  );
  check(
    'sans drapeau : pas de mode démo (URL sans demo)',
    d({ queryString: 'format=csv' }).demo === false
  );
  check(
    '?demo=1 dans la query string : mode démo',
    d({ queryString: 'demo=1' }).demo === true && d({ queryString: 'demo=1' }).declencheur === 'queryString'
  );
  check(
    '?demo=1&format=csv : mode démo avec le format CSV',
    d({ queryString: 'demo=1&format=csv' }).format === 'csv'
  );
  check(
    'body.demo = true : mode démo',
    d({ body: { demo: true } }).demo === true && d({ body: { demo: true } }).declencheur === 'body.demo'
  );
  check(
    'demo=0 : pas de mode démo',
    d({ queryParameters: { demo: '0' } }).demo === false
  );
  // La forme documentée par Atlassian : chaque paramètre est un TABLEAU.
  check(
    'forme officielle {demo: ["1"]} : mode démo',
    d({ queryParameters: { demo: ['1'] } }).demo === true &&
      d({ queryParameters: { demo: ['1'] } }).declencheur === 'queryParameters.demo'
  );
  check(
    'forme officielle {demo: ["0"]} : pas de mode démo',
    d({ queryParameters: { demo: ['0'] } }).demo === false
  );
  check(
    'forme officielle {demo: ["1"], format: ["csv"]} : export CSV',
    d({ queryParameters: { demo: ['1'], format: ['csv'] } }).format === 'csv'
  );
  check(
    'forme officielle {mode: ["demo"]} : mode démo',
    d({ queryParameters: { mode: ['demo'] } }).demo === true
  );

  // --- 5. le mode démo est-il bien « sans compte » ? -------------------------
  // (le rapport ne doit contenir aucune URL de site, aucun identifiant de
  //  tenant, aucun jeton)
  const corps = JSON.stringify(rapport);
  check(
    'le rapport ne contient ni URL de site ni jeton',
    !/https?:\/\/[^\s"]*atlassian\.net/.test(corps) && !/Bearer\s/.test(corps)
  );

  api.asApp = asAppOriginal;

  console.log('');
  if (failures === 0) {
    console.log('== TOUT PASS (' + checks + ' contrôles) : le point d\'entrée de l\'app renvoie le verdict 23/23 ==');
    process.exit(0);
  }
  console.log('== ' + failures + ' ÉCHEC(S) sur ' + checks + ' contrôles ==');
  process.exit(1);
})().catch((e) => {
  api.asApp = asAppOriginal;
  console.log('FAIL  le handler a levé une exception : ' + (e && e.stack));
  process.exit(1);
});
