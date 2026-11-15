/**
 * Test hors ligne du mode DÉMO — « Portal Accessibility Checker for JSM ».
 *
 * Ce test ne vérifie pas que le portail est en faute : il vérifie que le
 * MOTEUR DE RÈGLES détecte les 23 fautives documentées (contrat de test du
 * slot 1) et ne produit AUCUN faux positif sur les 6 contrôles négatifs.
 *
 * Il utilise les fonctions RÉELLES (src/regles.js + src/demo.js), aucune
 * copie recopiée, et le contrat PARSÉ depuis docs/README-demo.md
 * (src/demo/contrat.json, produit par scripts/generer-contrat.js).
 *
 * Usage : node test-demo.js
 * Sortie : une ligne PASS/FAIL par contrôle, puis un verdict. RC 0 = tout
 * passe, RC 1 = au moins un contrôle échoue.
 */
const path = require('path');
const demo = require(path.join(__dirname, 'src', 'demo.js'));
const regles = require(path.join(__dirname, 'src', 'regles.js'));

let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

const constats = demo.constats();
const verdict = demo.verdict();
const contrat = demo.CONTRAT;

// --- 0. le contrat de test est bien celui du slot 1 -------------------------
check(
  'contract parsed from docs/README-demo.md: 23 seeded issues + 6 negative checks',
  contrat.demo.length === 23 && contrat.sante.length === 6,
  contrat.demo.length + ' / ' + contrat.sante.length
);
check(
  'md5 of the slot 1 index recorded in the contract',
  contrat._source.md5_index === 'da30b9b25c69f9ad9bdbc5c0fb851552',
  contrat._source.md5_index
);

// --- 1. chaque faute DEMO-xx doit être détectée, au bon chemin et au bon
//        critère (le moteur ne connaît pas les identifiants DEMO : il produit
//        un chemin JSON, le test le rapproche du contrat) --------------------
for (const entree of contrat.demo) {
  const trouves = constats.filter(
    (c) =>
      c.fichier === entree.fichier &&
      c.emplacement === entree.chemin &&
      c.critere === entree.critere
  );
  check(
    entree.id + ' detected (' + entree.critere + ' @ ' + entree.chemin + ')',
    trouves.length === 1,
    trouves.length === 0 ? 'no finding' : trouves.length + ' finding(s)'
  );
}

// --- 2. les 6 contrôles négatifs SANTÉ-xx ne doivent produire AUCUN constat
//        (le contrôle est fait sur le NŒUD, pas seulement sur la feuille) ---
for (const controle of contrat.sante) {
  const surNoeud = constats.filter(
    (c) =>
      c.fichier === controle.fichier &&
      (c.emplacement === controle.noeud ||
        c.emplacement.startsWith(controle.noeud + '.') ||
        c.emplacement.startsWith(controle.noeud + '['))
  );
  check(
    controle.id + ' : no false positive on ' + controle.noeud,
    surNoeud.length === 0,
    surNoeud.length === 0 ? '' : surNoeud.map((c) => c.critere + '@' + c.emplacement).join(', ')
  );
}

// --- 3. aucun constat en dehors du contrat (le rapport ne doit rien inventer)
check(
  'no finding outside the contract',
  verdict.constats_hors_contrat.length === 0,
  verdict.constats_hors_contrat.join(' | ')
);
check('total number of findings = 23', constats.length === 23, String(constats.length));
check(
  'every finding carries its contract identifier (proof)',
  constats.every((c) => typeof c.preuve === 'string' && c.preuve.startsWith('DEMO-'))
);

