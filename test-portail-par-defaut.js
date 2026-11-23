/**
 * "As a judge" test: the REAL scan (src/index.js, lancerScan) on a site
 * that looks like what a Codegeist judge builds in two clicks:
 *   A. a Jira Service Management project created from the "IT service
 *      management" template (request types and default fields, in English);
 *   B. the Jira fallback (JSM not active) with tickets in English.
 *
 * The template texts are reconstructed (not copied from a real site): what
 * matters here is their SHAPE (system fields `summary`, `description`,
 * `attachment`; short request type names; content in English).
 *
 * Two requirements, measured separately:
 *   1. CORRECT content -> no "finding" (proven), and no 1.3.5 noise
 *      on the system fields;
 *   2. real mistakes written IN ENGLISH -> detected (click here, read more,
 *      "Details" heading, red button at the top right, empty field name).
 *
 * Platform simulated on `@forge/api` (same method as test-mcp.js).
 * Usage: node test-portail-par-defaut.js   (RC 0 = everything passes)
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
// ADF building blocks
// ---------------------------------------------------------------------------
const t = (text, marks) => (marks ? { type: 'text', text, marks } : { type: 'text', text });
const p = (...content) => ({ type: 'paragraph', content });
const h = (level, text) => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const lien = (text, href) => t(text, [{ type: 'link', attrs: { href } }]);
const doc = (...content) => ({ type: 'doc', version: 1, content });

// ---------------------------------------------------------------------------
// A. JSM, "IT service management" template (correct content)
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
// B. Jira fallback, tickets in English
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
  // A1 — the JSM template as it is
  SCENARIO = scenarioJsm(() => CHAMPS_BASE);
  let r = await lancerScan();
  let f = r.findings;
  console.log('A1 JSM out of the box: ' + f.length + ' findings ' + resume(f));
  check('A1 mode jsm', r.mode === 'jsm', r.mode);
  check('A1 no "finding" (proven) on a correct template', f.filter((c) => !c.a_verifier).length === 0,
    f.filter((c) => !c.a_verifier).map((c) => c.critere + ' ' + JSON.stringify(c.valeur)).join(' | '));
  check('A1 no 1.3.5 on the system fields (Summary, Description, Attachment)',
    f.filter((c) => c.critere === '1.3.5').length === 0, String(f.filter((c) => c.critere === '1.3.5').length));
  check('A1 no 2.4.2 on the default request type names',
    f.filter((c) => c.critere === '2.4.2').length === 0, f.filter((c) => c.critere === '2.4.2').map((c) => c.valeur).join(' | '));

  // A2 — real mistakes added by an administrator (in English)
  SCENARIO = scenarioJsm((rt) => rt.id === '4'
    ? [...CHAMPS_BASE,
      champ('customfield_10050', '', true, ''),
      champ('customfield_10051', 'Ref', false, ''),
      champ('customfield_10052', 'Your work email', true, 'We send the new credentials to this address.'),
      champ('customfield_10053', 'Steps to reproduce', false, 'What you did, in order.')]
    : CHAMPS_BASE);
  r = await lancerScan();
  f = r.findings;
  console.log('A2 JSM + faults: ' + f.length + ' findings ' + resume(f));
  check('A2 field with no name detected (3.3.2 proven)', f.some((c) => c.critere === '3.3.2' && !c.a_verifier && c.emplacement === 'requestTypeFields[3].name'));
  // 1.3.5 (rule of 23/11/2026): the criterion targets fields collecting
  // personal data — "Your work email" IS flagged (to verify: the REST API
  // cannot read the rendered autocomplete attribute), "Ref" is NOT (it
  // collects no personal data).
  check('A2 personal-data field "Your work email" reported (1.3.5 to verify)', f.some((c) => c.critere === '1.3.5' && c.a_verifier && c.valeur === 'Your work email'));
  check('A2 non-personal field "Ref" NOT reported (no false 1.3.5)', !f.some((c) => c.critere === '1.3.5' && c.valeur === 'Ref'));
  check('A2 non-personal field "Steps to reproduce" NOT reported (no false 1.3.5)', !f.some((c) => c.critere === '1.3.5' && c.valeur === 'Steps to reproduce'));
  check('A2 1.3.5 message names the personal-data purpose', (f.find((c) => c.critere === '1.3.5' && c.valeur === 'Your work email') || {}).message ===
    'Field collecting personal data ("email"): WCAG 1.3.5 requires the input purpose to be programmatically identifiable when rendered (autocomplete) — the REST API cannot read that attribute, so a human must check it');

  // B1 — Jira fallback, correct tickets in English
  SCENARIO = scenarioJira(TICKETS_CORRECTS);
  r = await lancerScan();
  f = r.findings;
  console.log('B1 correct Jira tickets: ' + f.length + ' findings ' + resume(f));
  check('B1 mode jira-fallback', r.mode === 'jira-fallback', r.mode);
  check('B1 no "finding" (proven) on correct tickets', f.filter((c) => !c.a_verifier).length === 0,
    f.filter((c) => !c.a_verifier).map((c) => c.critere + ' ' + JSON.stringify(c.valeur)).join(' | '));

  // B2 — faulty ticket in English
  SCENARIO = scenarioJira([TICKET_FAUTIF]);
  r = await lancerScan();
  f = r.findings;
  console.log('B2 faulty Jira ticket: ' + f.length + ' findings ' + resume(f));
  check('B2 "click here" detected (2.4.4)', f.some((c) => c.critere === '2.4.4' && c.valeur === 'click here'));
  check('B2 "Read more" detected (2.4.4)', f.some((c) => c.critere === '2.4.4' && c.valeur === 'Read more'));
  check('B2 "Details" heading detected (2.4.6)', f.some((c) => c.critere === '2.4.6' && c.valeur === 'Details'));
  check('B2 "red button at the top right" detected (1.3.3)', f.some((c) => c.critere === '1.3.3'));
  check('B2 descriptive link not reported', !f.some((c) => c.critere === '2.4.4' && /guide/i.test(String(c.valeur))));

  // C — jsmProbe tells the truth when the JSM API does not answer (23/11/2026
  // review, point 3): HTTP 404 on /rest/servicedeskapi/info used to show
  // "JSM is active" while the scan fell back to Jira.
  SCENARIO = Object.assign(scenarioJira(TICKETS_CORRECTS), {
    '/rest/servicedeskapi/info': { status: 404, body: { errorMessages: ['JSM is not installed'] } },
  });
  r = await lancerScan();
  check('C mode jira-fallback when the JSM API answers 404', r.mode === 'jira-fallback', r.mode);
  check('C jsmProbe carries the measured HTTP status', r.jsmProbe && r.jsmProbe.httpStatus === 404, String(r.jsmProbe && r.jsmProbe.httpStatus));
  check('C jsmProbe no longer claims "JSM is active"', r.jsmProbe && r.jsmProbe.note !== 'JSM is active', String(r.jsmProbe && r.jsmProbe.note).slice(0, 80));
  check('C jsmProbe says the JSM API did not answer (HTTP 404)', /did not answer \(HTTP 404\)/.test(String(r.jsmProbe && r.jsmProbe.note)), String(r.jsmProbe && r.jsmProbe.note).slice(0, 80));
  check('C jsmProbe admits nothing was read from it', /nothing was read from it/.test(String(r.jsmProbe && r.jsmProbe.note)));

  // D — incomplete reads warn instead of staying silent (23/11/2026 review,
  // point 4): an isolated 403 among reads that succeed, and a service desk
  // list that fails without being a 401/403, both used to give "0 finding"
  // with no alert.
  SCENARIO = Object.assign(scenarioJsm(() => CHAMPS_BASE), {
    '/rest/servicedeskapi/servicedesk/1/requesttype': { status: 403, body: { errorMessages: ['forbidden'] } },
  });
  r = await lancerScan();
  f = r.findings;
  check('D1 isolated 403: 0 finding BUT a warning (not a silent empty report)', f.length === 0 && r.incompleteRead !== null && r.incompleteRead.length > 0,
    f.length + ' findings, incompleteRead=' + JSON.stringify(r.incompleteRead));
  check('D1 the warning names the refused endpoint and its status', (r.incompleteRead || []).some((w) => /requesttype.*HTTP 403/.test(w)),
    JSON.stringify(r.incompleteRead));
  check('D1 the scan stays in jsm mode (the identity was not refused)', r.mode === 'jsm', r.mode);

  SCENARIO = Object.assign(scenarioJsm(() => CHAMPS_BASE), {
    '/rest/servicedeskapi/servicedesk': { status: 500, body: { errorMessages: ['internal error'] } },
  });
  r = await lancerScan();
  f = r.findings;
  check('D2 desk list HTTP 500: 0 finding BUT the scan error is carried', f.length === 0 && (r.incompleteRead || []).some((w) => /service desk list unavailable \(HTTP 500\)/.test(w)),
    f.length + ' findings, incompleteRead=' + JSON.stringify(r.incompleteRead));
  check('D2 the first limites line says INCOMPLETE READ', typeof r.limites[0] === 'string' && r.limites[0].startsWith('INCOMPLETE READ —'), String(r.limites[0]).slice(0, 80));

  SCENARIO = scenarioJsm(() => CHAMPS_BASE);
  const controle = await lancerScan();
  check('D3 a complete scan carries no incompleteRead (control)', controle.incompleteRead === null && !controle.limites[0].startsWith('INCOMPLETE READ'),
    JSON.stringify(controle.incompleteRead));

  // E — a JQL 400 (bad query) is a partial failure too, not a silent empty list
  SCENARIO = Object.assign(scenarioJira(TICKETS_CORRECTS), {
    '/rest/api/3/search/jql': { status: 400, body: { errorMessages: ['The JQL is not valid'] } },
  });
  r = await lancerScan();
  check('E JQL 400 reported as an incomplete read', (r.incompleteRead || []).some((w) => /search\/jql.*HTTP 400/.test(w)),
    JSON.stringify(r.incompleteRead));

  // F — 3.2.6, "field" variant: the same field name is described in one
  // request type and not in another. The rule needs the fields of SEVERAL
  // types: without them, this half of 3.2.6 never ran in production
  // (23/11/2026 review, minor 1).
  const CHAMPS_AVEC_IMPACT = [
    champ('summary', 'Summary', true, ''),
    champ('customfield_10060', 'Impact', false, 'Tell us how this request affects you.'),
  ];
  const CHAMPS_SANS_IMPACT = [
    champ('summary', 'Summary', true, ''),
    champ('customfield_10060', 'Impact', false, ''),
  ];
  SCENARIO = scenarioJsm((rt) => (rt.id === '1' ? CHAMPS_AVEC_IMPACT : CHAMPS_SANS_IMPACT));
  r = await lancerScan();
  f = r.findings;
  check('F 3.2.6 field variant detected (same field name: described in one type, not in the other)',
    f.some((c) => c.critere === '3.2.6' && c.a_verifier && /Impact/.test(String(c.message))),
    f.filter((c) => c.critere === '3.2.6').map((c) => c.emplacement + ' ' + c.message).join(' | ') || 'no 3.2.6 finding');
  check('F the 3.2.6 finding names the request type whose field has no description',
    f.some((c) => c.critere === '3.2.6' && /Fix an account problem/.test(String(c.ressource))),
    f.filter((c) => c.critere === '3.2.6').map((c) => String(c.ressource)).join(' | ') || 'no 3.2.6 finding');
  check('F the 3.2.6 finding points at the description of the field that has none',
    f.some((c) => c.critere === '3.2.6' && /requestTypeFields\[\d+\]\.description$/.test(String(c.emplacement))),
    f.filter((c) => c.critere === '3.2.6').map((c) => String(c.emplacement)).join(' | ') || 'no 3.2.6 finding');

  console.log(failures === 0 ? '== ALL PASS (' + checks + ' checks): the scan holds on a judge\'s site in English ==' : '== ' + failures + ' FAILURE(S) on ' + checks + ' checks ==');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
