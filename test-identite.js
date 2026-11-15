/**
 * test-identite.js — THE IDENTITY CHECK (09/11/2026).
 *
 * WHAT THIS TEST PROVES
 *
 * The official Marketplace review rule ("Security requirements for cloud
 * apps", section "Forge apps") says:
 *
 *   1. "An application must default to using asUser() when performing an
 *      operation on behalf of the user."
 *   2. "Before making calls using asApp(), you must verify the expected
 *      permissions (for example, from product context) with the permissions
 *      REST APIs."
 *
 * The app acts on behalf of somebody (the person who clicks the button on
 * the admin page, the caller of an MCP tool): it therefore reads with
 * `asUser()`. Rule 2 does not have to be invoked, because the app contains
 * NO `asApp()` call at all: it cannot widen the identity, so nothing can be
 * widened by accident.
 *
 * This check measures the ACTIVE CODE — comments and strings are stripped
 * before counting, otherwise an `asApp` written in a sentence documenting
 * the fix would count as a call. It also measures the BEHAVIOUR: when the
 * platform refuses the caller's identity, the engine must REFUSE (and never
 * return an empty report, which would read as "this site has no
 * accessibility problem" while nothing was read).
 *
 * METHODOLOGICAL POINT: the check NEVER trusts a hand-written counter.
 * It always recounts from the source. The counter-proof
 * "the counter set to 0 by hand" verifies it: a frozen counter cannot
 * turn the check green.
 *
 * Usage: node test-identite.js
 * RC 0 = everything passes, RC 1 = at least one check fails.
 */
const fs = require('fs');
const path = require('path');

const api = require('@forge/api');

const APP = __dirname;
const SRC = path.join(APP, 'src');

let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

// ---------------------------------------------------------------------------
// 1. The active code: comments and strings STRIPPED
// ---------------------------------------------------------------------------

/**
 * The executable code of a JavaScript file: the comments and the
 * CONTENT of the strings are replaced by spaces, the code of the
 * `${...}` expressions of a template literal is kept.
 *
 * An `asApp` written in a comment or in a string is not a call:
 * counting it would be a false positive.
 *
 * @param {string} src
 * @returns {string}
 */
function sansCommentaires(src, garderChaines) {
  let out = '';
  let i = 0;
  const n = src.length;
  let mode = 'code';
  let quote = '';
  let acc = 0; // brace depth inside a ${ ... }
  const vide = (c) => (garderChaines ? c : c === '\n' ? '\n' : ' ');
  while (i < n) {
    const c = src[i];
    const c2 = src.substr(i, 2);
    if (mode === 'code') {
      if (acc > 0) {
        if (c === '{') { acc += 1; out += c; i += 1; continue; }
        if (c === '}') {
          acc -= 1; out += c; i += 1;
          if (acc === 0) mode = 'template';
          continue;
        }
      }
      if (c2 === '/*') { out += '  '; i += 2; mode = 'bloc'; continue; }
      if (c2 === '//') { out += '  '; i += 2; mode = 'ligne'; continue; }
      if (c === '"' || c === "'") { out += garderChaines ? c : ' '; i += 1; mode = 'chaine'; quote = c; continue; }
      if (c === '`') { out += ' '; i += 1; mode = 'template'; continue; }
      out += c; i += 1; continue;
    }
    if (mode === 'bloc') {
      if (c2 === '*/') { out += '  '; i += 2; mode = 'code'; continue; }
      out += c === '\n' ? '\n' : ' '; i += 1; continue;
    }
    if (mode === 'ligne') {
      if (c === '\n') { out += '\n'; i += 1; mode = 'code'; continue; }
      out += ' '; i += 1; continue;
    }
    if (mode === 'chaine') {
      if (c === '\\') { out += garderChaines ? c + (src[i + 1] || '') : '  '; i += 2; continue; }
      if (c === quote) { out += garderChaines ? c : ' '; i += 1; mode = 'code'; continue; }
      out += vide(c); i += 1; continue;
    }
    // template literal
    if (c === '\\') { out += garderChaines ? c + (src[i + 1] || '') : '  '; i += 2; continue; }
    if (c2 === '${') { out += '  '; i += 2; mode = 'code'; acc = 1; continue; }
    if (c === '`') { out += ' '; i += 1; mode = 'code'; continue; }
    out += vide(c); i += 1;
  }
  return out;
}

