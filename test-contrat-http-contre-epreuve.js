/**
 * Contre-épreuve du harnais du CONTRAT DU RESOLVER (test-contrat-http.js).
 *
 * Un harnais qui dit « 59 contrôles PASS » ne prouve rien tant qu'on n'a pas
 * montré qu'il devient ROUGE quand le contrat est cassé. Ce script :
 *   1. rejoue le harnais sur une copie INTACTE de l'app (contrôle : il doit
 *      être vert) ;
 *   2. casse le contrat une fois par sabotage, sur une copie, et exige que le
 *      harnais devienne ROUGE, qu'il nomme le contrôle cassé, et qu'il n'ait
 *      pas simplement CRASHÉ (un crash ne distingue pas « détecté » de
 *      « cassé »).
 *
 * CYCLE 128 (05/11/2026) : deux sabotages supplémentaires portent sur le
 * resolver lui-même — la gâche d'identité et l'appel AU MOTEUR. C'est la
 * preuve que le harnais ne se fabrique pas son propre verdict : un resolver
 * qui répondrait un panneau figé, ou qui accepterait un appel sans compte
 * connecté, est détecté.
 *
 * Usage : node test-contrat-http-contre-epreuve.js
 * RC 0 = les contre-épreuves sont concluantes, RC 1 = au moins une ne l'est pas.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const APP = __dirname;
let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

/** Copie l'app (sans node_modules, qui est un lien symbolique) dans un dossier temporaire. */
function copierApp(suffixe) {
  const cible = fs.mkdtempSync(path.join(os.tmpdir(), 'pac-contrat-' + suffixe + '-'));
  fs.mkdirSync(path.join(cible, 'src'), { recursive: true });
  fs.mkdirSync(path.join(cible, 'src', 'demo'), { recursive: true });
  fs.cpSync(path.join(APP, 'src', 'index.js'), path.join(cible, 'src', 'index.js'));
  fs.cpSync(path.join(APP, 'src', 'resolvers.js'), path.join(cible, 'src', 'resolvers.js'));
  fs.cpSync(path.join(APP, 'src', 'demo.js'), path.join(cible, 'src', 'demo.js'));
  fs.cpSync(path.join(APP, 'src', 'regles.js'), path.join(cible, 'src', 'regles.js'));
  fs.cpSync(path.join(APP, 'src', 'demo'), path.join(cible, 'src', 'demo'), { recursive: true });
  fs.cpSync(path.join(APP, 'test-contrat-http.js'), path.join(cible, 'test-contrat-http.js'));
  try {
    fs.symlinkSync(path.join(APP, 'node_modules'), path.join(cible, 'node_modules'), 'dir');
  } catch (e) {
    // sans lien symbolique, le harnais ne pourra pas charger @forge/api ni acorn
  }
  return cible;
}

/** Exécute le harnais dans un dossier et renvoie {code, sortie}. */
function lancerHarnais(dossier) {
  const res = spawnSync(process.execPath, [path.join(dossier, 'test-contrat-http.js')], {
    cwd: dossier,
    encoding: 'utf8',
  });
  return { code: res.status, sortie: (res.stdout || '') + (res.stderr || '') };
}

/** Remplace une chaîne unique et vérifie qu'elle n'était présente qu'une fois. */
const sabotage = (texte, avant, apres) => {
  const occurrences = texte.split(avant).length - 1;
  if (occurrences !== 1) {
    throw new Error('ancre non unique (' + occurrences + ' fois) : ' + avant);
  }
  return texte.replace(avant, apres);
};

// --- 0. contrôle : le harnais est vert sur une copie intacte -----------------
const copieIntacte = copierApp('intact');
const vert = lancerHarnais(copieIntacte);
check(
  'contrôle : le harnais est VERT sur une copie intacte (RC 0)',
  vert.code === 0 && /TOUT PASS/.test(vert.sortie),
  'RC ' + vert.code + ' | ' + vert.sortie.slice(-160).replace(/\n/g, ' ')
);

