/**
 * Counter-proof of the demo mode test harness.
 *
 * A harness that says "56 checks PASS" proves nothing until we have shown
 * that it turns RED when the rule is broken. This script:
 *   1. replays the harness on an INTACT copy of the app (control: it must
 *      be green) ;
 *   2. breaks one rule at a time, on a copy, and requires that the harness
 *      turns RED, that it names the broken check, and that it has not
 *      simply CRASHED (a crash does not tell "detected" from "broken").
 *
 * Usage: node test-contre-epreuve.js
 * RC 0 = the 4 counter-proofs are conclusive, RC 1 = at least one is not.
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

/** Copies the app (without node_modules) into a temporary folder. */
function copierApp(suffixe) {
  const cible = fs.mkdtempSync(path.join(os.tmpdir(), 'pac-demo-' + suffixe + '-'));
  fs.mkdirSync(path.join(cible, 'src'), { recursive: true });
  fs.mkdirSync(path.join(cible, 'src', 'demo'), { recursive: true });
  fs.mkdirSync(path.join(cible, 'scripts'), { recursive: true });
  fs.cpSync(path.join(APP, 'src', 'demo.js'), path.join(cible, 'src', 'demo.js'));
  fs.cpSync(path.join(APP, 'src', 'regles.js'), path.join(cible, 'src', 'regles.js'));
  fs.cpSync(path.join(APP, 'src', 'demo'), path.join(cible, 'src', 'demo'), { recursive: true });
  // The harness reads the two sheets it checks the md5 of (23/11/2026):
  // without them the copy would crash on a missing file.
  fs.cpSync(path.join(APP, 'docs'), path.join(cible, 'docs'), { recursive: true });
  fs.cpSync(path.join(APP, 'test-demo.js'), path.join(cible, 'test-demo.js'));
  return cible;
}

/** Runs the harness in a folder and returns {code, sortie}. */
function lancerHarnais(dossier) {
  const res = spawnSync(process.execPath, [path.join(dossier, 'test-demo.js')], {
    cwd: dossier,
    encoding: 'utf8',
  });
  return { code: res.status, sortie: (res.stdout || '') + (res.stderr || '') };
}

/**
 * Deletes the harness temporary folder.
 *
 * WITHOUT THIS DELETION, each run of the suite leaves a folder in
 * /tmp. But /tmp is a 256 MB tmpfs: after a few dozen runs
 * (measured on 10/11/2026: /tmp was at 100 %, 720 sabotage folders
 * accumulated), the suite would crash on "ENOSPC: no space left on device".
 */
function nettoyer(dossier) {
  try {
    fs.rmSync(dossier, { recursive: true, force: true });
  } catch (e) {
    console.log('WARNING: the temporary folder could not be deleted: ' + e.message);
  }
}

/** Replaces a unique string and checks that it was present only once. */
const sabotage = (texte, avant, apres) => {
  const occurrences = texte.split(avant).length - 1;
  if (occurrences !== 1) {
    throw new Error('non-unique anchor (' + occurrences + ' times): ' + avant);
  }
  return texte.replace(avant, apres);
};

// --- 0. control: the harness is green on an intact copy ---------------------
const copieIntacte = copierApp('intact');
const vert = lancerHarnais(copieIntacte);
nettoyer(copieIntacte);
check(
  'control: the harness is GREEN on an intact copy (exit code 0)',
  vert.code === 0,
  'exit code ' + vert.code
);

// --- 1..N : each sabotage must turn the harness RED, by name -----------------
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
  // The broken check must be named ON A "FAIL" LINE: the mere fact
  // that its label appears somewhere (including on a PASS line)
  // would prove nothing.
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
