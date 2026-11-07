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
  'contrat parsé depuis docs/README-demo.md : 23 fautives + 6 contrôles négatifs',
  contrat.demo.length === 23 && contrat.sante.length === 6,
  contrat.demo.length + ' / ' + contrat.sante.length
);
check(
  'md5 de l\'index du slot 1 enregistré dans le contrat',
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
    entree.id + ' détecté (' + entree.critere + ' @ ' + entree.chemin + ')',
    trouves.length === 1,
    trouves.length === 0 ? 'aucun constat' : trouves.length + ' constat(s)'
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
    controle.id + ' : aucun faux positif sur ' + controle.noeud,
    surNoeud.length === 0,
    surNoeud.length === 0 ? '' : surNoeud.map((c) => c.critere + '@' + c.emplacement).join(', ')
  );
}

// --- 3. aucun constat en dehors du contrat (le rapport ne doit rien inventer)
check(
  'aucun constat hors contrat',
  verdict.constats_hors_contrat.length === 0,
  verdict.constats_hors_contrat.join(' | ')
);
check('nombre total de constats = 23', constats.length === 23, String(constats.length));
check(
  'chaque constat porte son identifiant de contrat (preuve)',
  constats.every((c) => typeof c.preuve === 'string' && c.preuve.startsWith('DEMO-'))
);

// --- 4. couverture des 13 critères de la fiche -------------------------------
const rapport = regles.rapportParCritere(constats);
check(
  'les 13 critères de la fiche sont implémentés',
  Object.keys(regles.CRITERES).length === 13,
  String(Object.keys(regles.CRITERES).length)
);
const restVerifiables = Object.keys(regles.CRITERES).filter(
  (c) => regles.CRITERES[c].confiance === 'REST-verifiable'
);
check(
  'les 7 critères « REST vérifiable » sont ceux de la fiche',
  restVerifiables.length === 7 &&
    ['1.1.1', '1.3.1', '2.4.4', '3.3.2', '4.1.2', '2.4.2', '3.2.6'].every((c) =>
      restVerifiables.includes(c)
    ),
  restVerifiables.join(', ')
);
for (const critere of restVerifiables) {
  const ligne = rapport.criteres.find((l) => l.critere === critere);
  check(
    'critère REST vérifiable ' + critere + ' : au moins un constat',
    ligne.constats > 0,
    ligne.constats + ' constat(s)'
  );
}
const partiels = Object.keys(regles.CRITERES).filter(
  (c) => regles.CRITERES[c].confiance === 'content only (partial)'
);
check(
  'les 6 critères « contenu seulement (partiel) » sont ceux de la fiche',
  partiels.length === 6 &&
    ['1.4.1', '1.4.3', '1.2.2', '2.4.6', '1.3.5', '1.3.3'].every((c) => partiels.includes(c)),
  partiels.join(', ')
);

// --- 5. le rapport distingue «.constat prouvé » et « constat à vérifier » ----
const prv = constats.filter((c) => c.a_verifier === false).length;
const aver = constats.filter((c) => c.a_verifier === true).length;
check('14 constats prouvés (a_verifier = false)', prv === 14, String(prv));
check('9 constats à vérifier (a_verifier = true)', aver === 9, String(aver));
check(
  'aucun constat « à vérifier » sur un critère « REST vérifiable »… sauf 3.3.2 (instruction) et 3.2.6 (position de l\'aide)',
  constats
    .filter((c) => c.a_verifier === true)
    .every((c) => ['1.4.1', '1.4.3', '1.2.2', '2.4.6', '1.3.5', '1.3.3', '3.3.2', '3.2.6'].includes(c.critere)),
  constats.filter((c) => c.a_verifier === true).map((c) => c.critere).join(',')
);

// --- 6. les ratios de contraste sont recalculés, pas recopiés --------------
const ratio = (hexa) => regles._utilitaires.ratioContraste(regles._utilitaires.hexRgb(hexa), [255, 255, 255]);
check('#f2c200 sur blanc = 1,68:1 (fiche §10)', Math.abs(ratio('#f2c200') - 1.68) <= 0.01, ratio('#f2c200').toFixed(2));
check('#c62828 sur blanc = 5,62:1 (fiche §10)', Math.abs(ratio('#c62828') - 5.62) <= 0.01, ratio('#c62828').toFixed(2));
check('#b71c1c sur blanc = 6,57:1 (fiche §10)', Math.abs(ratio('#b71c1c') - 6.57) <= 0.01, ratio('#b71c1c').toFixed(2));
const constatsContraste = constats.filter((c) => c.critere === '1.4.3');
check(
  'un seul constat de contraste (1.4.3) : #c62828 et #b71c1c passent le seuil',
  constatsContraste.length === 1 && constatsContraste[0].valeur === '#f2c200',
  constatsContraste.map((c) => c.valeur).join(',')
);

// --- 7. l'export CSV est exploitable ----------------------------------------
const csv = demo.csv();
const lignesCsv = csv.trim().split('\r\n');
check('CSV : une ligne d\'en-tête + 23 lignes de constats', lignesCsv.length === 24, String(lignesCsv.length));
check(
  'CSV : en-tête avec les 9 colonnes attendues',
  lignesCsv[0] === '"criterion","level","confidence","source","resource","location","value","message","to_verify"',
  lignesCsv[0]
);
check('CSV : terminé par un retour à la ligne', csv.endsWith('\r\n'));

// --- 8. garde-fou : le moteur ne doit PAS connaître le contrat de test -----
// (sinon le test ne prouverait rien : il validerait une copie, pas une règle)
const fs = require('fs');
const sourceRegles = fs.readFileSync(path.join(__dirname, 'src', 'regles.js'), 'utf8');
check(
  'le moteur de règles ne contient aucun identifiant DEMO-/SANTÉ-',
  !/DEMO-\d|SANTÉ-/.test(sourceRegles)
);

// --- verdict ----------------------------------------------------------------
console.log('');
if (failures === 0) {
  console.log('== TOUT PASS (' + checks + ' contrôles) : 23/23 fautives détectées, 0 faux positif ==');
  process.exit(0);
}
console.log('== ' + failures + ' ÉCHEC(S) sur ' + checks + ' contrôles ==');
process.exit(1);
