/**
 * Offline test of the DEMO mode — "Portal Accessibility Checker for JSM".
 *
 * This test does not check that the portal is at fault: it checks that the
 * RULES ENGINE detects the 24 documented issues (slot 1 test contract,
 * updated 23/11/2026: 1.3.5 now targets personal-data fields) and produces
 * NO false positive on the 5 negative checks.
 *
 * It uses the REAL functions (src/regles.js + src/demo.js), no hand-copied
 * copy, and the contract PARSED from docs/README-demo.md
 * (src/demo/contrat.json, produced by scripts/generer-contrat.js).
 *
 * Usage: node test-demo.js
 * Output: one PASS/FAIL line per check, then a verdict. RC 0 = everything
 * passes, RC 1 = at least one check fails.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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

// --- 0. the test contract is indeed the one from slot 1 ---------------------
check(
  'contract parsed from docs/README-demo.md: 24 seeded issues + 5 negative checks',
  contrat.demo.length === 24 && contrat.sante.length === 5,
  contrat.demo.length + ' / ' + contrat.sante.length
);
// The contract claims to be the PARSE of docs/README-demo.md: its md5 must be
// the md5 of that file, read now (23/11/2026). A hard-coded constant would
// only say what the file was on the day it was written.
const md5Index = crypto
  .createHash('md5')
  .update(fs.readFileSync(path.join(__dirname, 'docs', 'README-demo.md')))
  .digest('hex');
check(
  'the md5 of the index recorded in the contract is the md5 of the index on disk',
  contrat._source.md5_index === md5Index,
  contrat._source.md5_index + ' != ' + md5Index
);
const md5Criteres = crypto
  .createHash('md5')
  .update(fs.readFileSync(path.join(__dirname, 'docs', 'CRITERES-WCAG-2.2-AA.md')))
  .digest('hex');
check(
  'the md5 of the criteria sheet recorded in the contract is the md5 of the sheet on disk',
  contrat._source.md5_criteres === md5Criteres,
  contrat._source.md5_criteres + ' != ' + md5Criteres
);

// --- 1. every DEMO-xx issue must be detected, at the right path and the
//        right criterion (the engine does not know the DEMO identifiers: it
//        produces a JSON path, the test matches it with the contract) --------
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

// --- 2. the 5 negative checks SANTÉ-xx must produce NO finding
//        (the check is made on the NODE, not only on the leaf) ---
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

// --- 3. no finding outside the contract (the report must invent nothing)
check(
  'no finding outside the contract',
  verdict.constats_hors_contrat.length === 0,
  verdict.constats_hors_contrat.join(' | ')
);
check('total number of findings = 24', constats.length === 24, String(constats.length));
check(
  'every finding carries its contract identifier (proof)',
  constats.every((c) => typeof c.preuve === 'string' && c.preuve.startsWith('DEMO-'))
);

// --- 4. coverage of the 13 criteria of the sheet -----------------------------
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

// --- 5. the report tells a "proven finding" from a "finding to verify" -------
const prv = constats.filter((c) => c.a_verifier === false).length;
const aver = constats.filter((c) => c.a_verifier === true).length;
check('14 proven findings (a_verifier = false)', prv === 14, String(prv));
check('10 findings to verify (a_verifier = true)', aver === 10, String(aver));
check(
  'no "to verify" finding on a "REST-verifiable" criterion… except 3.3.2 (instruction) and 3.2.6 (help position)',
  constats
    .filter((c) => c.a_verifier === true)
    .every((c) => ['1.4.1', '1.4.3', '1.2.2', '2.4.6', '1.3.5', '1.3.3', '3.3.2', '3.2.6'].includes(c.critere)),
  constats.filter((c) => c.a_verifier === true).map((c) => c.critere).join(',')
);

// --- 6. the contrast ratios are recomputed, not copied ---------------------
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
// the limits of the demo report must not contradict the engine: it DOES
// report a 1.4.3 finding (23/11/2026 review, minor 4)
const limitesDemo = (demo.rapport(new Date().toISOString()).limites || []).join(' ');
check(
  'the demo limits do not say that the app does not rule on the contrast',
  !/contrast, reading order \/ focus order and visible labels are not checkable/.test(limitesDemo),
  limitesDemo.slice(0, 160)
);
check(
  'the demo limits say the contrast ratio is computed under an assumption',
  /white-background assumption/.test(limitesDemo),
  limitesDemo.slice(0, 160)
);

// --- 7. the CSV export is usable --------------------------------------------
const csv = demo.csv();
const lignesCsv = csv.trim().split('\r\n');
check('CSV: one header line + 24 finding lines', lignesCsv.length === 25, String(lignesCsv.length));
check(
  'CSV: header with the 9 expected columns',
  lignesCsv[0] === '"criterion","level","confidence","source","resource","location","value","message","to_verify"',
  lignesCsv[0]
);
check('CSV: terminated by a newline', csv.endsWith('\r\n'));

// --- 8. safeguard: the engine must NOT know the test contract --------------
// (otherwise the test would prove nothing: it would validate a copy, not a rule)
// (`fs` is required at the top of this file)
const sourceRegles = fs.readFileSync(path.join(__dirname, 'src', 'regles.js'), 'utf8');
check(
  'the rules engine contains no DEMO-/SANTÉ- identifier',
  !/DEMO-\d|SANTÉ-/.test(sourceRegles)
);

// --- verdict ----------------------------------------------------------------
console.log('');
if (failures === 0) {
  console.log('== ALL PASS (' + checks + ' checks): 24/24 seeded issues detected, 0 false positives ==');
  process.exit(0);
}
console.log('== ' + failures + ' FAILURE(S) on ' + checks + ' checks ==');
process.exit(1);
