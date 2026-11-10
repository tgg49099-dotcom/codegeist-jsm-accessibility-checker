/**
 * test-identite.js — LE CONTRÔLE D'IDENTITÉ (09/11/2026).
 *
 * CE QUE CE TEST PROUVE
 *
 * La règle officielle de la revue Marketplace (« Security requirements for
 * cloud apps », section « Forge apps ») dit :
 *
 *   1. « An application must default to using asUser() when performing an
 *      operation on behalf of the user. »
 *   2. « Before making calls using asApp(), you must verify the expected
 *      permissions (for example, from product context) with the permissions
 *      REST APIs. »
 *
 * L'application agit au nom de quelqu'un (la personne qui appuie sur le
 * bouton de la page d'administration, l'appelant d'un outil MCP) : elle lit
 * donc avec `asUser()`. La règle 2 n'a pas à être invoquée, parce que
 * l'application ne contient AUCUN appel `asApp()` : elle ne peut pas élargir
 * l'identité, donc rien ne peut être élargi par accident.
 *
 * Ce contrôle mesure le CODE ACTIF — les commentaires et les chaînes sont
 * retirés avant de compter, sinon un `asApp` écrit dans une phrase
 * documenting le correctif compterait comme un appel. Il mesure aussi le
 * COMPORTEMENT : quand la plateforme refuse l'identité de l'appelant, le
 * moteur doit REFUSER (et jamais renvoyer un rapport vide, qui se lirait
 * « ce site n'a aucun problème d'accessibilité » alors que rien n'a été lu).
 *
 * POINT MÉTHODOLOGIQUE : le contrôle ne fait JAMAIS confiance à un compteur
 * écrit à la main. Il recompte TOUJOURS depuis la source. La contre-épreuve
 * « le compteur passé à 0 à la main » le vérifie : un compteur figé ne peut
 * pas rendre le contrôle vert.
 *
 * Usage : node test-identite.js
 * RC 0 = tout passe, RC 1 = au moins un contrôle échoue.
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
// 1. Le code actif : commentaires et chaînes RETIRÉS
// ---------------------------------------------------------------------------

/**
 * Le code exécutable d'un fichier JavaScript : les commentaires et le
 * CONTENU des chaînes sont remplacés par des espaces, le code des
 * expressions `${...}` d'un gabarit est conservé.
 *
 * Un `asApp` écrit dans un commentaire ou dans une chaîne n'est pas un
 * appel : le compter serait un faux positif.
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
  let acc = 0; // profondeur d'accolades dans un ${ ... }
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
    // gabarit (template literal)
    if (c === '\\') { out += garderChaines ? c + (src[i + 1] || '') : '  '; i += 2; continue; }
    if (c2 === '${') { out += '  '; i += 2; mode = 'code'; acc = 1; continue; }
    if (c === '`') { out += ' '; i += 1; mode = 'code'; continue; }
    out += vide(c); i += 1;
  }
  return out;
}

/** Le code actif : commentaires ET contenu des chaînes retirés. */
function codeActif(src) {
  return sansCommentaires(src, false);
}

/** Le code sans les commentaires, mais AVEC le contenu des chaînes. */
function codeAvecChaines(src) {
  return sansCommentaires(src, true);
}

/**
 * Les appels d'identité dans le code actif d'une source.
 *
 * On compte les EXPRESSIONS D'APPEL (`asApp(`, `asUser(`) : le mot seul
 * n'est pas un appel.
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
// 2. Le contrôle : il RECOMPTE, il ne fait confiance à aucun compteur écrit
// ---------------------------------------------------------------------------

/**
 * Le verdict du contrôle d'identité sur une source.
 *
 * @param {string} source  le code à mesurer
 * @param {object} [compteFige] IGNORÉ à dessein — c'est la contre-épreuve :
 *        un compteur écrit à la main ne doit pas pouvoir rendre le contrôle
 *        vert. Le paramètre existe pour le prouver.
 * @returns {{ok: boolean, asApp: number, asUser: number, raison: string}}
 */
function verifier(source, compteFige) {
  const c = compter(source);
  if (c.asApp > 0) {
    return {
      ok: false,
      asApp: c.asApp,
      asUser: c.asUser,
      raison: c.asApp + ' appel(s) asApp() dans le code actif',
    };
  }
  if (c.asUser < 1) {
    return {
      ok: false,
      asApp: c.asApp,
      asUser: c.asUser,
      raison: 'aucun appel asUser() : le site ne serait lu avec aucune identité',
    };
  }
  return { ok: true, asApp: c.asApp, asUser: c.asUser, raison: '' };
}

/** Les fichiers JS/JSX du dossier src/. */
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