/** The active code: comments AND string content stripped. */
function codeActif(src) {
  return sansCommentaires(src, false);
}

/** The code without the comments, but WITH the string content. */
function codeAvecChaines(src) {
  return sansCommentaires(src, true);
}

/**
 * The identity calls in the active code of a source.
 *
 * We count the CALL EXPRESSIONS (`asApp(`, `asUser(`): the word alone
 * is not a call.
 *
 * @param {string} src
 * @returns {{asApp: number, asUser: number}}
 */
function compter(source) {
  const code = codeActif(source);
  const count = (mot) => {
    const re = new RegExp('\\b' + mot + '\\s*\\(', 'g');
    const found = code.match(re);
    return found ? found.length : 0;
  };
  return { asApp: count('asApp'), asUser: count('asUser') };
}

// ---------------------------------------------------------------------------
// 2. The check: it RECOUNTS, it trusts no hand-written counter
// ---------------------------------------------------------------------------

/**
 * The verdict of the identity check on a source.
 *
 * @param {string} source  the code to measure
 * @param {object} [compteFige] IGNORED on purpose — this is the counter-proof:
 *        a hand-written counter must not be able to turn the check green.
 *        The parameter exists to prove that.
 * @returns {{ok: boolean, asApp: number, asUser: number, raison: string}}
 */
function verifier(source, compteFige) {
  const c = compter(source);
  if (c.asApp > 0) {
    return {
      ok: false,
      asApp: c.asApp,
      asUser: c.asUser,
      raison: c.asApp + ' asApp() call(s) in the active code',
    };
  }
  if (c.asUser < 1) {
    return {
      ok: false,
      asApp: c.asApp,
      asUser: c.asUser,
      raison: 'no asUser() call: the site would be read with no identity at all',
    };
  }
  return { ok: true, asApp: c.asApp, asUser: c.asUser, raison: '' };
}

/** The JS/JSX files of the src/ folder. */
function fichiersSrc() {
  const liste = [];
  (function parcourir(dossier) {
    for (const nom of fs.readdirSync(dossier)) {
      const chemin = path.join(dossier, nom);
      const st = fs.statSync(chemin);
      if (st.isDirectory()) {
        if (nom === 'node_modules') continue;
        parcourir(chemin);
      } else if (/\.(js|jsx)$/.test(nom)) {
        liste.push(chemin);
      }
    }
  })(SRC);
  return liste.sort();
}

/** The complete source of src/, concatenated (the check covers the whole set). */
function sourceSrc() {
  return fichiersSrc()
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
}

/**
 * A documentation text flattened to a single line: the leading `*` of the
 * JSDoc lines and the blanks are removed. Without that, a sentence split
 * over two lines would not be found end to end.
 */