// --- 1..N : chaque sabotage doit rendre le harnais ROUGE, nommément ----------
const SABOTAGES = [
  {
    nom: 'le masque est supprimé : la valeur reçue revient en clair',
    fichier: 'src/index.js',
    avant: "  return s.slice(0, 1) + '***';",
    apres: '  return s;',
    attendu: 'ROUGE-06',
  },
  {
    nom: 'le balayage du corps est désactivé : une donnée du site qui porte le nom fuit',
    fichier: 'src/index.js',
    avant: '      s = s.replace(new RegExp(echapperRegExp(r.valeur), \'gi\'), () => r.masque);',
    apres: '      s = s;',
    attendu: 'SCAN-01',
  },
  {
    nom: 'les champs absents sont inventés : la section privacy en annonce toujours deux',
    fichier: 'src/index.js',
    avant: '  const recus = Object.keys(pvRecus || {});',
    apres: '  const recus = Object.keys(CHAMPS_PV);',
    attendu: 'VERT-02',
  },
  {
    nom: 'la collecte est désactivée : le payload de la page est ignoré au lieu d\'être masqué',
    fichier: 'src/index.js',
    avant: '  ajouter(corpsRequete(requete.body));',
    apres: '  // sabotage : le corps de la requête n\'est plus collecté',
    attendu: 'ROUGE-05',
  },
  {
    nom: 'la phrase affichée redevient plus forte que le code : elle affirme ne jamais rendre un nom en clair',
    fichier: 'src/index.js',
    avant:
      'A name or e-mail address that it receives in the request is returned as a mask, never in clear text.',
    apres:
      'A name or e-mail address that it receives in the request is returned as a mask, never in clear text. The app never returns a name or e-mail address in clear text.',
    attendu: 'ROUGE-08b',
  },
  {
    nom: 'le contenu du site est masqué : la phrase dit qu\'il est renvoyé tel quel',
    fichier: 'src/index.js',
    avant: '      id: f.id,\n      name: f.name,',
    apres: "      id: f.id,\n      name: '***',",
    attendu: 'SCAN-09',
  },
  {
    nom: 'la gâche d\'identité est supprimée : un appel sans compte connecté est accepté',
    fichier: 'src/resolvers.js',
    avant: '  return principal.accountId || context.accountId || null;',
    apres: "  return 'acc-quelconque';",
    attendu: 'GATE-01',
  },
  {
    nom: 'le resolver n\'appelle plus le moteur (panneau figé) en mode démo',
    fichier: 'src/resolvers.js',
    avant: '  const report = moteur.rapportDemo({ pvRecus });',
    apres:
      "  const report = { constats: [], findings: [], privacy: { receivedFields: [], maskedValues: {}, statement: '' } };",
    attendu: 'ROUGE-09',
  },
  {
    nom: 'le resolver n\'appelle plus le moteur (panneau figé) en mode scan',
    fichier: 'src/resolvers.js',
    avant: '  const report = await moteur.lancerScan({ pvRecus });',
    apres:
      "  const report = { findings: [], privacy: { receivedFields: [], maskedValues: {}, statement: '' } };",
    attendu: 'SCAN-03',
  },
];

for (const test of SABOTAGES) {
  const dossier = copierApp('sabotage');
  const cheminFichier = path.join(dossier, test.fichier);
  const source = fs.readFileSync(cheminFichier, 'utf8');
  let patched = null;
  let erreur = null;
  try {
    patched = sabotage(source, test.avant, test.apres);
  } catch (e) {
    erreur = e.message;
  }
  if (erreur) {
    check(test.nom + ' : sabotage applicable', false, erreur);
    continue;
  }
  fs.writeFileSync(cheminFichier, patched);
  const res = lancerHarnais(dossier);
  const sortie = res.sortie;
  // Le contrôle cassé doit être nommé SUR UNE LIGNE « FAIL » : le simple fait
  // que son étiquette aparaisse quelque part (y compris sur une ligne PASS)
  // ne prouverait rien.
  const mentionne = new RegExp('^FAIL\\s+' + test.attendu + '\\b', 'm').test(sortie);
  const aEchoue = /ÉCHEC\(S\)/.test(sortie);
  const aCrash = /a levé une exception|Error:|TypeError:|ReferenceError:|SyntaxError:/.test(sortie);
  check(
    test.nom + ' : le harnais devient ROUGE',
    res.code === 1 && aEchoue,
    'RC ' + res.code
  );
  check(
    test.nom + ' : le harnais nomme le contrôle cassé (' + test.attendu + ')',
    mentionne,
    mentionne ? '' : sortie.slice(-400)
  );
  check(
    test.nom + ' : le harnais a ÉCHOUÉ, il n\'a pas crashé',
    !aCrash,
    aCrash ? sortie.slice(-400) : ''
  );
}

console.log('');
if (failures === 0) {
  console.log(
    '== TOUT PASS (' + checks + ' contrôles) : le harnais est rouge quand le contrat est cassé =='
  );
  process.exit(0);
}
console.log('== ' + failures + ' ÉCHEC(S) sur ' + checks + ' contrôles ==');
process.exit(1);
