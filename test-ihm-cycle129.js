/**
 * test-ihm-cycle129.js — preuve HORS LIGNE de l'IHM (cycle 129).
 *
 * Ce que le cycle 128 a laissé en suspens : le code de l'interface existe,
 * mais rien ne prouve, hors ligne, que
 *   (1) le manifeste n'expose PLUS AUCUN module public appelable SANS
 *       authentification (le module `rovo:mcp` du cycle 134 n'en est pas un :
 *       c'est un serveur d'outils porté par l'identité de l'appelant) ;
 *   (2) le resolver refuse un appel sans compte connecté ;
 *   (3) l'interface n'utilise que des composants UI Kit 2 (@forge/react) ;
 *   (4) l'interface est en ANGLAIS ;
 *   (5) l'interface appelle le MÊME moteur de scan que le déclencheur d'hier.
 *
 * CYCLE 134 (09/11/2026) : le manifeste déclare désormais QUATRE types de
 * modules (`jira:adminPage`, `function`, `action`, `rovo:mcp`). Les contrôles
 * MANIFEST-02 et MANIFEST-05 ont donc été réécrits, et les contrôles
 * MANIFEST-12 à MANIFEST-16 ont été ajoutés pour le module MCP : un seul
 * serveur, deux outils, chaque outil est une action déclarée, chaque action
 * pointe une fonction dont le handler existe, chaque description tient dans
 * les 255 caractères imposés par Atlassian.
 *
 * POINT MÉTHODOLOGIQUE (leçon des cycles précédents) : chaque contrôle est
 * une FONCTION, appelée sur le fichier RÉEL, puis sur une COPIE SABOTÉE. Le
 * contrôle doit rester VERT sur le fichier réel et devenir ROUGE sur la copie
 * sabotée : sans cette contre-épreuve, « 0 violation » ne prouve rien (un
 * harnais qui ne teste rien est vert).
 *
 * Un contrôle « ne doit PAS contenir » se fait sur le CODE SEUL : les
 * commentaires sont retirés avant la recherche (sinon le commentaire qui
 * documente la correction triggerait le contrôle). Un contrôle « doit
 * contenir » lit le fichier BRUT (un commentaire qui documente un
 * historique a le droit d'y être).
 *
 * Usage : node test-ihm-cycle129.js
 * RC 0 = tout passe, RC 1 = au moins un contrôle échoue.
 */
const fs = require('fs');
const path = require('path');

const APP = __dirname;
let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

// ---------------------------------------------------------------------------
// 1. Le manifeste : plus AUCUN module public, plus AUCUN appel sortant.
// ---------------------------------------------------------------------------

