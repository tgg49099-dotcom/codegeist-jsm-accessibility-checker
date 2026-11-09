/**
 * Test hors ligne du CONTRAT DU RESOLVER (src/resolvers.js).
 *
 * Le contrat, en une phrase : **une donnée personnelle reçue dans l'appel
 * (champs `nom` et `e-mail`) n'est JAMAIS renvoyée en clair**, et le masque
 * ne s'applique qu'aux champs RÉELLEMENT présents (un champ absent n'est
 * jamais inventé).
 *
 * CYCLE 128 (05/11/2026) : le point d'entrée testé n'est plus un handler
 * HTTP public, c'est le resolver que la page d'administration appelle
 * (`invoke('scan', …)` / `invoke('scanDemo', …)`). On teste donc :
 *   1. les fonctions pures (masque, collecte des champs, balayage) ;
 *   2. la GÂCHE D'IDENTITÉ : un appel sans compte connecté est REFUSÉ, un
 *      appel avec un compte est accepté, et la réponse dit qui a demandé ;
 *   3. le point d'entrée réel, en mode DÉMO (aucun appel à un site) ;
 *   4. le point d'entrée réel, en mode SCAN, avec une API Atlassian
 *      neutralisée — et, surtout, avec des données de site qui contiennent
 *      LE NOM ET L'E-MAIL : on vérifie que le balayage les masque aussi, et
 *      pas seulement que l'app « oublie » de les renvoyer.
 *
 * Usage : node test-contrat-http.js
 * RC 0 = tout passe, RC 1 = au moins un contrôle échoue.
 *
 * Le contre-proof (le harnais doit devenir ROUGE quand le contrat est cassé)
 * est dans test-contrat-http-contre-epreuve.js.
 */
const fs = require('fs');
const path = require('path');
const api = require('@forge/api');
const app = require(path.join(__dirname, 'src', 'index.js'));
const resolver = require(path.join(__dirname, 'src', 'resolvers.js'));

let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

const c = app._contratPv;
const NOM = 'Camille Dupont';
const EMAIL = 'camille.dupont@example.com';

// The call shape @forge/resolver gives to a resolver function:
//   handler({ call: { functionKey, payload }, context }, { principal: { accountId } })
// The account of the signed-in user is carried by `principal.accountId`
// (that is exactly where @forge/resolver reads it from — see
// node_modules/@forge/resolver/out/index.js).
const COMPTE = 'acc-id-utilisateur-connecte';
const runtime = { principal: { accountId: COMPTE } };

function appeler(functionKey, payload, contexte, runtimePayload) {
  return resolver.handler(
    { call: { functionKey: functionKey, payload: payload || {} }, context: contexte || {} },
    runtimePayload === undefined ? runtime : runtimePayload
  );
}

// --- 1. le masque (fonction pure) --------------------------------------------

check('MASQUE-01 un nom de plus de 3 caractères ne rend que sa première lettre',
  c.masquerValeur(NOM) === 'C***', c.masquerValeur(NOM));
check('MASQUE-02 un e-mail ne rend ni la partie locale ni le domaine',
  c.masquerValeur(EMAIL) === 'c***@***', c.masquerValeur(EMAIL));
check('MASQUE-03 une chaîne vide rend "***" (et jamais la valeur)',
  c.masquerValeur('') === '***', JSON.stringify(c.masquerValeur('')));
check('MASQUE-04 une valeur de moins de 3 caractères rend "***" (jamais la valeur)',
  c.masquerValeur('AB') === '***', JSON.stringify(c.masquerValeur('AB')));
check('MASQUE-05 une valeur d\'un seul caractère rend "***" (jamais la valeur)',
  c.masquerValeur('A') === '***', JSON.stringify(c.masquerValeur('A')));
check('MASQUE-06 les caractères spéciaux ne fuient pas dans le masque',
  c.masquerValeur('O\'Brien "x" <b> & é') === 'O***', c.masquerValeur('O\'Brien "x" <b> & é'));
check('MASQUE-07 un e-mail à partie locale courte rend "***@***"',
  c.masquerValeur('a@b.co') === '***@***', c.masquerValeur('a@b.co'));
