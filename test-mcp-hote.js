/**
 * test-mcp-hote.js — THE URL GIVEN TO `scan_accessibility` CAN ONLY NAME THE
 * SITE WHERE THE APP IS INSTALLED.
 *
 * Why this suite exists: the Codegeist review of 23 November 2026 asked that
 * the code "refuse clearly any address that is not the one of the installed
 * site, instead of an obscure error", and that this be SHOWN. The code did it
 * (src/mcp.js, step 2 of scanAccessibility), but no test proved it: a change
 * to that comparison would have passed every other suite. This one fails.
 *
 *   H-01  a URL of ANOTHER site is refused with the clear message, names the
 *         installed site, and causes ZERO read of the site content.
 *   H-02  a look-alike host (demo.atlassian.net.evil.example) is refused.
 *   H-03  a host that only ENDS like the site (evil-demo.atlassian.net) is
 *         refused.
 *   H-04  a value that is not an absolute URL is refused with the "no usable
 *         URL" message, and nothing of the site is read.
 *   H-05  a missing URL is refused the same way.
 *   H-06  the URL of the installed site gives a report (case and spaces of
 *         the input do not matter: hosts are compared in lower case).
 *   H-07  the given URL is NEVER fetched: no external call, and no REST path
 *         contains the given URL.
 *   H-08  when the platform gives no base URL for the site, every URL is
 *         refused (fail closed).
 *   H-09  a non-administrator is refused BEFORE the URL is even looked at,
 *         even with the right URL.
 *
 * COUNTER-PROOFS (the suite must be able to say NO): src/mcp.js is copied
 * next to itself with ONE mutation, and the checks it is the counter-proof of
 * MUST turn red.
 *   CP-H-A  the host comparison removed (any host accepted) -> H-01, H-02,
 *           H-03 red.
 *   CP-H-B  any host of the same parent domain (*.atlassian.net) accepted -> H-03 red.
 *
 * Usage: node test-mcp-hote.js      RC 0 = every check passes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const api = require('@forge/api');

const SRC = path.join(__dirname, 'src');
const LIVE_MCP = path.join(SRC, 'mcp.js');

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

// ---------------------------------------------------------------------------
// The simulated platform (same shape as test-mcp-porte.js)
// ---------------------------------------------------------------------------

const CHEMIN_PERMISSIONS = '/rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN';
const CHEMIN_SERVERINFO = '/rest/api/3/serverInfo';

let SCENARIO = {};
let DEMANDES = [];
let APPELS_EXTERNES = [];

function reponse(status, body) {
  return { status: status, json: async () => body };
}
function cheminDe(p) {
  return String((p && p.value_) || p);
}
api.asUser = () => ({
  requestJira: async (p) => {
    const chemin = cheminDe(p);
    DEMANDES.push(chemin);
    const def = SCENARIO[chemin];
    if (!def) return reponse(404, { errorMessages: ['not found: ' + chemin] });
    return reponse(def.status, def.body);
  },
});
api.asApp = () => ({
  requestJira: async () => {
    throw new Error('asApp() is forbidden in this application (and in this test)');
  },
});
api.fetch = async (u) => {
  APPELS_EXTERNES.push(String(u));
  throw new Error('an external call is forbidden in this application (and in this test)');
};

function permissions(admin) {
  return {
    status: 200,
    body: {
      permissions: {
        ADMINISTER: { key: 'ADMINISTER', havePermission: admin },
        SYSTEM_ADMIN: { key: 'SYSTEM_ADMIN', havePermission: false },
      },
    },
  };
}

function site(baseUrl, admin) {
  const s = {
    [CHEMIN_PERMISSIONS]: permissions(admin !== false),
    [CHEMIN_SERVERINFO]: { status: 200, body: baseUrl ? { baseUrl: baseUrl } : {} },
    '/rest/servicedeskapi/info': { status: 200, body: { isLicensedForUse: true } },
    '/rest/servicedeskapi/servicedesk': { status: 200, body: { values: [] } },
  };
  return s;
}

/** Reads of the site content: everything but the permission check and the identity probe. */
function lecturesDuContenu() {
  return DEMANDES.filter((c) => c !== CHEMIN_PERMISSIONS && c !== CHEMIN_SERVERINFO);
}
function estRapport(t) {
  return typeof t === 'string' && /Portal Accessibility Checker for JSM/.test(t) && /\nFindings:/.test(t);
}
function estRefusHote(t) {
  return typeof t === 'string' && /points to another site/.test(t) && !estRapport(t);
}
function estRefusUrl(t) {
  return typeof t === 'string' && /No usable portal URL was given/.test(t) && !estRapport(t);
}
function estRefusAdmin(t) {
  return typeof t === 'string' && /reserved to Jira administrators/i.test(t) && !estRapport(t);
}

async function appel(mcp, scenario, payload) {
  SCENARIO = scenario;
  DEMANDES = [];
  APPELS_EXTERNES = [];
  let sortie;
  try {
    sortie = await mcp.scanAccessibility(payload, {});
  } catch (e) {
    sortie = 'EXCEPTION: ' + (e && e.message);
  }
  return String(sortie);
}

const SITE = 'https://demo.atlassian.net';
const PORTAIL = SITE + '/servicedesk/customer/portals';