function textePlat(texte) {
  return String(texte)
    .replace(/^[ \t]*\*[ \t]?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The documentation block just above a function. */
function docAuDessus(source, signature) {
  const i = source.indexOf(signature);
  if (i === -1) return '';
  const avant = source.slice(0, i);
  const finBloc = avant.lastIndexOf('*/');
  const debutBloc = avant.lastIndexOf('/**');
  if (finBloc === -1 || debutBloc === -1 || finBloc < debutBloc) return '';
  return avant.slice(debutBloc, finBloc + 2);
}

// ---------------------------------------------------------------------------
// 3. The simulated platform (for the BEHAVIOUR checks)
// ---------------------------------------------------------------------------

let SCENARIO = {};

function reponse(status, body) {
  return { status: status, json: async () => body };
}

api.asUser = () => ({
  requestJira: async (p) => {
    const chemin = String((p && p.value_) || p);
    const def = SCENARIO[chemin];
    if (!def) return reponse(404, { errorMessages: ['not found: ' + chemin] });
    return reponse(def.status, def.body);
  },
});
api.asApp = () => ({
  requestJira: async () => {
    throw new Error('CALL WITH THE APP IDENTITY IS FORBIDDEN IN THIS TEST');
  },
});
api.fetch = async () => {
  throw new Error('EXTERNAL CALL IS FORBIDDEN IN THIS TEST');
};

// ---------------------------------------------------------------------------
// 4. The checks
// ---------------------------------------------------------------------------

async function controles() {
  const res = {};

  // --- A. the CODE ---------------------------------------------------------
  const sourceIndex = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
  const parFichier = fichiersSrc().map((f) => ({
    fichier: path.relative(APP, f),
    ...compter(fs.readFileSync(f, 'utf8')),
  }));
  const totalApp = parFichier.reduce((n, c) => n + c.asApp, 0);
  const totalUser = parFichier.reduce((n, c) => n + c.asUser, 0);

  res['ID-01 NO asApp() call in the active code of src/ (engine, resolver, tools, UI)'] =
    totalApp === 0;
  res['ID-02 the engine reads the site with asUser()'] =
    (parFichier.find((c) => c.fichier === path.join('src', 'index.js')) || {}).asUser >= 1;
  res['ID-03 the MCP tools read the site with asUser()'] =
    (parFichier.find((c) => c.fichier === path.join('src', 'mcp.js')) || {}).asUser >= 1;
  res['ID-04 the identity declared in the report is the one of the code (asUser)'] =
    /const IDENTITE_LECTURE = 'asUser'/.test(codeAvecChaines(sourceIndex));

  // The reason written in the code (rule 2 of the review: a reason,
  // not an excuse).
  const docClient = docAuDessus(sourceIndex, 'function client(');
  const docClientPlat = textePlat(docClient);
  res['ID-05 the reason for the identity choice is WRITTEN in the code (Marketplace rule quoted)'] =
    /asUser/.test(docClientPlat) &&
    /Marketplace/.test(docClientPlat) &&
    /permissions REST APIs/.test(docClientPlat);

  // --- B. the BEHAVIOUR -----------------------------------------------------
  const moteur = require('./src/index.js');

  // B1. the platform refuses the caller's identity (401)
  SCENARIO = {
    '/rest/api/3/serverInfo': { status: 401, body: {} },
  };
  const refusIdentite = await moteur.lancerScan({ pvRecus: {} });
  res['ID-06 a refused identity (401) gives a REFUSAL, not an empty report'] =
    refusIdentite.mode === 'refus-acces' &&
    refusIdentite.autorisation &&
    refusIdentite.autorisation.ok === false &&
    refusIdentite.autorisation.httpStatus === 401 &&
    refusIdentite.findings.length === 0 &&
    /could not be run with your own permissions/.test(refusIdentite.autorisation.message);

  // B2. the platform refuses the READ of the content (403 everywhere, probe OK)
  SCENARIO = {
    '/rest/api/3/serverInfo': { status: 200, body: { baseUrl: 'https://demo.atlassian.net' } },
    '/rest/servicedeskapi/info': { status: 403, body: {} },
    '/rest/api/3/field': { status: 403, body: {} },
    '/rest/api/3/project': { status: 403, body: {} },
    '/rest/api/3/search/jql': { status: 403, body: {} },
  };
  const refusLecture = await moteur.lancerScan({ pvRecus: {} });
  res['ID-07 a refused read (403) gives a REFUSAL, not an empty report'] =
    refusLecture.mode === 'refus-acces' &&
    refusLecture.autorisation &&
    refusLecture.autorisation.ok === false &&
    refusLecture.autorisation.httpStatus === 403 &&
    refusLecture.findings.length === 0;

  // B3. the read succeeds: the report declares the identity used
  SCENARIO = {
    '/rest/api/3/serverInfo': { status: 200, body: { baseUrl: 'https://demo.atlassian.net' } },
    '/rest/servicedeskapi/info': { status: 200, body: { isLicensedForUse: true } },
    '/rest/servicedeskapi/servicedesk': { status: 200, body: { values: [] } },
  };
  const rapport = await moteur.lancerScan({ pvRecus: {} });
  res['ID-08 a successful read declares the identity used (asUser)'] =
    rapport.mode === 'jsm' &&
    rapport.autorisation &&
    rapport.autorisation.ok === true &&
    rapport.autorisation.identity === 'asUser';

  res['__detail__'] =
    'asApp=' + totalApp + ' asUser=' + totalUser + ' | ' +
    parFichier.map((c) => c.fichier + ' asApp=' + c.asApp + ' asUser=' + c.asUser).join(' | ');

  return res;
}

// ---------------------------------------------------------------------------
// 5. The counter-proofs: the check must be able to say NO
// ---------------------------------------------------------------------------

/**
 * The frozen-counter counter-proof: we hand the check a counter written
 * by hand ("asApp = 0") on a source that really does contain an `asApp()`
 * call. The check must ignore that counter and stay RED.
 */
function contreEpreuveCompteFige() {
  const source = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
  const sabotaged = source.replace('return api.asUser();', 'return api.asApp();');
  if (sabotaged === source) return { erreur: 'the mutation changed nothing' };
  const verdict = verifier(sabotaged, { asApp: 0, asUser: 0 });
  return { rouge: verdict.ok === false, detail: verdict.raison };
}

/**
 * The engine counter-proof: a copy of the engine reads with the app
 * identity. The check must see it.
 */
function contreEpreuveMoteurAsApp() {
  const source = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
  const sabotaged = source.replace('return api.asUser();', 'return api.asApp();');
  if (sabotaged === source) return { erreur: 'the mutation changed nothing' };
  const verdict = verifier(sabotaged);
  return { rouge: verdict.ok === false, detail: verdict.raison };
}

/**
 * The declaration counter-proof: the identity announced in the report
 * drifts from the code. The check must see it.
 */
function contreEpreuveDeclarationDerivee() {
  const source = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
  const sabotaged = source.replace("const IDENTITE_LECTURE = 'asUser';", "const IDENTITE_LECTURE = 'asApp';");
  if (sabotaged === source) return { erreur: 'the mutation changed nothing' };
  const declaree = /const IDENTITE_LECTURE = '([^']+)'/.exec(codeAvecChaines(sabotaged));
  const verifie = verifier(sabotaged);
  // The check must see both the counter and the declaration.
  const rouge = verifie.ok === false || !declaree || declaree[1] !== 'asUser';
  return { rouge: rouge, detail: 'declaration = ' + (declaree ? declaree[1] : '?') };
}

