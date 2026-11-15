/**
 * Offline test of the scanner rules — uses the REAL functions of
 * src/index.js (no copied duplicate) against the real site data
 * (fetched today) and a simulated sabotage.
 * Usage: node test-rules.js /tmp/fields.json /tmp/issues.json
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

console.log('== R1 2.4.6: internal labels (expected on this FR data: only "development") ==');
for (const f of custom) {
  check(f.id + ' ' + JSON.stringify(f.name), isInternalLabel(f.name).hit, f.name === 'development');
}

console.log('== R2 3.3.2: ambiguous input without instructions (expected: 10015 date + 10017 color) ==');
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
  "a normal text field with an empty description is not reported",
  isAmbiguousWithoutInstructions({ schema: { type: 'string', custom: 'x:textfield' }, description: '' }),
  false
);

console.log('== R3 2.4.2: summaries too short (expected: only KAN-4 "T") ==');
for (const i of issues.issues) {
  const short = typeof i.fields.summary !== 'string' || i.fields.summary.trim().length < 4;
  if (short) check(i.key + ' ' + JSON.stringify(i.fields.summary), isSummaryTooShort(i.fields.summary), true);
}
check("a normal summary is not reported", isSummaryTooShort('Invoice reconciliation for the September billing batch'), false);

console.log('== simulated sabotage (offline counter-proof of the numeric identifier branch) ==');
check('broken label "n-a11y-10042" reported', isInternalLabel('n-a11y-10042').hit, true);
check('clean label "Note de test accessibilité" not reported', isInternalLabel('Note de test accessibilité').hit, false);
check('empty label not reported (rule with no trivial false positive)', isInternalLabel('').hit, false);

console.log(failures === 0 ? '== ALL PASS ==' : '== ' + failures + ' FAILURE(S) ==');
process.exit(failures === 0 ? 0 : 1);