/** Le source complet de src/, concaténé (le contrôle porte sur l'ensemble). */
function sourceSrc() {
  return fichiersSrc()
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
}

/**
 * Un texte de documentation ramené à une seule ligne : les `*` de début de
 * ligne du JSDoc et les blancs sont retirés. Sans cela, une phrase coupée
 * entre deux lignes ne se retrouverait pas d'un bout à l'autre.
 */
function textePlat(texte) {
  return String(texte)
    .replace(/^[ \t]*\*[ \t]?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Le bloc de documentation juste au-dessus d'une fonction. */
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
// 3. La plateforme simulée (pour les contrôles de COMPORTEMENT)
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
    throw new Error('APPEL AVEC L\'IDENTITÉ DE L\'APP INTERDIT DANS CE TEST');
  },
});
api.fetch = async () => {
  throw new Error('APPEL EXTERNE INTERDIT DANS CE TEST');
};

// ---------------------------------------------------------------------------
// 4. Les contrôles
// ---------------------------------------------------------------------------

async function controles() {
  const res = {};

  // --- A. le CODE ----------------------------------------------------------
  const sourceIndex = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
  const parFichier = fichiersSrc().map((f) => ({
    fichier: path.relative(APP, f),
    ...compter(fs.readFileSync(f, 'utf8')),
  }));
  const totalApp = parFichier.reduce((n, c) => n + c.asApp, 0);
  const totalUser = parFichier.reduce((n, c) => n + c.asUser, 0);

  res['ID-01 AUCUN appel asApp() dans le code actif de src/ (moteur, resolver, outils, IHM)'] =
    totalApp === 0;
  res['ID-02 le moteur lit le site avec asUser()'] =
    (parFichier.find((c) => c.fichier === path.join('src', 'index.js')) || {}).asUser >= 1;
  res['ID-03 les outils MCP lisent le site avec asUser()'] =
    (parFichier.find((c) => c.fichier === path.join('src', 'mcp.js')) || {}).asUser >= 1;
  res['ID-04 l\'identité déclarée dans le rapport est celle du code (asUser)'] =
    /const IDENTITE_LECTURE = 'asUser'/.test(codeAvecChaines(sourceIndex));

  // La raison écrite dans le code (règle 2 de la revue : une raison, pas
  // une excuse).
  const docClient = docAuDessus(sourceIndex, 'function client(');
  const docClientPlat = textePlat(docClient);
  res['ID-05 la raison du choix d\'identité est ÉCRITE dans le code (règle Marketplace citée)'] =
    /asUser/.test(docClientPlat) &&
    /Marketplace/.test(docClientPlat) &&
    /permissions REST APIs/.test(docClientPlat);

  // --- B. le COMPORTEMENT ---------------------------------------------------
  const moteur = require('./src/index.js');

  // B1. la plateforme refuse l'identité de l'appelant (401)
  SCENARIO = {
    '/rest/api/3/serverInfo': { status: 401, body: {} },
  };
  const refusIdentite = await moteur.lancerScan({ pvRecus: {} });
  res['ID-06 une identité refusée (401) donne un REFUS, pas un rapport vide'] =
    refusIdentite.mode === 'refus-acces' &&
    refusIdentite.autorisation &&
    refusIdentite.autorisation.ok === false &&
    refusIdentite.autorisation.httpStatus === 401 &&
    refusIdentite.findings.length === 0 &&
    /could not be run with your own permissions/.test(refusIdentite.autorisation.message);

  // B2. la plateforme refuse la LECTURE du contenu (403 sur tout, sonde OK)
  SCENARIO = {
    '/rest/api/3/serverInfo': { status: 200, body: { baseUrl: 'https://demo.atlassian.net' } },
    '/rest/servicedeskapi/info': { status: 403, body: {} },
    '/rest/api/3/field': { status: 403, body: {} },
    '/rest/api/3/project': { status: 403, body: {} },
    '/rest/api/3/search/jql': { status: 403, body: {} },
  };
  const refusLecture = await moteur.lancerScan({ pvRecus: {} });
  res['ID-07 une lecture refusée (403) donne un REFUS, pas un rapport vide'] =
    refusLecture.mode === 'refus-acces' &&
    refusLecture.autorisation &&
    refusLecture.autorisation.ok === false &&
    refusLecture.autorisation.httpStatus === 403 &&
    refusLecture.findings.length === 0;

  // B3. la lecture passe : le rapport déclare l'identité utilisée
  SCENARIO = {
    '/rest/api/3/serverInfo': { status: 200, body: { baseUrl: 'https://demo.atlassian.net' } },
    '/rest/servicedeskapi/info': { status: 200, body: { isLicensedForUse: true } },
    '/rest/servicedeskapi/servicedesk': { status: 200, body: { values: [] } },
  };
  const rapport = await moteur.lancerScan({ pvRecus: {} });
  res['ID-08 une lecture réussie déclare l\'identity utilisée (asUser)'] =
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
// 5. Les contre-épreuves : le contrôle doit savoir dire NON
// ---------------------------------------------------------------------------

/**
 * La contre-épreuve du compteur figé : on passe au contrôle un compteur
 * écrit à la main (« asApp = 0 ») sur une source qui contient bel et bien un
 * appel `asApp()`. Le contrôle doitignorer ce compteur et rester ROUGE.
 */
function contreEpreuveCompteFige() {
  const source = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
  const sabotaged = source.replace('return api.asUser();', 'return api.asApp();');
  if (sabotaged === source) return { erreur: 'la mutation n\'a rien changé' };
  const verdict = verifier(sabotaged, { asApp: 0, asUser: 0 });
  return { rouge: verdict.ok === false, detail: verdict.raison };
}

/**
 * La contre-épreuve du moteur : une copie du moteur lit avec l'identité de
 * l'app. Le contrôle doit la voir.
 */
function contreEpreuveMoteurAsApp() {
  const source = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
  const sabotaged = source.replace('return api.asUser();', 'return api.asApp();');
  if (sabotaged === source) return { erreur: 'la mutation n\'a rien changé' };
  const verdict = verifier(sabotaged);
  return { rouge: verdict.ok === false, detail: verdict.raison };
}

/**
 * La contre-épreuve de la déclaration : l'identité annoncée dans le rapport
 * dérive du code. Le contrôle doit le voir.
 */
function contreEpreuveDeclarationDerivee() {
  const source = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
  const sabotaged = source.replace("const IDENTITE_LECTURE = 'asUser';", "const IDENTITE_LECTURE = 'asApp';");
  if (sabotaged === source) return { erreur: 'la mutation n\'a rien changé' };
  const declaree = /const IDENTITE_LECTURE = '([^']+)'/.exec(codeAvecChaines(sabotaged));
  const verifie = verifier(sabotaged);
  // Le contrôle doit voir à la fois le compteur et la déclaration.
  const rouge = verifie.ok === false || !declaree || declaree[1] !== 'asUser';
  return { rouge: rouge, detail: 'déclaration = ' + (declaree ? declaree[1] : '?') };
}