// ---------------------------------------------------------------------------
// The checks, on a given mcp module. Returns { label: ok }.
// ---------------------------------------------------------------------------

async function verifier(mcp, afficher) {
  const r = {};
  const note = (label, ok, detail) => {
    r[label] = ok;
    if (afficher) check(label, ok, detail);
  };

  let s = await appel(mcp, site(SITE), { url: 'https://other-company.atlassian.net/servicedesk/customer/portals' });
  note('H-01 a URL of another site is refused with the clear message', estRefusHote(s), s.slice(0, 120));
  note('H-01 the refusal names the installed site', /demo\.atlassian\.net/.test(s));
  note('H-01 zero read of the site content', lecturesDuContenu().length === 0, JSON.stringify(lecturesDuContenu()));

  s = await appel(mcp, site(SITE), { url: 'https://demo.atlassian.net.evil.example/servicedesk/customer/portals' });
  note('H-02 a look-alike host is refused', estRefusHote(s), s.slice(0, 80));

  s = await appel(mcp, site(SITE), { url: 'https://evil-demo.atlassian.net/servicedesk/customer/portals' });
  note('H-03 a host that only ends like the site is refused', estRefusHote(s), s.slice(0, 80));

  s = await appel(mcp, site(SITE), { url: 'demo.atlassian.net/servicedesk' });
  note('H-04 a value that is not an absolute URL is refused', estRefusUrl(s), s.slice(0, 80));
  note('H-04 zero read of the site content', lecturesDuContenu().length === 0);

  s = await appel(mcp, site(SITE), {});
  note('H-05 a missing URL is refused', estRefusUrl(s), s.slice(0, 80));

  s = await appel(mcp, site(SITE), { url: '  HTTPS://Demo.Atlassian.NET/servicedesk/customer/portals  ' });
  note('H-06 the URL of the installed site gives a report', estRapport(s), s.split('\n')[0]);
  note('H-06 the report names the installed site', /Site: demo\.atlassian\.net/.test(s));

  s = await appel(mcp, site(SITE), { url: PORTAIL });
  note('H-07 the given URL is never fetched (no external call)', APPELS_EXTERNES.length === 0, JSON.stringify(APPELS_EXTERNES));
  note(
    'H-07 no REST path carries the given URL',
    DEMANDES.every((c) => !/servicedesk\/customer\/portals|https?:/.test(c)),
    JSON.stringify(DEMANDES.slice(0, 4))
  );

  s = await appel(mcp, site(null), { url: PORTAIL });
  note('H-08 no base URL from the platform: every URL is refused (fail closed)', estRefusHote(s), s.slice(0, 80));

  s = await appel(mcp, site(SITE, false), { url: PORTAIL });
  note('H-09 a non-administrator is refused even with the right URL', estRefusAdmin(s), s.slice(0, 80));
  note('H-09 only the permission check left the app', DEMANDES.length === 1 && DEMANDES[0] === CHEMIN_PERMISSIONS, JSON.stringify(DEMANDES));

  return r;
}

// ---------------------------------------------------------------------------
// Counter-proofs: a mutated copy of src/mcp.js, next to the real one.
// ---------------------------------------------------------------------------

async function contreEpreuve(nom, depuis, vers, doiventRougir) {
  const texte = fs.readFileSync(LIVE_MCP, 'utf8');
  if (!texte.includes(depuis)) {
    check(nom + ' : anchor found in src/mcp.js', false, depuis);
    return;
  }
  const fichier = path.join(SRC, '.cp-mcp-hote-' + process.pid + '.js');
  fs.writeFileSync(fichier, texte.replace(depuis, vers), 'utf8');
  try {
    delete require.cache[require.resolve(fichier)];
    const r = await verifier(require(fichier), false);
    const rouges = doiventRougir.filter((l) => r[l] === false);
    check(
      nom + ' : the mutation turns ' + doiventRougir.length + ' check(s) red',
      rouges.length === doiventRougir.length,
      rouges.length + '/' + doiventRougir.length + ' red'
    );
  } finally {
    fs.unlinkSync(fichier);
  }
}

(async () => {
  console.log('== Live state: src/mcp.js');
  await verifier(require(LIVE_MCP), true);

  console.log('== Counter-proofs');
  await contreEpreuve(
    'CP-H-A (host comparison removed)',
    'if (!autorises.includes(hostUrl)) {',
    'if (false) {',
    [
      'H-01 a URL of another site is refused with the clear message',
      'H-02 a look-alike host is refused',
      'H-03 a host that only ends like the site is refused',
    ]
  );
  await contreEpreuve(
    'CP-H-B (any *.atlassian.net host accepted)',
    'if (!autorises.includes(hostUrl)) {',
    "if (!autorises.some((h) => hostUrl.endsWith(h.replace(/^demo/, '')))) {",
    ['H-03 a host that only ends like the site is refused']
  );

  if (failures === 0) {
    console.log('== ALL PASS (' + checks + ' checks): scan_accessibility only names the installed site ==');
    process.exit(0);
  }
  console.log('== ' + failures + ' FAIL(S) out of ' + checks + ' checks ==');
  process.exit(1);
})();
