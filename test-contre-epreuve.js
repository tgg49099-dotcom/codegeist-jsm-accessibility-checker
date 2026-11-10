/**
 * Contre-épreuve du harnais de test du mode démo.
 *
 * Un harnais qui dit « 55 contrôles PASS » ne prouve rien tant qu'on n'a pas
 * montré qu'il devient ROUGE quand la règle est cassée. Ce script :
 *   1. rejoue le harnais sur une copie INTACTE de l'app (contrôle : il doit
 *      être vert) ;
 *   2. casse une règle à la fois, sur une copie, et exige que le harnais
 *      devient ROUGE, qu'il nomme le contrôle cassé, et qu'il n'ait pas
 *      simplement CRASHÉ (un crash ne distingue pas « détecté » de « cassé »).
 *
 * Usage : node test-contre-epreuve.js
 * RC 0 = les 4 contre-épreuves sont concluantes, RC 1 = au moins une ne l'est pas.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const APP = __dirname;
let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

/** Copie l'app (sans node_modules) dans un dossier temporaire. */
function copierApp(suffixe) {
  const cible = fs.mkdtempSync(path.join(os.tmpdir(), 'pac-demo-' + suffixe + '-'));
  fs.mkdirSync(path.join(cible, 'src'), { recursive: true });
  fs.mkdirSync(path.join(cible, 'src', 'demo'), { recursive: true });
  fs.mkdirSync(path.join(cible, 'scripts'), { recursive: true });
  fs.cpSync(path.join(APP, 'src', 'demo.js'), path.join(cible, 'src', 'demo.js'));
  fs.cpSync(path.join(APP, 'src', 'regles.js'), path.join(cible, 'src', 'regles.js'));
  fs.cpSync(path.join(APP, 'src', 'demo'), path.join(cible, 'src', 'demo'), { recursive: true });
  fs.cpSync(path.join(APP, 'test-demo.js'), path.join(cible, 'test-demo.js'));
  return cible;
}

/** Exécute le harnais dans un dossier et renvoie {code, sortie}. */
function lancerHarnais(dossier) {
  const res = spawnSync(process.execPath, [path.join(dossier, 'test-demo.js')], {
    cwd: dossier,
    encoding: 'utf8',
  });
  return { code: res.status, sortie: (res.stdout || '') + (res.stderr || '') };
}

/**
 * Supprime le dossier temporaire du harnais.
 *
 * SANS CETTE SUPPRESSION, chaque passage de la suite laisse un dossier dans
 * /tmp. Or /tmp est un tmpfs de 256 Mo : apres quelques dizaines de passages
 * (mesuré le 10/11/2026 : /tmp était à 100 %, 720 dossiers de sabotage
 * accumulés), la suite crasherait sur « ENOSPC: no space left on device ».
 */
function nettoyer(dossier) {
  try {
    fs.rmSync(dossier, { recursive: true, force: true });
  } catch (e) {
    console.log('AVERTISSEMENT : le dossier temporaire n a pas pu etre supprime : ' + e.message);
  }
}

/** Remplace une chaîne unique et vérifie qu'elle n'était présente qu'une fois. */
const sabotage = (texte, avant, apres) => {
  const occurrences = texte.split(avant).length - 1;
  if (occurrences !== 1) {
    throw new Error('ancre non unique (' + occurrences + ' fois) : ' + avant);
  }
  return texte.replace(avant, apres);
};

// --- 0. contrôle : le harnais est vert sur une copie intacte ----------------
const copieIntacte = copierApp('intact');
const vert = lancerHarnais(copieIntacte);
nettoyer(copieIntacte);
check(
  'contrôle : le harnais est VERT sur une copie intacte (RC 0)',
  vert.code === 0,
  'RC ' + vert.code
);

// --- 1..N : chaque sabotage doit rendre le harnais ROUGE, nommément ----------
const SABOTAGES = [
  {
    nom: 'seuil de contraste neutralisé (1.4.3 ne se déclenche plus)',
    fichier: 'src/regles.js',
    avant: 'const SEUIL_CONTRASTE_NORMAL = 4.5;',
    apres: 'const SEUIL_CONTRASTE_NORMAL = 0.1;',
    attendu: 'DEMO-26',
  },
  {
    nom: 'texte alternatif : la clé absente n\'est plus détectée (1.1.1)',
    fichier: 'src/regles.js',
    avant: "if (!('alt' in attrs)) {",
    apres: 'if (false) {',
    attendu: 'DEMO-01',
  },
  {
    nom: 'aide inconsistente : la comparaison des types de demande est coupée (3.2.6)',
    fichier: 'src/regles.js',
    avant: 'if (avecAide.length > 0 && sansAide.length > 0) {',
    apres: 'if (false) {',
    attendu: 'DEMO-40',
  },
  {
    nom: 'toute image est signalée : faux positif sur le contrôle négatif SANTÉ-01',
    fichier: 'src/regles.js',
    avant: "if (!('alt' in attrs)) {",
    apres: 'if (true) {',
    attendu: 'SANTÉ-01',
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
    nettoyer(dossier);
    continue;
  }
  fs.writeFileSync(cheminFichier, patched);
  const res = lancerHarnais(dossier);
  nettoyer(dossier);
  const sortie = res.sortie;
  // Le contrôle cassé doit être nommé SUR UNE LIGNE « FAIL » : le simple fait
  // que son étiquette apparaisse quelque part (y compris sur une ligne PASS)
  // ne prouverait rien.
  const mentionne = new RegExp('^FAIL\\s+' + test.attendu + '\\b', 'm').test(sortie);
  const aEchoue = /ÉCHEC\(S\)/.test(sortie);
  const aCrash = /\n\s+at\s|Error:|TypeError:|ReferenceError:/.test(sortie);
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
  console.log('== TOUT PASS (' + checks + ' contrôles) : le harnais est rouge quand la règle est cassée ==');
  process.exit(0);
}
console.log('== ' + failures + ' ÉCHEC(S) sur ' + checks + ' contrôles ==');
process.exit(1);