/**
 * La contre-épreuve de la raison : on efface la raison écrite dans le code.
 * Le contrôle ID-05 doit devenir faux.
 */
function contreEpreuveRaisonEffacee() {
  const source = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
  const doc = docAuDessus(source, 'function client(');
  if (!doc) return { erreur: 'aucun bloc de documentation trouvé' };
  const sabotaged = source.replace(doc, '/**\n * (raison absente)\n */');
  if (sabotaged === source) return { erreur: 'la mutation n\'a rien changé' };
  const doc2 = textePlat(docAuDessus(sabotaged, 'function client('));
  const rouge = !/Marketplace/.test(doc2) || !/permissions REST APIs/.test(doc2);
  return { rouge: rouge, detail: 'reste : ' + JSON.stringify(doc2.slice(0, 60)) };
}

// ---------------------------------------------------------------------------
// 6. Exécution
// ---------------------------------------------------------------------------

(async () => {
  console.log('== 1. LE CONTRÔLE D\'IDENTITÉ (code actif + comportement) ==');
  const res = await controles();
  const detail = res['__detail__'];
  delete res['__detail__'];
  Object.keys(res).forEach((k) => check(k, res[k]));

  console.log('');
  console.log('== 2. CONTRE-ÉPREUVES (le contrôle doit savoir dire NON) ==');
  const contreEpreuves = [
    ['le moteur lit avec l\'identité de l\'app (asApp)', contreEpreuveMoteurAsApp],
    ['le compteur d\'appels est passé à 0 à la main', contreEpreuveCompteFige],
    ['l\'identité déclarée dans le rapport dérive du code', contreEpreuveDeclarationDerivee],
    ['la raison écrite dans le code est effacée', contreEpreuveRaisonEffacee],
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
      'CONTRE-ÉPREUVE « ' + nom + ' » est détectée (échec explicite, sans crash)',
      rouge && !crash,
      crash ? 'crash : ' + crash : detailCp
    );
  }

  console.log('');
  console.log('== DÉTAIL DES COMPTES ==');
  console.log(detail);
  console.log('');

  if (failures === 0) {
    console.log('== TOUT PASS (' + checks + ' contrôles) : le site est lu avec l\'identité de l\'appelant, et rien d\'autre ==');
  } else {
    console.log('== ' + failures + ' ÉCHEC(S) sur ' + checks + ' contrôles ==');
  }
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(String((e && e.stack) || e));
  process.exit(1);
});