check('MASQUE-08 le masque ne contient jamais la valeur qu\'il masque',
  [NOM, EMAIL, '', 'AB', 'A', 'O\'Brien "x" <b> & é', 'a@b.co'].every(
    (v) => v.length === 0 || !c.masquerValeur(v).includes(v)
  ));

// --- 2. la collecte des champs présents ---------------------------------------

check('RECU-01 un appel vide ne reçoit aucun champ',
  Object.keys(c.champsPvRecus({})).length === 0);
check('RECU-02 les paramètres de requête sont lus (forme officielle { nom: [..] })',
  c.champsPvRecus({ queryParameters: { nom: [NOM] } }).nom === NOM);
check('RECU-03 un paramètre présent mais VIDE reste présent (et n\'est pas perdu)',
  c.champsPvRecus({ queryParameters: { nom: [''] } }).nom === '');
check('RECU-04 l\'alias "email" est reconnu comme le champ "e-mail"',
  c.champsPvRecus({ queryParameters: { email: [EMAIL] } })['e-mail'] === EMAIL);
check('RECU-05 le corps de requête (objet) est lu',
  c.champsPvRecus({ body: { nom: NOM } }).nom === NOM);
check('RECU-06 le corps de requête (JSON) est lu',
  c.champsPvRecus({ body: JSON.stringify({ 'e-mail': EMAIL }) })['e-mail'] === EMAIL);
check('RECU-07 la query string brute est décodée',
  c.champsPvRecus({ queryString: '?nom=Camille%20Dupont' }).nom === NOM);
check('RECU-08 un paramètre absent n\'est jamais inventé',
  c.champsPvRecus({ queryParameters: { autre: ['x'] } }).nom === undefined &&
    c.champsPvRecus({ queryParameters: { autre: ['x'] } })['e-mail'] === undefined);
check('RECU-09 un en-tête HTTP portant le même nom est traité comme un champ',
  c.champsPvRecus({ headers: { 'e-mail': EMAIL } })['e-mail'] === EMAIL);
check('RECU-10 les paramètres de requête priment sur le corps',
  c.champsPvRecus({ queryParameters: { nom: [NOM] }, body: { nom: 'Autre' } }).nom === NOM);
check('RECU-11 espaces autour du nom de champ dans les queryParameters',
  c.champsPvRecus({ queryParameters: { ' nom ': [NOM] } }).nom === NOM);
check('RECU-12 espaces autour du nom de champ dans les en-têtes HTTP',
  c.champsPvRecus({ headers: { ' e-mail ': EMAIL } })['e-mail'] === EMAIL);
check('RECU-13 corps texte brut (form-urlencoded) lu',
  c.champsPvRecus({ body: 'nom=Camille%20Dupont&email=camille.dupont%40example.com' }).nom === NOM &&
    c.champsPvRecus({ body: 'nom=Camille%20Dupont&email=camille.dupont%40example.com' })['e-mail'] === EMAIL);
check('RECU-14 corps Buffer brut (form-urlencoded) lu',
  c.champsPvRecus({ body: Buffer.from('nom=Camille%20Dupont') }).nom === NOM);
check('RECU-15 paramètres répétés : toutes les valeurs sont collectées pour le masquage',
  (() => {
    const r = c.champsPvRecus({ queryParameters: { nom: ['Camille', 'Dupont'] } });
    return Array.isArray(r.nom) ? r.nom.includes('Camille') && r.nom.includes('Dupont') : r.nom === 'Camille,Dupont';
  })());
check('RECU-16 le payload de la page (objet) est lu comme un corps',
  c.champsPvRecus({ body: { nom: NOM, 'e-mail': EMAIL } })['e-mail'] === EMAIL);

// --- 3. la GÂCHE D'IDENTITÉ : seul un utilisateur connecté déclenche un scan --

