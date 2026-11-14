/**
 * Test « comme un juge » : le VRAI scan (src/index.js, lancerScan) sur un site
 * qui ressemble à ce qu'un juge de Codegeist crée en deux clics :
 *   A. un projet Jira Service Management créé depuis le modèle « IT service
 *      management » (types de demande et champs par défaut, en anglais) ;
 *   B. le repli Jira (JSM non actif) avec des tickets en anglais.
 *
 * Les textes des modèles sont reconstitués (non copiés d'un site réel) : ce
 * qui compte ici est leur FORME (champs système `summary`, `description`,
 * `attachment` ; noms de types de demande courts ; contenu en anglais).
 *
 * Deux exigences, mesurées séparément :
 *   1. contenu CORRECT -> aucun constat « finding » (prouvé), et pas de bruit
 *      1.3.5 sur les champs système ;
 *   2. vraies fautes écrites EN ANGLAIS -> détectées (click here, read more,
 *      heading « Details », bouton rouge en haut à droite, nom de champ vide).
 *
 * Plate-forme simulée sur `@forge/api` (même méthode que test-mcp.js).
 * Usage : node test-portail-par-defaut.js   (RC 0 = tout passe)
 */
const api = require('@forge/api');

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

let SCENARIO = {};
const reponse = (status, body) => ({ status, json: async () => body });
const cheminDe = (r) => (typeof r === 'string' ? r : r && typeof r.value === 'string' ? r.value : String(r));
const client = {
  requestJira: async (r) => {
    const def = SCENARIO[cheminDe(r).split('?')[0]];
    return def ? reponse(def.status, def.body) : reponse(404, { errorMessages: ['not found'] });
  },
};
api.asUser = () => client;
api.asApp = () => client;

const { lancerScan } = require('./src/index.js');

// ---------------------------------------------------------------------------
// Briques ADF
// ---------------------------------------------------------------------------
const t = (text, marks) => (marks ? { type: 'text', text, marks } : { type: 'text', text });
const p = (...content) => ({ type: 'paragraph', content });
const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const lien = (text, href) => t(text, [{ type: 'link', attrs: { href } }]);
const doc = (...content) => ({ type: 'doc', version: 1, content });

// ---------------------------------------------------------------------------
// A. JSM, modèle « IT service management » (contenu correct)
// ---------------------------------------------------------------------------
const champ = (fieldId, name, required, description, type, custom) => ({
  fieldId, name, description: description || '', required, visible: true,
  validValues: [], jiraSchema: { type: type || 'string', system: fieldId.startsWith('customfield_') ? undefined : fieldId, custom },
});
const CHAMPS_BASE = [
  champ('summary', 'Summary', true, ''),
  champ('description', 'Description', false, ''),
  champ('attachment', 'Attachment', false, '', 'array'),
];
const TYPES = [
  { id: '1', name: 'Get IT help', description: 'Get assistance for general IT problems and questions.', helpText: '' },
  { id: '2', name: 'Fix an account problem', description: "Having trouble accessing certain websites or systems? We'll help you out.", helpText: '' },
  { id: '3', name: 'Get a guest wifi account', description: 'Raise a request to ask for temporary wifi access for guests.', helpText: '' },
  { id: '4', name: 'Request a new account', description: 'Request a new account for a system.', helpText: '' },
  { id: '5', name: 'Request admin access', description: 'For example, if you need to install applications.', helpText: '' },
];
function scenarioJsm(champsParType) {
  const s = {
    '/rest/api/3/serverInfo': { status: 200, body: { baseUrl: 'https://judge.atlassian.net' } },
    '/rest/servicedeskapi/info': { status: 200, body: { isLicensedForUse: true } },
    '/rest/servicedeskapi/servicedesk': { status: 200, body: { values: [{ id: '1', projectName: 'IT Support' }] } },
    '/rest/servicedeskapi/servicedesk/1/requesttype': { status: 200, body: { values: TYPES } },
  };
  for (const rt of TYPES) {
    s['/rest/servicedeskapi/servicedesk/1/requesttype/' + rt.id + '/field'] = {
      status: 200, body: { requestTypeFields: champsParType(rt) },
    };
  }
  return s;
}

// ---------------------------------------------------------------------------
// B. Repli Jira, tickets en anglais
// ---------------------------------------------------------------------------
function scenarioJira(issues) {
  return {
    '/rest/api/3/serverInfo': { status: 200, body: {} },
    '/rest/servicedeskapi/info': { status: 200, body: { isLicensedForUse: false } },
    '/rest/api/3/field': { status: 200, body: [] },
    '/rest/api/3/project': { status: 200, body: [{ key: 'ITS' }] },
    '/rest/api/3/issue/createmeta/ITS/issuetypes': { status: 200, body: { issueTypes: [] } },
    '/rest/api/3/search/jql': { status: 200, body: { issues } },
  };
}
const ticket = (key, summary, description) => ({ key, fields: { summary, description } });
const TICKETS_CORRECTS = [
  ticket('ITS-1', "Laptop won't boot", doc(p(t('Since this morning my computer shows a black screen after the logo.')))),
  ticket('ITS-2', 'VPN keeps disconnecting', doc(p(t('The connection drops every ten minutes when working from home.')), p(t('See the '), lien('VPN setup guide', 'https://example.test/vpn')))),
  ticket('ITS-3', 'Printer on floor 3 is jammed', doc(h(2, 'Steps to reproduce'), p(t('Print any document from the shared queue.')))),
];
const TICKET_FAUTIF = ticket('ITS-9', 'Password reset for the HR portal', doc(
  p(t('To reset it, '), lien('click here', 'https://example.test/reset')),
  p(lien('Read more', 'https://example.test/kb')),
  h(1, 'Password reset'),
  h(2, 'Details'),
  p(t('Press the red button at the top right of the form.')),
));

