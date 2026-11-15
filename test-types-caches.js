/**
 * Test « comme un juge » : types de demande CACHÉS du portail.
 * Dans JSM, un type de demande qui n'appartient à aucun groupe du portail
 * (groupIds vide) n'est pas affiché aux clients (« Hidden from portal »).
 * Le scan du PORTAIL ne doit ni le juger, ni lui donner une des 5 places
 * lues, au détriment d'un type réellement affiché.
 * Usage : node test-types-caches.js   (RC 0 = tout passe)
 */
const api = require('@forge/api');
let checks = 0, failures = 0;
function check(label, ok, detail) { checks += 1; if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : '')); }
const rep = (status, body) => ({ status, json: async () => body });
const chemin = (r) => (typeof r === 'string' ? r : r && typeof r.value === 'string' ? r.value : String(r));
const champ = (fieldId, name, required, description) => ({ fieldId, name, description: description || '', required, visible: true,
  validValues: [], jiraSchema: { type: 'string', system: fieldId.startsWith('customfield_') ? undefined : fieldId } });
const TYPES = [
  { id: '90', name: 'Emailed request', description: 'Request received from your email support channel.', helpText: '', groupIds: [] },
  { id: '1', name: 'Get IT help', description: 'Get assistance for general IT problems and questions.', helpText: 'Describe the problem.', groupIds: ['1'] },
  { id: '2', name: 'Fix an account problem', description: 'Having trouble accessing certain websites or systems? We can help.', helpText: 'Describe the problem.', groupIds: ['1'] },
  { id: '3', name: 'Get a guest wifi account', description: 'Raise a request to ask for temp wifi access for guests.', helpText: 'Describe the problem.', groupIds: ['2'] },
  { id: '4', name: 'Request a new account', description: 'Request access to a specific system.', helpText: 'Describe the problem.', groupIds: ['2'] },
  { id: '5', name: 'Report a system problem', description: 'Let us know if something is not working properly.', helpText: 'Describe the problem.', groupIds: ['3'] },
];
const SC = {
  '/rest/api/3/serverInfo': { status: 200, body: { baseUrl: 'https://juge.atlassian.net' } },
  '/rest/servicedeskapi/info': { status: 200, body: { isLicensedForUse: true } },
  '/rest/servicedeskapi/servicedesk': { status: 200, body: { values: [{ id: '1', projectName: 'IT Help', projectKey: 'ITH' }] } },
  '/rest/servicedeskapi/servicedesk/1/requesttype': { status: 200, body: { values: TYPES } },
};
for (const rt of TYPES) {
  const f = [champ('summary', 'Summary', true, 'Tell us in one line.'), champ('description', 'Description', false)];
  if (rt.id === '90') f.push(champ('customfield_10090', '', true, ''));          // défaut sur un type CACHÉ
  if (rt.id === '5') f.push(champ('customfield_10055', '', true, ''));           // vrai défaut sur le 5e type AFFICHÉ
  SC['/rest/servicedeskapi/servicedesk/1/requesttype/' + rt.id + '/field'] = { status: 200, body: { requestTypeFields: f } };
}
const client = { requestJira: async (r) => { const d = SC[chemin(r).split('?')[0]]; return d ? rep(d.status, d.body) : rep(404, { errorMessages: ['not found'] }); } };
api.asUser = () => client; api.asApp = () => client;
const { lancerScan } = require('./src/index.js');
(async () => {
  const out = await lancerScan({ accountId: 'juge' });
  const F = (out && out.findings) || [];
  const ou = (f) => String(f.ou || '');
  check('mode jsm', out && out.mode === 'jsm', out && out.mode);
  const surCache = F.filter((f) => ou(f).includes('Emailed request'));
  check('aucun constat sur le type caché « Emailed request »', surCache.length === 0, surCache.length + ' constat(s)');
  const lu = Object.keys((out && out.read) || {}).some((k) => k.endsWith('/requesttype/90/field'));
  check('le type caché ne prend pas une des 5 places lues', !lu);
  const vrai = F.filter((f) => ou(f).includes('Report a system problem') && JSON.stringify(f).includes('without a label'));
  check('vrai défaut du 5e type affiché détecté (champ sans étiquette)', vrai.length >= 1, vrai.length + ' constat(s)');
  console.log(failures ? `== ${failures} ECHEC(S) sur ${checks}` : `== TOUT PASS (${checks} contrôles) : types cachés ignorés`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('ERREUR ' + (e && e.stack)); process.exit(2); });