/** Retire les commentaires d'un YAML/JS de façon simple et sûre. */
function sansCommentaires(texte) {
  return texte
    .split('\n')
    .map((l) => {
      const t = l.trim();
      if (t.startsWith('#')) return '';
      return l.replace(/(^|\s)#.*$/, '$1');
    })
    .join('\n');
}

/**
 * Les modules déclarés, lus par structure YAML simplifiée (le manifeste est
 * un fichier écrit à la main : 2 niveaux, `- key:`).
 */
function modulesDuManifeste(texte) {
  const lignes = texte.split('\n');
  const modules = [];
  let dansModules = false;
  let typeCourant = null;
  for (const l of lignes) {
    if (/^modules:\s*$/.test(l)) {
      dansModules = true;
      continue;
    }
    if (dansModules && /^[a-zA-Z]/.test(l) && !/^modules:/.test(l)) {
      dansModules = false; // une nouvelle section racine
    }
    if (!dansModules) continue;
    const mType = /^ {2}([a-zA-Z][\w:.-]*):\s*$/.exec(l);
    if (mType) {
      typeCourant = mType[1];
      modules.push({ type: typeCourant, keys: [] });
      continue;
    }
    const mKey = /^ {4}- key:\s*(\S+)\s*$/.exec(l);
    if (mKey && modules.length) modules[modules.length - 1].keys.push(mKey[1]);
  }
  return modules;
}

function scopesDuManifeste(texte) {
  const bloc = /permissions:\s*\n\s*scopes:\s*\n((?:\s*-\s*\S+\s*\n)+)/.exec(texte);
  if (!bloc) return [];
  return bloc[1]
    .split('\n')
    .map((l) => l.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Le BLOC d'un type de module, ancré sur sa section (jamais sur le fichier
 * entier) : sans cette ancre, un contrôle « le module X expose 2 outils »
 * pourrait être satisfait par un mot écrit dans un commentaire ou ailleurs
 * dans le fichier.
 */
function blocType(code, type) {
  const lignes = code.split('\n');
  let debut = -1;
  for (let i = 0; i < lignes.length; i++) {
    const m = /^ {2}([a-zA-Z][\w:.-]*):\s*$/.exec(lignes[i]);
    if (m && m[1] === type) {
      debut = i;
      break;
    }
  }
  if (debut === -1) return '';
  const bloc = [];
  for (let i = debut + 1; i < lignes.length; i++) {
    const l = lignes[i];
    if (!l.trim()) {
      bloc.push(l);
      continue;
    }
    const ind = l.length - l.replace(/^ +/, '').length;
    if (ind <= 2) break;
    bloc.push(l);
  }
  return bloc.join('\n');
}

/**
 * Les ITEMS d'un type de module : pour chacun, sa clé, sa fonction, son
 * handler, sa liste d'outils et sa description (scalaire plié compris).
 */
function itemsType(code, type) {
  const bloc = blocType(code, type);
  const lignes = bloc.split('\n');
  const items = [];
  let courant = null;
  let style = null;
  let tampon = [];
  for (const l of lignes) {
    if (!l.trim()) continue;
    const ind = l.length - l.replace(/^ +/, '').length;
    if (style) {
      if (ind > style) {
        tampon.push(l.trim());
        continue;
      }
      if (courant) courant.description = tampon.join(' ').trim();
      style = null;
      tampon = [];
    }
    const mk = /^ {4}- key:\s*(\S+)\s*$/.exec(l);
    if (mk) {
      if (courant) items.push(courant);
      courant = { key: mk[1], fonction: null, handler: null, tools: [], description: null, nom: null };
      continue;
    }
    if (!courant) continue;
    const mf = /^ {6}function:\s*(\S+)\s*$/.exec(l);
    if (mf) {
      courant.fonction = mf[1];
      continue;
    }
    const mh = /^ {6}handler:\s*(\S+)\s*$/.exec(l);
    if (mh) {
      courant.handler = mh[1];
      continue;
    }
    const mn = /^ {6}name:\s*(\S.*)$/.exec(l);
    if (mn) {
      courant.nom = mn[1].trim();
      continue;
    }
    const md = /^ {6}description:\s*(.+)$/.exec(l);
    if (md) {
      const v = md[1].trim();
      if (v === '>' || v === '|') {
        style = 6;
        tampon = [];
      } else {
        courant.description = v;
      }
      continue;
    }
    const mt = /^ {8}-\s+(\S+)\s*$/.exec(l);
    if (mt) courant.tools.push(mt[1]);
  }
  if (courant) items.push(courant);
  return items;
}

function controlesManifeste(texte) {
  const brut = texte;
  const code = sansCommentaires(texte);
  const modules = modulesDuManifeste(code);
  const types = modules.map((m) => m.type);
  // Les modules publics = des points d'entrée appelables par quiconque trouve
  // une URL. `rovo:mcp` n'en est pas un : c'est un serveur d'outils dont
  // l'appel est porté par l'identité de l'appelant (vérifié par le code,
  // src/mcp.js). Le contrôle porte donc sur les types EXACTS.
  const PUBLICS = ['webtrigger', 'productTrigger', 'scheduleTrigger', 'trigger'];
  const publics = types.filter((t) => PUBLICS.indexOf(t) !== -1);

  const mcps = itemsType(code, 'rovo:mcp');
  const actions = itemsType(code, 'action');
  const fonctions = itemsType(code, 'function');
  const outils = mcps.length ? mcps[0].tools : [];

  return {
    'MANIFEST-01 aucun module webtrigger':
      !/webtrigger/i.test(code) && !types.includes('webtrigger'),
    'MANIFEST-02 aucun module public appelable sans authentification':
      publics.length === 0,
    'MANIFEST-03 le module d\'interface jira:adminPage est déclaré':
      types.includes('jira:adminPage'),
    'MANIFEST-04 le module de fonction resolver est déclaré':
      types.includes('function') &&
      modules.filter((m) => m.type === 'function')[0].keys.indexOf('resolver') !== -1,
    'MANIFEST-05 exactement quatre types de modules (jira:adminPage, function, action, rovo:mcp)':
      types.length === 4 &&
      types.indexOf('jira:adminPage') !== -1 &&
      types.indexOf('function') !== -1 &&
      types.indexOf('action') !== -1 &&
      types.indexOf('rovo:mcp') !== -1,
    'MANIFEST-06 aucune sortie réseau (egress) déclarée':
      !/^\s*external\s*:/m.test(code) && !/remote\s*:/m.test(code),
    'MANIFEST-07 aucun joker de domaine':
      !/\*\.[a-z0-9-]+\.[a-z]{2,}/i.test(code),
    'MANIFEST-08 les scopes sont exactement les deux scopes de lecture':
      JSON.stringify(scopesDuManifeste(code)) ===
        JSON.stringify(['read:jira-work', 'read:servicedesk-request']),
    'MANIFEST-09 le fichier de ressources existe':
      fs.existsSync(path.join(APP, 'src/frontend/admin.jsx')),
    'MANIFEST-10 le handler du resolver existe':
      fs.existsSync(path.join(APP, 'src/resolvers.js')) &&
      /exports\.handler\s*=/.test(fs.readFileSync(path.join(APP, 'src/resolvers.js'), 'utf8')),
    'MANIFEST-11 le commentaire d\'en-tête DOCumente le retrait du déclencheur public':
      /public trigger|webtrigger/i.test(brut),
    'MANIFEST-12 exactement un module rovo:mcp exposant deux outils':
      mcps.length === 1 && outils.length === 2,
    'MANIFEST-13 chaque outil MCP est une action déclarée':
      outils.length > 0 &&
      outils.every((o) => actions.some((a) => a.key === o)),
    'MANIFEST-14 chaque action pointe une fonction déclarée dont le handler existe':
      actions.length > 0 &&
      actions.every((a) => {
        const f = fonctions.find((x) => x.key === a.fonction);
        if (!f || !f.handler) return false;
        const pieces = f.handler.split('.');
        const fichier = path.join(APP, 'src', pieces[0] + '.js');
        if (!fs.existsSync(fichier)) return false;
        return fs.readFileSync(fichier, 'utf8').indexOf('exports.' + pieces[pieces.length - 1]) !== -1;
      }),
    'MANIFEST-15 chaque action a une description d\'au plus 255 caractères':
      actions.length > 0 &&
      actions.every((a) => typeof a.description === 'string' && a.description.length > 0 && a.description.length <= 255),
    'MANIFEST-16 le nom du serveur MCP fait au plus 30 caractères':
      mcps.length === 1 &&
      typeof mcps[0].nom === 'string' &&
      mcps[0].nom.length > 0 &&
      mcps[0].nom.length <= 30,
  };
}

// ---------------------------------------------------------------------------
// 2. Le resolver : la porte d'identité.
// ---------------------------------------------------------------------------

const resolver = require(path.join(APP, 'src', 'resolvers.js'));

async function controlesResolver() {
  const res = {};
  const sansCompte = await resolver.handler(
    { call: { functionKey: 'scan', payload: {} }, context: {} },
    {}
  );
  res['GATE-01 un appel sans compte connecté est refusé (scan)'] =
    sansCompte && sansCompte.ok === false && sansCompte.error === 'NOT_AUTHENTICATED';
  res['GATE-02 un appel sans compte connecté ne renvoie AUCUN rapport'] =
    sansCompte && sansCompte.report === undefined;

  const sansCompteDemo = await resolver.handler(
    { call: { functionKey: 'scanDemo', payload: {} }, context: {} },
    {}
  );
  res['GATE-03 un appel sans compte connecté est refusé (scanDemo)'] =
    sansCompteDemo && sansCompteDemo.ok === false;

  const inconnu = await resolver.handler(
    { call: { functionKey: 'autreFonction', payload: {} }, context: { accountId: 'a' } },
    { principal: { accountId: 'a' } }
  );
  res['GATE-04 une fonction inconnue est refusée, pas exécutée'] =
    inconnu && inconnu.ok === false && inconnu.error === 'UNKNOWN_FUNCTION';

  const rendu = await resolver.handler({ context: {} }, { principal: { accountId: 'a' } });
  res['GATE-05 l\'affichage de la page ne lance aucun scan'] =
    rendu && rendu.ok === true && rendu.report === undefined;

  // Le MÊME moteur que le déclencheur d'hier : la démo rend les 23 constats
  // seedés, et le « scan » appelle bien le moteur (et pas un panneau figé).
  const demo = await resolver.handler(
    { call: { functionKey: 'scanDemo', payload: {} }, context: { accountId: 'compte' } },
    { principal: { accountId: 'compte' } }
  );
  res['GATE-06 le resolver appelle le moteur (23 constats de démonstration)'] =
    demo && demo.ok === true && demo.report && demo.report.constats &&
    demo.report.constats.length === 23;
  res['GATE-07 la réponse porte le compte qui a demandé'] =
    demo && demo.requestedBy && demo.requestedBy.accountId === 'compte';
  res['GATE-08 l\'export CSV est produit par le resolver'] =
    demo && typeof demo.csv === 'string' && demo.csv.trim().split(/\r?\n/).length === 24;
  return res;
}

// ---------------------------------------------------------------------------
// 3. L'interface : composants UI Kit 2, pas de HTML brut, en anglais.
// ---------------------------------------------------------------------------

/** Les composants exportés par le paquet INSTALLÉ (@forge/react). */
function composantsUIKit2() {
  const racine = path.join(APP, 'node_modules', '@forge', 'react', 'out');
  if (!fs.existsSync(racine)) return null;
  const noms = new Set();
  const fichiers = [];
  (function marcher(d) {
    let entrees = [];
    try {
      entrees = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const e of entrees) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) marcher(p);
      else if (e.name.endsWith('.d.ts')) fichiers.push(p);
    }
  })(racine);
  for (const f of fichiers) {
    const src = fs.readFileSync(f, 'utf8');
    // `export declare const X: …` et `export declare function X(…)`
    const re = /export\s+declare\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(src))) noms.add(m[1]);
    // `export { A, B as C }`
    const re2 = /export\s*\{([^}]*)\}/g;
    while ((m = re2.exec(src))) {
      m[1].split(',').forEach((n) => {
        const nom = n.trim().split(/\s+as\s+/).pop().trim();
        if (nom) noms.add(nom);
      });
    }
  }
  return noms;
}

