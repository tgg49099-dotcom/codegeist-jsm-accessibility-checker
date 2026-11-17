/**
 * scan-reel.js (Studio, 15/11/2026) : lance le VRAI moteur (src/index.js,
 * lancerScan) sur un VRAI site Jira / JSM, sans navigateur ni session de Tgg.
 * Meme methode que test-portail-par-defaut.js (api.asUser remplace), mais le
 * client parle au vrai site en REST (Basic : e-mail + jeton API du compte).
 * LECTURE SEULE : seul GET passe, plus l'unique POST de l'app (recherche JQL
 * /rest/api/3/search/jql, une lecture) ; tout autre envoi est refuse AVANT le reseau.
 * Usage : SITE=https://xxx.atlassian.net node scan-reel.js <dossier-app> [sortie.json]
 *   identifiants lus dans FORGE_EMAIL et FORGE_API_TOKEN (jamais affiches ni ecrits).
 */
const path = require('path');
const fs = require('fs');
const POST_PERMIS = new Set(['/rest/api/3/search/jql']);
const cheminDe = (r) => (typeof r === 'string' ? r : r && typeof r.value === 'string' ? r.value : String(r));

function fabriquerClient(site, email, jeton, journal) {
  const base = String(site).replace(/\/+$/, '');
  const auth = 'Basic ' + Buffer.from(email + ':' + jeton).toString('base64');
  return {
    requestJira: async (r, opts = {}) => {
      const p = cheminDe(r);
      const m = String(opts.method || 'GET').toUpperCase();
      const nu = p.split('?')[0];
      if (!p.startsWith('/')) throw new Error('scan-reel : chemin non relatif refuse');
      if (!(m === 'GET' || (m === 'POST' && POST_PERMIS.has(nu)))) {
        journal.push({ m, p: nu, refuse: true });
        throw new Error('scan-reel : ' + m + ' ' + nu + ' refuse (lecture seule)');
      }
      const headers = Object.assign({}, opts.headers || {}, { Authorization: auth });
      if (!headers.Accept) headers.Accept = 'application/json';
      const res = await fetch(base + p, { method: m, headers, body: m === 'POST' ? opts.body : undefined });
      journal.push({ m, p: nu, status: res.status });
      return res;
    },
  };
}
module.exports = { fabriquerClient, POST_PERMIS };

if (require.main === module) {
  const appDir = path.resolve(process.argv[2] || '.');
  const sortie = process.argv[3] || '';
  const SITE = process.env.SITE || '';
  const EMAIL = process.env.FORGE_EMAIL || '';
  const TOKEN = process.env.FORGE_API_TOKEN || '';
  if (!/^https?:\/\//.test(SITE) || !EMAIL || !TOKEN) {
    console.error('SITE, FORGE_EMAIL et FORGE_API_TOKEN sont requis'); process.exit(2);
  }
  const api = require(require.resolve('@forge/api', { paths: [appDir] }));
  const journal = [];
  const client = fabriquerClient(SITE, EMAIL, TOKEN, journal);
  api.asUser = () => client;
  api.asApp = () => client;
  (async () => {
    const moteur = require(path.join(appDir, 'src', 'index.js'));
    const rapport = await moteur.lancerScan({ pvRecus: {} });
    const f = (rapport && (rapport.findings || rapport.constats)) || [];
    const parNiveau = {};
    for (const c of f) { const n = c.level || c.niveau || c.severity || '?'; parNiveau[n] = (parNiveau[n] || 0) + 1; }
    console.log('APPELS ' + journal.length + ' (refuses ' + journal.filter((j) => j.refuse).length + ')');
    for (const j of journal) console.log('  ' + j.m + ' ' + (j.status || 'REFUSE') + ' ' + j.p);
    console.log('CONSTATS ' + f.length + ' ' + JSON.stringify(parNiveau));
    if (sortie) fs.writeFileSync(sortie, JSON.stringify({ site: SITE, date: new Date().toISOString(), appels: journal, rapport }, null, 2));
  })().catch((e) => { console.error('ERREUR ' + e.message); process.exit(1); });
}
