/**
 * Offline test of the RESOLVER CONTRACT (src/resolvers.js).
 *
 * The contract, in one sentence: **a personal datum received in the call
 * (fields `nom` and `e-mail`) is NEVER returned in clear text**, and the mask
 * only applies to the fields REALLY present (an absent field is never
 * invented).
 *
 * Since 05/11/2026: the entry point under test is no longer a public
 * HTTP handler, it is the resolver that the administration page calls
 * (`invoke('scan', …)` / `invoke('scanDemo', …)`). We therefore test:
 *   1. the pure functions (mask, field collection, scan);
 *   2. the IDENTITY GATE: a call without a signed-in account is REFUSED, a
 *      call with an account is accepted, and the response says who asked;
 *   3. the real entry point, in DEMO mode (no call to a site);
 *   4. the real entry point, in SCAN mode, with a neutralised Atlassian
 *      API — and, above all, with site data that contains
 *      THE NAME AND THE E-MAIL: we verify that the scan masks them too, and
 *      not only that the app "forgets" to return them.
 *
 * Usage: node test-contrat-http.js
 * RC 0 = everything passes, RC 1 = at least one check fails.
 *
 * The counter-proof (the harness must turn RED when the contract is broken)
 * is in test-contrat-http-contre-epreuve.js.
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

// --- 1. the mask (pure function) ---------------------------------------------

check('MASQUE-01 a name longer than 3 characters renders only its first letter',
  c.masquerValeur(NOM) === 'C***', c.masquerValeur(NOM));
check('MASQUE-02 an e-mail renders neither the local part nor the domain',
  c.masquerValeur(EMAIL) === 'c***@***', c.masquerValeur(EMAIL));
check('MASQUE-03 an empty string renders "***" (and never the value)',
  c.masquerValeur('') === '***', JSON.stringify(c.masquerValeur('')));
check('MASQUE-04 a value shorter than 3 characters renders "***" (never the value)',
  c.masquerValeur('AB') === '***', JSON.stringify(c.masquerValeur('AB')));
check('MASQUE-05 a one-character value renders "***" (never the value)',
  c.masquerValeur('A') === '***', JSON.stringify(c.masquerValeur('A')));
check('MASQUE-06 special characters do not leak into the mask',
  c.masquerValeur('O\'Brien "x" <b> & é') === 'O***', c.masquerValeur('O\'Brien "x" <b> & é'));
check('MASQUE-07 an e-mail with a short local part renders "***@***"',
  c.masquerValeur('a@b.co') === '***@***', c.masquerValeur('a@b.co'));
check('MASQUE-08 the mask never contains the value it masks',
  [NOM, EMAIL, '', 'AB', 'A', 'O\'Brien "x" <b> & é', 'a@b.co'].every(
    (v) => v.length === 0 || !c.masquerValeur(v).includes(v)
  ));

// --- 2. collecting the fields that are present --------------------------------

check('RECU-01 an empty call receives no field',
  Object.keys(c.champsPvRecus({})).length === 0);
check('RECU-02 query parameters are read (official shape { nom: [..] })',
  c.champsPvRecus({ queryParameters: { nom: [NOM] } }).nom === NOM);
check('RECU-03 a present but EMPTY parameter stays present (and is not lost)',
  c.champsPvRecus({ queryParameters: { nom: [''] } }).nom === '');
check('RECU-04 the "email" alias is recognized as the "e-mail" field',
  c.champsPvRecus({ queryParameters: { email: [EMAIL] } })['e-mail'] === EMAIL);
check('RECU-05 the request body (object) is read',
  c.champsPvRecus({ body: { nom: NOM } }).nom === NOM);
check('RECU-06 the request body (JSON) is read',
  c.champsPvRecus({ body: JSON.stringify({ 'e-mail': EMAIL }) })['e-mail'] === EMAIL);
check('RECU-07 the raw query string is decoded',
  c.champsPvRecus({ queryString: '?nom=Camille%20Dupont' }).nom === NOM);
check('RECU-08 an absent parameter is never invented',
  c.champsPvRecus({ queryParameters: { autre: ['x'] } }).nom === undefined &&
    c.champsPvRecus({ queryParameters: { autre: ['x'] } })['e-mail'] === undefined);
check('RECU-09 an HTTP header carrying the same name is treated as a field',
  c.champsPvRecus({ headers: { 'e-mail': EMAIL } })['e-mail'] === EMAIL);
check('RECU-10 query parameters take precedence over the body',
  c.champsPvRecus({ queryParameters: { nom: [NOM] }, body: { nom: 'Autre' } }).nom === NOM);
check('RECU-11 spaces around the field name in queryParameters',
  c.champsPvRecus({ queryParameters: { ' nom ': [NOM] } }).nom === NOM);
check('RECU-12 spaces around the field name in HTTP headers',
  c.champsPvRecus({ headers: { ' e-mail ': EMAIL } })['e-mail'] === EMAIL);
check('RECU-13 raw text body (form-urlencoded) read',
  c.champsPvRecus({ body: 'nom=Camille%20Dupont&email=camille.dupont%40example.com' }).nom === NOM &&
    c.champsPvRecus({ body: 'nom=Camille%20Dupont&email=camille.dupont%40example.com' })['e-mail'] === EMAIL);
check('RECU-14 raw Buffer body (form-urlencoded) read',
  c.champsPvRecus({ body: Buffer.from('nom=Camille%20Dupont') }).nom === NOM);
check('RECU-15 repeated parameters: all values are collected for masking',
  (() => {
    const r = c.champsPvRecus({ queryParameters: { nom: ['Camille', 'Dupont'] } });
    return Array.isArray(r.nom) ? r.nom.includes('Camille') && r.nom.includes('Dupont') : r.nom === 'Camille,Dupont';
  })());
check('RECU-16 the page payload (object) is read as a body',
  c.champsPvRecus({ body: { nom: NOM, 'e-mail': EMAIL } })['e-mail'] === EMAIL);

// --- 3. the IDENTITY GATE: only a signed-in user triggers a scan --------------

(async () => {
  const sansIdentite = await appeler('scanDemo', {}, {}, {});
  check('GATE-01 a call without a signed-in account is REFUSED',
    sansIdentite.ok === false && sansIdentite.error === 'NOT_AUTHENTICATED',
    JSON.stringify(sansIdentite).slice(0, 120));
  check('GATE-02 the refusal contains no report',
    !sansIdentite.report && !sansIdentite.csv);

  const avecIdentite = await appeler('scanDemo', {}, {}, runtime);
  check('GATE-03 a call with a signed-in account is accepted',
    avecIdentite.ok === true, JSON.stringify(avecIdentite).slice(0, 80));
  check('GATE-04 the response says WHO started the scan',
    avecIdentite.requestedBy && avecIdentite.requestedBy.accountId === COMPTE,
    JSON.stringify(avecIdentite.requestedBy));

  // The account can also arrive through the call context: it is the same
  // account, carried by the other channel. The resolver must not lose it.
  const parContexte = await appeler('scanDemo', {}, { accountId: COMPTE }, {});
  check('GATE-05 the account carried by the call context is accepted too',
    parContexte.ok === true && parContexte.requestedBy.accountId === COMPTE);

  const fonctionInconnue = await appeler('autreFonction', {}, {}, runtime);
  check('GATE-06 an unknown function is refused without crashing',
    fonctionInconnue.ok === false && fonctionInconnue.error === 'UNKNOWN_FUNCTION',
    JSON.stringify(fonctionInconnue).slice(0, 120));

  const renduPage = await resolver.handler({ context: {} }, runtime);
  check('GATE-07 rendering the page starts no scan and does not crash',
    renduPage.ok === true && renduPage.page === 'admin' && !renduPage.report,
    JSON.stringify(renduPage).slice(0, 120));

  // --- 4. the entry point of the app, in DEMO mode: red case --------------------

  // Demo mode must call NO API: BOTH identities are
  // neutralised. Since the identity fix, the engine uses `asUser`;
  // `asApp` is neutralised too, so that the check sees a possible
  // regression to a broader identity.
  const asAppOriginal = api.asApp;
  const asUserOriginal = api.asUser;
  let appelsApi = 0;
  const apiInterdite = () => {
    appelsApi += 1;
    throw new Error('FORBIDDEN API CALL IN DEMO MODE');
  };
  api.asApp = apiInterdite;
  api.asUser = apiInterdite;

  const rouge = await appeler('scanDemo', { nom: NOM, 'e-mail': EMAIL });
  const corpsRouge = JSON.stringify(rouge);

  check('ROUGE-01 the response does not contain the name in clear text',
    corpsRouge.indexOf(NOM) === -1, 'occurrence #' + corpsRouge.split(NOM).length);
  check('ROUGE-02 the response does not contain the e-mail in clear text',
    corpsRouge.indexOf(EMAIL) === -1, 'occurrence #' + corpsRouge.split(EMAIL).length);
  check('ROUGE-03 the response does not contain the name in clear text, case-insensitively',
    corpsRouge.toLowerCase().indexOf(NOM.toLowerCase()) === -1);

  const rapportRouge = rouge.report;
  check('ROUGE-04 the response contains a report', !!rapportRouge);
  if (!rapportRouge) {
    api.asApp = asAppOriginal;
    api.asUser = asUserOriginal;
    process.exit(1);
  }

  check('ROUGE-05 the app declares it received both fields',
    Array.isArray(rapportRouge.privacy.receivedFields) &&
      rapportRouge.privacy.receivedFields.join(',') === 'nom,e-mail',
    JSON.stringify(rapportRouge.privacy.receivedFields));
  check('ROUGE-06 the name is returned masked',
    rapportRouge.privacy.maskedValues.nom === 'C***',
    JSON.stringify(rapportRouge.privacy.maskedValues.nom));
  check('ROUGE-07 the e-mail is returned masked',
    rapportRouge.privacy.maskedValues['e-mail'] === 'c***@***',
    JSON.stringify(rapportRouge.privacy.maskedValues['e-mail']));
  check('ROUGE-08 the report contains the statement displayed in the app',
    typeof rapportRouge.privacy.statement === 'string' &&
      rapportRouge.privacy.statement.indexOf('returned as a mask, never in clear text') !== -1);
  check('ROUGE-08b the statement does not claim more than what the app does',
    rapportRouge.privacy.statement.indexOf('never returns a name or e-mail address in clear text') === -1 &&
      rapportRouge.privacy.statement.indexOf('returned as it is') !== -1,
    rapportRouge.privacy.statement);
  check('LIMITE-01 the limits say the mask ignores the case',
    rapportRouge.privacy.limits.join(' ').indexOf('whatever its case') !== -1,
    rapportRouge.privacy.limits.join(' | '));
  check('LIMITE-02 the limits say the mask replaces the whole occurrence, even inside a longer word',
    rapportRouge.privacy.limits.join(' ').indexOf('even inside a longer word') !== -1,
    rapportRouge.privacy.limits.join(' | '));
  const balayage = c.balayerNoeud(
    { texte: 'camille dupont a ecrit CAMILLE DUPONT' },
    c.remplacementsPv({ nom: NOM })
  );
  check('LIMITE-03 the mask really ignores the case (the statement is true)',
    !/camille dupont/i.test(String(balayage.texte)) && /C\\*\\*\\*/.test(String(balayage.texte)),
    JSON.stringify(balayage.texte));
  check('ROUGE-09 the demo scan is intact (24 findings)',
    rapportRouge.constats.length === 24, String(rapportRouge.constats.length));
  check('ROUGE-10 no call to the Atlassian API in demo mode', appelsApi === 0, String(appelsApi));

  // --- 5. the entry point of the app, in DEMO mode: green case ---------------

  const vert = await appeler('scanDemo', {});
  const rapportVert = vert.report;
  check('VERT-01 the app declares no received field',
    Array.isArray(rapportVert.privacy.receivedFields) &&
      rapportVert.privacy.receivedFields.length === 0,
    JSON.stringify(rapportVert.privacy.receivedFields));
  check('VERT-02 no mask is invented',
    rapportVert.privacy.maskedValues &&
      Object.keys(rapportVert.privacy.maskedValues).length === 0,
    JSON.stringify(rapportVert.privacy.maskedValues));
  check('VERT-03 neither "nom" nor "e-mail" appear in the privacy section',
    !('nom' in rapportVert.privacy.maskedValues) &&
      !('e-mail' in rapportVert.privacy.maskedValues) &&
      rapportVert.privacy.receivedFields.indexOf('nom') === -1 &&
      rapportVert.privacy.receivedFields.indexOf('e-mail') === -1);
  check('VERT-04 the demo scan is unchanged (24 findings)',
    rapportVert.constats.length === 24, String(rapportVert.constats.length));
  check('VERT-05 the green case response does contain a report', !!rapportVert);

  // --- 6. the CSV export applies the contract too ---------------------------

  const csvRep = await appeler('scanDemo', { nom: NOM });
  const csv = String(csvRep.csv);
  check('CSV-01 the CSV export does not contain the name in clear text',
    csv.indexOf(NOM) === -1);
  check('CSV-02 the CSV export is still a CSV (25 lines)',
    csv.trim().split('\r\n').length === 25,
    String(csv.trim().split('\r\n').length));

  // --- 7. SCAN mode: the scan applies to the site data too ------------------
  // The Atlassian API is neutralised by a fake site whose DATA
  // contains the name and the e-mail: we verify that the response masks them
  // (and not that they simply vanished from the fake site).
  api.asUser = () => ({
    requestJira: async (p) => {
      const chemin = String(p && p.value_ ? p.value_ : p);
      let body = {};
      if (chemin.indexOf('/rest/api/3/mypermissions') !== -1) {
        // The administration check of the resolver (src/resolvers.js): on this
        // fake site, the signed-in account IS an administrator.
        body = {
          permissions: {
            ADMINISTER: { key: 'ADMINISTER', name: 'Administer Jira', type: 'GLOBAL', havePermission: true },
          },
        };
      } else if (chemin.indexOf('/rest/servicedeskapi/info') !== -1) {
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
  check('SCAN-01 the scan response does not contain the name in clear text',
    corpsScan.indexOf(NOM) === -1, 'occurrence #' + corpsScan.split(NOM).length);
  check('SCAN-02 the scan response does not contain the e-mail in clear text',
    corpsScan.indexOf(EMAIL) === -1, 'occurrence #' + corpsScan.split(EMAIL).length);
  check('SCAN-03 the scan did read the site data (they are masked, not absent)',
    corpsScan.indexOf('C***') !== -1 && corpsScan.indexOf('c***@***') !== -1);
  check('SCAN-04 the scan response contains a report',
    !!scanRep.report && Array.isArray(scanRep.report.findings));
  const rapportScan = scanRep.report;
  check('SCAN-05 the privacy section is present in the scan report',
    !!rapportScan.privacy &&
      rapportScan.privacy.receivedFields.join(',') === 'nom,e-mail' &&
      rapportScan.privacy.maskedValues.nom === 'C***');

  // Leak through spaces around the field, through a text/buffer body and repeated parameters in the scan
  const scanFuites = await appeler('scan', { ' nom ': ['Camille', 'Dupont'] });
  const corpsScanFuites = JSON.stringify(scanFuites);
  check('SCAN-06 data with spaces around the name does not leak into the response',
    corpsScanFuites.indexOf('Camille') === -1);
  check('SCAN-07 repeated parameters do not leak into the response',
    corpsScanFuites.indexOf('Dupont') === -1);
  check('SCAN-08 the url-encoded body does not leak into the response',
    corpsScanFuites.indexOf('camille.dupont@example.com') === -1);

  // The content read ON THE SITE is returned as is: it is that content the
  // app checks, and it is what the sentence displayed in the response says.
  // This check ties the sentence to the behaviour: if the site content were
  // ever masked, the sentence would have to say so — and this test would flag it.
  const scanSansRecu = await appeler('scan', {});
  const corpsSansRecu = JSON.stringify(scanSansRecu);
  check('SCAN-09 site content not received in the request is returned as is',
    corpsSansRecu.indexOf(NOM) !== -1 && corpsSansRecu.indexOf(EMAIL) !== -1,
    'nom #' + corpsSansRecu.split(NOM).length + ' / e-mail #' + corpsSansRecu.split(EMAIL).length);

  api.asApp = asAppOriginal;
  api.asUser = asUserOriginal;

  // --- 8. the request is never logged ----------------------------------------
  // The check is about the CODE (syntax tree), not the text: a
  // "console.log" inside a comment does not count, and the other way round.
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
  check('LOG-01 the app code contains NO logging statement',
    appelsConsole === 0, String(appelsConsole));

  console.log('');
  if (failures === 0) {
    console.log('== ALL PASS (' + checks + ' checks): the resolver contract holds ==');
    process.exit(0);
  }
  console.log('== ' + failures + ' FAILURE(S) on ' + checks + ' checks ==');
  process.exit(1);
})().catch((e) => {
  console.log('FAIL  the handler threw an Error: ' + (e && e.stack));
  process.exit(1);
});