// --- 4. couverture des 13 critères de la fiche -------------------------------
const rapport = regles.rapportParCritere(constats);
check(
  'the 13 criteria of the sheet are implemented',
  Object.keys(regles.CRITERES).length === 13,
  String(Object.keys(regles.CRITERES).length)
);
const restVerifiables = Object.keys(regles.CRITERES).filter(
  (c) => regles.CRITERES[c].confiance === 'REST-verifiable'
);
check(
  'the 7 "REST-verifiable" criteria are the ones from the sheet',
  restVerifiables.length === 7 &&
    ['1.1.1', '1.3.1', '2.4.4', '3.3.2', '4.1.2', '2.4.2', '3.2.6'].every((c) =>
      restVerifiables.includes(c)
    ),
  restVerifiables.join(', ')
);
for (const critere of restVerifiables) {
  const ligne = rapport.criteres.find((l) => l.critere === critere);
  check(
    'REST-verifiable criterion ' + critere + ' : at least one finding',
    ligne.constats > 0,
    ligne.constats + ' finding(s)'
  );
}
const partiels = Object.keys(regles.CRITERES).filter(
  (c) => regles.CRITERES[c].confiance === 'content only (partial)'
);
check(
  'the 6 "content only (partial)" criteria are the ones from the sheet',
  partiels.length === 6 &&
    ['1.4.1', '1.4.3', '1.2.2', '2.4.6', '1.3.5', '1.3.3'].every((c) => partiels.includes(c)),
  partiels.join(', ')
);

// --- 5. le rapport distingue «.constat prouvé » et « constat à vérifier » ----
const prv = constats.filter((c) => c.a_verifier === false).length;
const aver = constats.filter((c) => c.a_verifier === true).length;
check('14 proven findings (a_verifier = false)', prv === 14, String(prv));
check('9 findings to verify (a_verifier = true)', aver === 9, String(aver));
check(
  'no "to verify" finding on a "REST-verifiable" criterion… except 3.3.2 (instruction) and 3.2.6 (help position)',
  constats
    .filter((c) => c.a_verifier === true)
    .every((c) => ['1.4.1', '1.4.3', '1.2.2', '2.4.6', '1.3.5', '1.3.3', '3.3.2', '3.2.6'].includes(c.critere)),
  constats.filter((c) => c.a_verifier === true).map((c) => c.critere).join(',')
);

// --- 6. les ratios de contraste sont recalculés, pas recopiés --------------
const ratio = (hexa) => regles._utilitaires.ratioContraste(regles._utilitaires.hexRgb(hexa), [255, 255, 255]);
check('#f2c200 on white = 1.68:1 (sheet §10)', Math.abs(ratio('#f2c200') - 1.68) <= 0.01, ratio('#f2c200').toFixed(2));
check('#c62828 on white = 5.62:1 (sheet §10)', Math.abs(ratio('#c62828') - 5.62) <= 0.01, ratio('#c62828').toFixed(2));
check('#b71c1c on white = 6.57:1 (sheet §10)', Math.abs(ratio('#b71c1c') - 6.57) <= 0.01, ratio('#b71c1c').toFixed(2));
const constatsContraste = constats.filter((c) => c.critere === '1.4.3');
check(
  'a single contrast finding (1.4.3): #c62828 and #b71c1c pass the threshold',
  constatsContraste.length === 1 && constatsContraste[0].valeur === '#f2c200',
  constatsContraste.map((c) => c.valeur).join(',')
);

// --- 7. l'export CSV est exploitable ----------------------------------------
const csv = demo.csv();
const lignesCsv = csv.trim().split('\r\n');
check('CSV: one header line + 23 finding lines', lignesCsv.length === 24, String(lignesCsv.length));
check(
  'CSV: header with the 9 expected columns',
  lignesCsv[0] === '"criterion","level","confidence","source","resource","location","value","message","to_verify"',
  lignesCsv[0]
);
check('CSV: terminated by a newline', csv.endsWith('\r\n'));

// --- 8. garde-fou : le moteur ne doit PAS connaître le contrat de test -----
// (sinon le test ne prouverait rien : il validerait une copie, pas une règle)
const fs = require('fs');
const sourceRegles = fs.readFileSync(path.join(__dirname, 'src', 'regles.js'), 'utf8');
check(
  'the rules engine contains no DEMO-/SANTÉ- identifier',
  !/DEMO-\d|SANTÉ-/.test(sourceRegles)
);

// --- verdict ----------------------------------------------------------------
console.log('');
if (failures === 0) {
  console.log('== ALL PASS (' + checks + ' checks): 23/23 seeded issues detected, 0 false positives ==');
  process.exit(0);
}
console.log('== ' + failures + ' FAILURE(S) on ' + checks + ' checks ==');
process.exit(1);