/**
 * The reason counter-proof: we erase the reason written in the code.
 * The ID-05 check must become false.
 */
function contreEpreuveRaisonEffacee() {
  const source = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
  const doc = docAuDessus(source, 'function client(');
  if (!doc) return { erreur: 'no documentation block found' };
  const sabotaged = source.replace(doc, '/**\n * (reason absent)\n */');
  if (sabotaged === source) return { erreur: 'the mutation changed nothing' };
  const doc2 = textePlat(docAuDessus(sabotaged, 'function client('));
  const rouge = !/Marketplace/.test(doc2) || !/permissions REST APIs/.test(doc2);
  return { rouge: rouge, detail: 'remaining: ' + JSON.stringify(doc2.slice(0, 60)) };
}

// ---------------------------------------------------------------------------
// 6. Execution
// ---------------------------------------------------------------------------

(async () => {
  console.log('== 1. THE IDENTITY CHECK (active code + behaviour) ==');
  const res = await controles();
  const detail = res['__detail__'];
  delete res['__detail__'];
  Object.keys(res).forEach((k) => check(k, res[k]));

  console.log('');
  console.log('== 2. THE COUNTER-PROOFS (the check must be able to say NO) ==');
  const contreEpreuves = [
    ['the engine reads with the app identity (asApp)', contreEpreuveMoteurAsApp],
    ['the call counter was set to 0 by hand', contreEpreuveCompteFige],
    ['the identity declared in the report drifts from the code', contreEpreuveDeclarationDerivee],
    ['the reason written in the code is erased', contreEpreuveRaisonEffacee],
  ];
  for (const [nom, fn] of contreEpreuves) {
    let rouge = false;
    let crash = null;
    let detailCp = '';
    try {
      const r = fn();
      if (r.erreur) throw new Error(r.erreur);
      rouge = r.rouge === true;
      detailCp = r.detail || '';
    } catch (e) {
      crash = e && e.message ? e.message : String(e);
    }
    check(
      'CONTRE-PROOF "' + nom + '" is detected (explicit failure, no crash)',
      rouge && !crash,
      crash ? 'crash: ' + crash : detailCp
    );
  }

  console.log('');
  console.log('== DETAIL OF THE COUNTS ==');
  console.log(detail);
  console.log('');

  if (failures === 0) {
    console.log('== ALL PASS (' + checks + ' checks): the site is read with the caller\'s identity, and nothing else ==');
  } else {
    console.log('== ' + failures + ' FAILURE(S) on ' + checks + ' checks ==');
  }
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(String((e && e.stack) || e));
  process.exit(1);
});