const resume = (findings) => {
  const m = {};
  for (const f of findings) {
    const k = f.critere + (f.a_verifier ? ' (to verify)' : ' (finding)');
    m[k] = (m[k] || 0) + 1;
  }
  return JSON.stringify(m);
};

(async () => {
  // A1 — modèle JSM tel quel
  SCENARIO = scenarioJsm(() => CHAMPS_BASE);
  let r = await lancerScan();
  let f = r.findings;
  console.log('A1 JSM par défaut : ' + f.length + ' constats ' + resume(f));
  check('A1 mode jsm', r.mode === 'jsm', r.mode);
  check('A1 aucun constat « finding » (prouvé) sur un modèle correct', f.filter((c) => !c.a_verifier).length === 0,
    f.filter((c) => !c.a_verifier).map((c) => c.critere + ' ' + JSON.stringify(c.valeur)).join(' | '));
  check('A1 aucun 1.3.5 sur les champs système (Summary, Description, Attachment)',
    f.filter((c) => c.critere === '1.3.5').length === 0, String(f.filter((c) => c.critere === '1.3.5').length));
  check('A1 aucun 2.4.2 sur les noms des types de demande par défaut',
    f.filter((c) => c.critere === '2.4.2').length === 0, f.filter((c) => c.critere === '2.4.2').map((c) => c.valeur).join(' | '));

  // A2 — vraies fautes ajoutées par un administrateur (en anglais)
  SCENARIO = scenarioJsm((rt) => rt.id === '4'
    ? [...CHAMPS_BASE,
      champ('customfield_10050', '', true, ''),
      champ('customfield_10051', 'Ref', false, ''),
      champ('customfield_10052', 'Your work email', true, 'We send the new credentials to this address.')]
    : CHAMPS_BASE);
  r = await lancerScan();
  f = r.findings;
  console.log('A2 JSM + fautes : ' + f.length + ' constats ' + resume(f));
  check('A2 champ sans nom détecté (3.3.2 prouvé)', f.some((c) => c.critere === '3.3.2' && !c.a_verifier && c.emplacement === 'requestTypeFields[3].name'));
  check('A2 champ personnalisé « Ref » sans finalité signalé (1.3.5)', f.some((c) => c.critere === '1.3.5' && c.valeur === 'Ref'));
  check('A2 champ e-mail en anglais reconnu (pas de 1.3.5)', !f.some((c) => c.critere === '1.3.5' && c.valeur === 'Your work email'));

  // B1 — repli Jira, tickets corrects en anglais
  SCENARIO = scenarioJira(TICKETS_CORRECTS);
  r = await lancerScan();
  f = r.findings;
  console.log('B1 Jira tickets corrects : ' + f.length + ' constats ' + resume(f));
  check('B1 mode jira-fallback', r.mode === 'jira-fallback', r.mode);
  check('B1 aucun constat « finding » (prouvé) sur des tickets corrects', f.filter((c) => !c.a_verifier).length === 0,
    f.filter((c) => !c.a_verifier).map((c) => c.critere + ' ' + JSON.stringify(c.valeur)).join(' | '));

  // B2 — ticket fautif en anglais
  SCENARIO = scenarioJira([TICKET_FAUTIF]);
  r = await lancerScan();
  f = r.findings;
  console.log('B2 Jira ticket fautif : ' + f.length + ' constats ' + resume(f));
  check('B2 « click here » détecté (2.4.4)', f.some((c) => c.critere === '2.4.4' && c.valeur === 'click here'));
  check('B2 « Read more » détecté (2.4.4)', f.some((c) => c.critere === '2.4.4' && c.valeur === 'Read more'));
  check('B2 titre « Details » détecté (2.4.6)', f.some((c) => c.critere === '2.4.6' && c.valeur === 'Details'));
  check('B2 « red button at the top right » détecté (1.3.3)', f.some((c) => c.critere === '1.3.3'));
  check('B2 lien descriptif non signalé', !f.some((c) => c.critere === '2.4.4' && /guide/i.test(String(c.valeur))));

  console.log(failures === 0 ? '== TOUT PASS (' + checks + ' contrôles) : le scan tient sur un site de juge en anglais ==' : '== ' + failures + ' ÉCHEC(S) sur ' + checks + ' ==');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
