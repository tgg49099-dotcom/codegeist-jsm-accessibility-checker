/**
 * Test hors ligne des règles du scanner — utilise les fonctions RÉELLES de
 * src/index.js (aucune copie recopiée) contre les données réelles du site
 * (fetchées ce jour) et un sabotage simulé.
 * Usage : node test-rules.js /tmp/fields.json /tmp/issues.json
 */
const fs = require('fs');
const { _rules } = require('./src/index.js');
const { isInternalLabel, isAmbiguousWithoutInstructions, isSummaryTooShort } = _rules;

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + ' -> ' + JSON.stringify(actual));
}

const fields = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const issues = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const custom = fields.filter((f) => f.custom === true);

console.log('== R1 2.4.6 : étiquettes internes (attendu sur ces données FR : uniquement "development") ==');
for (const f of custom) {
  check(f.id + ' ' + JSON.stringify(f.name), isInternalLabel(f.name).hit, f.name === 'development');
}

console.log('== R2 3.3.2 : saisie ambiguë sans instruction (attendu : 10015 date + 10017 couleur) ==');
for (const f of custom) {
  const t = (f.schema || {}).type || '';
  const c = (f.schema || {}).custom || '';
  if (t === 'date' || t === 'datetime' || c.endsWith(':jsw-issue-color')) {
    check(
      f.id + ' ' + JSON.stringify(f.name),
      isAmbiguousWithoutInstructions(f),
      ['customfield_10015', 'customfield_10017'].includes(f.id)
    );
  }
}
check(
  "un champ texte normal avec description vide n'est pas signalé",
  isAmbiguousWithoutInstructions({ schema: { type: 'string', custom: 'x:textfield' }, description: '' }),
  false
);

console.log('== R3 2.4.2 : résumés trop courts (attendu : uniquement KAN-4 "T") ==');
for (const i of issues.issues) {
  const short = typeof i.fields.summary !== 'string' || i.fields.summary.trim().length < 4;
  if (short) check(i.key + ' ' + JSON.stringify(i.fields.summary), isSummaryTooShort(i.fields.summary), true);
}
check("un résumé normal n'est pas signalé", isSummaryTooShort('Invoice reconciliation for the September billing batch'), false);

console.log('== sabotage simulé (contre-épreuve hors ligne de la branche identifiant numérique) ==');
check('étiquette cassée "n-a11y-10042" signalée', isInternalLabel('n-a11y-10042').hit, true);
check('étiquette propre "Note de test accessibilité" non signalée', isInternalLabel('Note de test accessibilité').hit, false);
check('étiquette vide non signalée (règle sans faux positif trivial)', isInternalLabel('').hit, false);

console.log(failures === 0 ? '== TOUT PASS ==' : '== ' + failures + ' ÉCHEC(S) ==');
process.exit(failures === 0 ? 0 : 1);