(async () => {
  const sansIdentite = await appeler('scanDemo', {}, {}, {});
  check('GATE-01 un appel sans compte connecté est REFUSÉ',
    sansIdentite.ok === false && sansIdentite.error === 'NOT_AUTHENTICATED',
    JSON.stringify(sansIdentite).slice(0, 120));
  check('GATE-02 le refus ne contient aucun rapport',
    !sansIdentite.report && !sansIdentite.csv);

  const avecIdentite = await appeler('scanDemo', {}, {}, runtime);
  check('GATE-03 un appel avec un compte connecté est accepté',
    avecIdentite.ok === true, JSON.stringify(avecIdentite).slice(0, 80));
  check('GATE-04 la réponse dit QUI a lancé le scan',
    avecIdentite.requestedBy && avecIdentite.requestedBy.accountId === COMPTE,
    JSON.stringify(avecIdentite.requestedBy));

  // Le compte peut aussi arriver par le contexte de l'appel : c'est le même
  // compte, porté par l'autre canal. Le resolver ne doit pas le perdre.
  const parContexte = await appeler('scanDemo', {}, { accountId: COMPTE }, {});
  check('GATE-05 le compte porté par le contexte de l\'appel est accepté aussi',
    parContexte.ok === true && parContexte.requestedBy.accountId === COMPTE);

  const fonctionInconnue = await appeler('autreFonction', {}, {}, runtime);
  check('GATE-06 une fonction inconnue est refusée sans planter',
    fonctionInconnue.ok === false && fonctionInconnue.error === 'UNKNOWN_FUNCTION',
    JSON.stringify(fonctionInconnue).slice(0, 120));

  const renduPage = await resolver.handler({ context: {} }, runtime);
  check('GATE-07 l\'affichage de la page ne lance aucun scan et ne plante pas',
    renduPage.ok === true && renduPage.page === 'admin' && !renduPage.report,
    JSON.stringify(renduPage).slice(0, 120));

  // --- 4. le point d'entrée de l'app, en mode DÉMO : cas rouge ------------------

  // Le mode démo ne doit appeler AUCUNE API : les DEUX identités sont
  // neutralisées. Depuis le cycle 136, c'est `asUser` que le moteur emploie ;
  // `asApp` est neutralisée elle aussi, pour que le contrôle voie une
  // éventuelle régression vers une identité plus large.
  const asAppOriginal = api.asApp;
  const asUserOriginal = api.asUser;
  let appelsApi = 0;
  const apiInterdite = () => {
    appelsApi += 1;
    throw new Error('APPEL API INTERDIT DANS LE MODE DÉMO');
  };
  api.asApp = apiInterdite;
  api.asUser = apiInterdite;

  const rouge = await appeler('scanDemo', { nom: NOM, 'e-mail': EMAIL });
  const corpsRouge = JSON.stringify(rouge);

  check('ROUGE-01 la réponse ne contient pas le nom en clair',
    corpsRouge.indexOf(NOM) === -1, 'occurrence #' + corpsRouge.split(NOM).length);
  check('ROUGE-02 la réponse ne contient pas l\'e-mail en clair',
    corpsRouge.indexOf(EMAIL) === -1, 'occurrence #' + corpsRouge.split(EMAIL).length);
  check('ROUGE-03 la réponse ne contient pas le nom en clair, sans distinction de casse',
    corpsRouge.toLowerCase().indexOf(NOM.toLowerCase()) === -1);

  const rapportRouge = rouge.report;
  check('ROUGE-04 la réponse contient un rapport', !!rapportRouge);
  if (!rapportRouge) {
    api.asApp = asAppOriginal;
    api.asUser = asUserOriginal;
    process.exit(1);
  }

  check('ROUGE-05 l\'app déclare avoir reçu les deux champs',
    Array.isArray(rapportRouge.privacy.receivedFields) &&
      rapportRouge.privacy.receivedFields.join(',') === 'nom,e-mail',
    JSON.stringify(rapportRouge.privacy.receivedFields));
  check('ROUGE-06 le nom est renvoyé masqué',
    rapportRouge.privacy.maskedValues.nom === 'C***',
    JSON.stringify(rapportRouge.privacy.maskedValues.nom));
  check('ROUGE-07 l\'e-mail est renvoyé masqué',
    rapportRouge.privacy.maskedValues['e-mail'] === 'c***@***',
    JSON.stringify(rapportRouge.privacy.maskedValues['e-mail']));
  check('ROUGE-08 le rapport contient la phrase affichée dans l\'app',
    typeof rapportRouge.privacy.statement === 'string' &&
      rapportRouge.privacy.statement.indexOf('returned as a mask, never in clear text') !== -1);
  check('ROUGE-08b la phrase n\'affirme rien de plus que ce que l\'app fait',
    rapportRouge.privacy.statement.indexOf('never returns a name or e-mail address in clear text') === -1 &&
      rapportRouge.privacy.statement.indexOf('returned as it is') !== -1,
    rapportRouge.privacy.statement);
  check('ROUGE-09 le scan de démonstration est intact (23 constats)',
    rapportRouge.constats.length === 23, String(rapportRouge.constats.length));
  check('ROUGE-10 aucun appel à l\'API Atlassian en mode démo', appelsApi === 0, String(appelsApi));

  // --- 5. le point d'entrée de l'app, en mode DÉMO : cas vert ----------------

  const vert = await appeler('scanDemo', {});
  const rapportVert = vert.report;
  check('VERT-01 l\'app ne déclare aucun champ reçu',
    Array.isArray(rapportVert.privacy.receivedFields) &&
      rapportVert.privacy.receivedFields.length === 0,
    JSON.stringify(rapportVert.privacy.receivedFields));
  check('VERT-02 aucun masque n\'est inventé',
    rapportVert.privacy.maskedValues &&
      Object.keys(rapportVert.privacy.maskedValues).length === 0,
    JSON.stringify(rapportVert.privacy.maskedValues));
  check('VERT-03 ni "nom" ni "e-mail" n\'apparaissent dans la section privacy',
    !('nom' in rapportVert.privacy.maskedValues) &&
      !('e-mail' in rapportVert.privacy.maskedValues) &&
      rapportVert.privacy.receivedFields.indexOf('nom') === -1 &&
      rapportVert.privacy.receivedFields.indexOf('e-mail') === -1);
  check('VERT-04 le scan de démonstration est inchangé (23 constats)',
    rapportVert.constats.length === 23, String(rapportVert.constats.length));
  check('VERT-05 la réponse du cas vert contient bien un rapport', !!rapportVert);

  // --- 6. l'export CSV applique le contrat lui aussi ------------------------

  const csvRep = await appeler('scanDemo', { nom: NOM });
  const csv = String(csvRep.csv);
  check('CSV-01 l\'export CSV ne contient pas le nom en clair',
    csv.indexOf(NOM) === -1);
  check('CSV-02 l\'export CSV reste un CSV (24 lignes)',
    csv.trim().split('\r\n').length === 24,
    String(csv.trim().split('\r\n').length));

  // --- 7. mode SCAN : le balayage s'applique aussi aux données du site ------
  // L'API Atlassian est neutralisée par un faux site dont les DONNÉES
  // contiennent le nom et l'e-mail : on vérifie que la réponse les masque
  // (et pas qu'ils ont simplement disparu du faux site).
  api.asUser = () => ({
    requestJira: async (p) => {
      const chemin = String(p && p.value_ ? p.value_ : p);
      let body = {};
      if (chemin.indexOf('/rest/servicedeskapi/info') !== -1) {
        body = { isLicensedForUse: false };
      } else if (chemin.indexOf('/rest/api/3/field') !== -1) {
        body = [{ id: 'customfield_10001', name: NOM, description: EMAIL, custom: true, schema: { type: 'string' } }];
      } else if (chemin.indexOf('/rest/api/3/project') !== -1) {
        body = [{ key: 'KAN' }];
      } else if (chemin.indexOf('/issuetypes') !== -1) {
        body = { issueTypes: [{ id: '1' }] };
      } else if (chemin.indexOf('/createmeta') !== -1) {
        body = { fields: [{ fieldId: 'summary', name: 'Summary' }] };
      } else if (chemin.indexOf('/search/jql') !== -1) {
        body = { issues: [{ key: 'KAN-1', fields: { summary: EMAIL, description: null } }] };
      }
      return { status: 200, json: async () => body };
    },
  });

  const scanRep = await appeler('scan', { nom: NOM, 'e-mail': EMAIL });
  const corpsScan = JSON.stringify(scanRep);
  check('SCAN-01 la réponse du scan ne contient pas le nom en clair',
    corpsScan.indexOf(NOM) === -1, 'occurrence #' + corpsScan.split(NOM).length);
  check('SCAN-02 la réponse du scan ne contient pas l\'e-mail en clair',
    corpsScan.indexOf(EMAIL) === -1, 'occurrence #' + corpsScan.split(EMAIL).length);
  check('SCAN-03 le scan a bien lu les données du site (elles sont masquées, pas absentes)',
    corpsScan.indexOf('C***') !== -1 && corpsScan.indexOf('c***@***') !== -1);
  check('SCAN-04 la réponse du scan contient un rapport',
    !!scanRep.report && Array.isArray(scanRep.report.findings));
  const rapportScan = scanRep.report;
  check('SCAN-05 la section privacy est présente dans le rapport de scan',
    !!rapportScan.privacy &&
      rapportScan.privacy.receivedFields.join(',') === 'nom,e-mail' &&
      rapportScan.privacy.maskedValues.nom === 'C***');

  // Fuite par espaces autour du champ, par corps texte/buffer et paramètres répétés dans le scan
  const scanFuites = await appeler('scan', { ' nom ': ['Camille', 'Dupont'] });
  const corpsScanFuites = JSON.stringify(scanFuites);
  check('SCAN-06 les données avec espaces autour du nom ne fuient pas dans la réponse',
    corpsScanFuites.indexOf('Camille') === -1);
  check('SCAN-07 les paramètres répétés ne fuient pas dans la réponse',
    corpsScanFuites.indexOf('Dupont') === -1);
  check('SCAN-08 le corps url-encoded ne fuit pas dans la réponse',
    corpsScanFuites.indexOf('camille.dupont@example.com') === -1);

  // Le contenu lu SUR LE SITE est renvoyé tel quel : c'est ce contenu que
  // l'app vérifie, et c'est ce que dit la phrase affichée dans la réponse.
  // Ce contrôle lie la phrase au comportement : si le contenu du site était
  // masqué un jour, la phrase devrait le dire — et ce test le signalerait.
  const scanSansRecu = await appeler('scan', {});
  const corpsSansRecu = JSON.stringify(scanSansRecu);
  check('SCAN-09 le contenu du site non reçu dans la requête est renvoyé tel quel',
    corpsSansRecu.indexOf(NOM) !== -1 && corpsSansRecu.indexOf(EMAIL) !== -1,
    'nom #' + corpsSansRecu.split(NOM).length + ' / e-mail #' + corpsSansRecu.split(EMAIL).length);

  api.asApp = asAppOriginal;
  api.asUser = asUserOriginal;

  // --- 8. la requête n'est jamais journalisée --------------------------------
  // Le contrôle porte sur le CODE (arbre syntaxique), pas sur le texte : un
  // « console.log » dans un commentaire ne compte pas, et inversement.
  const acorn = require('acorn');
  let appelsConsole = 0;
  for (const fichier of ['index.js', 'resolvers.js']) {
    const source = fs.readFileSync(path.join(__dirname, 'src', fichier), 'utf8');
    const arbre = acorn.parse(source, { ecmaVersion: 2022 });
    (function parcourir(noeud) {
      if (!noeud || typeof noeud !== 'object') return;
      if (Array.isArray(noeud)) {
        noeud.forEach(parcourir);
        return;
      }
      if (noeud.type === 'MemberExpression' && noeud.object && noeud.object.name === 'console') {
        appelsConsole += 1;
      }
      for (const cle of Object.keys(noeud)) {
        if (cle === 'type' || cle === 'start' || cle === 'end' || cle === 'loc') continue;
        parcourir(noeud[cle]);
      }
    })(arbre);
  }
  check('LOG-01 le code de l\'app ne contient AUCUNE instruction de journalisation',
    appelsConsole === 0, String(appelsConsole));

  console.log('');
  if (failures === 0) {
    console.log('== TOUT PASS (' + checks + ' contrôles) : le contrat du resolver tient ==');
    process.exit(0);
  }
  console.log('== ' + failures + ' ÉCHEC(S) sur ' + checks + ' contrôles ==');
  process.exit(1);
})().catch((e) => {
  console.log('FAIL  le handler a levé une exception : ' + (e && e.stack));
  process.exit(1);
});
