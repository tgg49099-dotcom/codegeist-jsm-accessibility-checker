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
    console.log('WARNING: the temporary folder could not be deleted: ' + e.message);
  }
}

/** Remplace une chaîne unique et vérifie qu'elle n'était présente qu'une fois. */
const sabotage = (texte, avant, apres) => {
  const occurrences = texte.split(avant).length - 1;
  if (occurrences !== 1) {
    throw new Error('non-unique anchor (' + occurrences + ' times): ' + avant);
  }
  return texte.replace(avant, apres);
};

// --- 0. contrôle : le harnais est vert sur une copie intacte ----------------
const copieIntacte = copierApp('intact');
const vert = lancerHarnais(copieIntacte);
nettoyer(copieIntacte);
check(
  'control: the harness is GREEN on an intact copy (exit code 0)',
  vert.code === 0,
  'exit code ' + vert.code
);

// --- 1..N : chaque sabotage doit rendre le harnais ROUGE, nommément ----------
const SABOTAGES = [
  {
    nom: 'contrast threshold neutralized (1.4.3 no longer triggers)',
    fichier: 'src/regles.js',
    avant: 'const SEUIL_CONTRASTE_NORMAL = 4.5;',
    apres: 'const SEUIL_CONTRASTE_NORMAL = 0.1;',
    attendu: 'DEMO-26',
  },
  {
    nom: 'alt text: the missing key is no longer detected (1.1.1)',
    fichier: 'src/regles.js',
    avant: "if (!('alt' in attrs)) {",
    apres: 'if (false) {',
    attendu: 'DEMO-01',
  },
  {
    nom: 'inconsistent help: the comparison of request types is cut off (3.2.6)',
    fichier: 'src/regles.js',
    avant: 'if (avecAide.length > 0 && sansAide.length > 0) {',
    apres: 'if (false) {',
    attendu: 'DEMO-40',
  },
  {
    nom: 'every image is flagged: false positive on the negative check SANTÉ-01',
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
    check(test.nom + ' : sabotage can be applied', false, erreur);
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
  const aEchoue = /FAILURE\(S\)/.test(sortie);
  const aCrash = /\n\s+at\s|Error:|TypeError:|ReferenceError:/.test(sortie);
  check(
    test.nom + ' : the harness turns RED',
    res.code === 1 && aEchoue,
    'exit code ' + res.code
  );
  check(
    test.nom + ' : the harness names the broken check (' + test.attendu + ')',
    mentionne,
    mentionne ? '' : sortie.slice(-400)
  );
  check(
    test.nom + ' : the harness FAILED, it did not crash',
    !aCrash,
    aCrash ? sortie.slice(-400) : ''
  );
}

console.log('');
if (failures === 0) {
  console.log('== ALL PASS (' + checks + ' checks): the harness turns RED when a rule is broken ==');
  process.exit(0);
}
console.log('== ' + failures + ' FAILURE(S) on ' + checks + ' checks ==');
process.exit(1);