/** Le code JSX SANS les commentaires (contrôles « ne doit pas contenir »). */
function codeJsxSansCommentaires(src) {
  // On remplace les commentaires de ligne et de bloc par des espaces, en
  // Tenant compte des chaînes (un « // » dans une chaîne n'est pas un
  // commentaire).
  let out = '';
  let i = 0;
  const n = src.length;
  let mode = 'code';
  while (i < n) {
    const c = src[i];
    const c2 = src.substr(i, 2);
    if (mode === 'code') {
      if (c2 === '/*') { out += '  '; i += 2; mode = 'bloc'; continue; }
      if (c2 === '//') { out += '  '; i += 2; mode = 'ligne'; continue; }
      if (c === '"' || c === "'" || c === '`') { mode = c; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (mode === 'bloc') {
      if (c2 === '*/') { out += '  '; i += 2; mode = 'code'; continue; }
      out += c === '\n' ? '\n' : ' '; i += 1; continue;
    }
    if (mode === 'ligne') {
      if (c === '\n') { mode = 'code'; out += '\n'; i += 1; continue; }
      out += ' '; i += 1; continue;
    }
    // dans une chaîne
    if (c === '\\') { out += c + (src[i + 1] || ''); i += 2; continue; }
    out += c;
    if (c === mode) { mode = 'code'; }
    i += 1;
  }
  return out;
}

function controlesInterface(texteJsx, composants) {
  const code = codeJsxSansCommentaires(texteJsx);
  const res = {};
  const interdits = ['div', 'span', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'br', 'hr', 'input', 'label', 'form', 'section', 'article', 'header', 'footer', 'nav', 'main', 'iframe', 'style', 'script'];
  const trouves = [];
  for (const t of interdits) {
    const re = new RegExp('<' + t + '(\\s|>|/)', 'i');
    if (re.test(code)) trouves.push(t);
  }
  res['UI-01 aucun composant HTML brut dans le JSX'] =
    trouves.length === 0;
  res['UI-02 le JSX n\'importe rien de @forge/ui (UI Kit 1, déprécié)'] =
    !/@forge\/ui/.test(code);
  res['UI-03 le JSX importe le réconciliateur UI Kit 2'] =
    /@forge\/react/.test(code) && /ForgeReconciler/.test(code);
  res['UI-04 le bouton s\'appelle « Run the scan »'] =
    /Run the scan/.test(code);
  res['UI-05 le bouton d\'export CSV est présent'] =
    /Download the findings as CSV/.test(code);
  res['UI-06 l\'interface appelle le resolver (invoke), pas un appel HTTP direct'] =
    /runScan|runDemoScan/.test(code) && !/XMLHttpRequest|fetch\s*\(/.test(code);
  res['UI-07 aucune balise <a href> vers un site externe'] =
    !/<a\s[^>]*href\s*=\s*["']https?:/i.test(code);

  // Les composants importés de @forge/react existent-ils dans le paquet ?
  const m = /import\s+ForgeReconciler\s*,\s*\{([^}]*)\}\s+from\s+["']@forge\/react["']/.exec(code);
  const importes = m
    ? m[1].split(',').map((x) => x.trim()).filter(Boolean)
    : [];
  res['UI-08 tous les composants importés existent dans @forge/react installé'] =
    composants !== null &&
    importes.every((nom) => composants.has(nom));
  res['UI-09 la liste des composants importés est non vide'] = importes.length >= 5;

  // L'interface est en ANGLAIS : pas de caractère accentué ni de mot français
  // dans le TEXTE affiché (les chaînes de l'interface, pas les commentaires).
  const chaines = [];
  const re = />([^<>{}]{4,})</g;
  let mm;
  while ((mm = re.exec(code))) chaines.push(mm[1]);
  const texteAffiche = chaines.join(' ');
  const francais = /[àâäçéèêëîïôöùûüÿœæ]|\b(le|la|les|des|une|un|est|sont|dans|pour|avec|sans|sur|par|ne|pas|que|qui|aux|du|de|au|constat|résultat|lecture|seule|renvoie|trouve|étiquette|libellé|utilisateur)\b/i;
  const coupables = chaines.filter((s) => francais.test(s));
  res['UI-10 tous les textes affichés sont en anglais'] =
    coupables.length === 0;
  res['UI-11 l\'interface annonce la confidentialité et le mode de lecture'] =
    /logged-in user who started the scan/.test(code) && /reads only/.test(code);

  return { res, importes, trouves, coupables };
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------

(async () => {
  const manifeste = fs.readFileSync(path.join(APP, 'manifest.yml'), 'utf8');
  const jsx = fs.readFileSync(path.join(APP, 'src', 'frontend', 'admin.jsx'), 'utf8');
  const composants = composantsUIKit2();

  console.log('== 1. LE MANIFESTE (aucun module public sans authentification) ==');
  const cm = controlesManifeste(manifeste);
  Object.keys(cm).forEach((k) => check(k, cm[k]));

  console.log('');
  console.log('== 2. LE RESOLVER (la porte d\'identité) ==');
  const cr = await controlesResolver();
  Object.keys(cr).forEach((k) => check(k, cr[k]));

  console.log('');
  console.log('== 3. L\'INTERFACE (UI Kit 2, anglais) ==');
  const ci = controlesInterface(jsx, composants);
  Object.keys(ci.res).forEach((k) => check(k, ci.res[k]));
  if (ci.trouves.length) console.log('   (balises brutes trouvées : ' + ci.trouves.join(', ') + ')');
  if (ci.coupables.length) console.log('   (textes français : ' + JSON.stringify(ci.coupables) + ')');

  // -------------------------------------------------------------------------
  // 4. LA CONTRE-ÉPREUVE : les mêmes contrôles sur des copies SABOTÉES
  //    doivent devenir ROUGES. Sans cela, « 0 violation » ne prouve rien.
  // -------------------------------------------------------------------------
  console.log('');
  console.log('== 4. CONTRE-ÉPREUVE (le harnais doit devenir rouge) ==');

  const sabotages = [
    {
      nom: 'un webtrigger réintroduit dans le manifeste',
      mutant: (t) => t.replace('modules:', 'modules:\n  webtrigger:\n    - key: scan-trigger\n      handler: scan.handler\n'),
      famille: 'MANIFEST',
      attendu: 'MANIFEST-01 aucun module webtrigger',
    },
    {
      nom: 'un scope d\'écriture réintroduit',
      mutant: (t) => t.replace('    - read:jira-work', '    - write:jira-work'),
      famille: 'MANIFEST',
      attendu: 'MANIFEST-08 les scopes sont exactement les deux scopes de lecture',
    },
    {
      nom: 'un appel sortant (egress) réintroduit',
      mutant: (t) => t.replace('permissions:', 'external:\n  fetch:\n    - host: "*.atlassian.net"\npermissions:'),
      famille: 'MANIFEST',
      attendu: 'MANIFEST-06 aucune sortie réseau (egress) déclarée',
    },
    {
      nom: 'une balise HTML brute dans l\'interface',
      mutant: (t) => t.replace('<Text>', '<div><Text>').replace('</Text>', '</Text></div>'),
      famille: 'UI',
      attendu: 'UI-01 aucun composant HTML brut dans le JSX',
    },
    {
      nom: 'un message en français dans l\'interface',
      mutant: (t) => t.replace('Run the scan', 'Lancer le scan'),
      famille: 'UI',
      attendu: 'UI-10 tous les textes affichés sont en anglais',
    },
    // --- sabotages du cycle 134 : le module rovo:mcp et ses deux outils -----
    {
      nom: 'un outil MCP ne pointe plus vers une action déclarée',
      mutant: (t) => t.replace('        - scan_accessibility\n', '        - outil_qui_nexiste_pas\n'),
      famille: 'MANIFEST',
      attendu: 'MANIFEST-13 chaque outil MCP est une action déclarée',
    },
    {
      nom: 'un deuxième serveur MCP est déclaré',
      mutant: (t) =>
        t.replace(
          '  rovo:mcp:\n',
          '  rovo:mcp:\n    - key: pac-jsm-mcp-bis\n      name: Second serveur\n      tools:\n        - scan_accessibility\n'
        ),
      famille: 'MANIFEST',
      attendu: 'MANIFEST-12 exactement un module rovo:mcp exposant deux outils',
    },
    {
      nom: 'la description d\'une action dépasse 255 caractères',
      mutant: (t) =>
        t.replace(
          '        permissions. Nothing is written or stored.\n',
          '        permissions. Nothing is written or stored. ' + 'Ce texte est volontairement trop long. '.repeat(12) + '\n'
        ),
      famille: 'MANIFEST',
      attendu: 'MANIFEST-15 chaque action a une description d\'au plus 255 caractères',
    },
  ];

  for (const s of sabotages) {
    let rouge = false;
    let aEchoue = false;
    try {
      if (s.famille === 'MANIFEST') {
        const cm2 = controlesManifeste(s.mutant(manifeste));
        aEchoue = cm2[s.attendu] === false;
      } else {
        const ci2 = controlesInterface(s.mutant(jsx), composants);
        aEchoue = ci2.res[s.attendu] === false;
      }
      rouge = aEchoue;
    } catch (e) {
      aEchoue = false;
      rouge = false;
      console.log('   (le harnais a CRASHÉ sur « ' + s.nom + ' » : ' + e.message + ')');
    }
    check('CONTRE-ÉPREUVE « ' + s.nom + ' » est détecté (échec explicite, sans crash)', rouge);
  }

  console.log('');
  if (failures === 0) {
    console.log('== TOUT PASS (' + checks + ' contrôles) : l\'IHM remplace le déclencheur public ==');
  } else {
    console.log('== ' + failures + ' ÉCHEC(S) sur ' + checks + ' contrôles ==');
  }
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(String((e && e.stack) || e));
  process.exit(1);
});
