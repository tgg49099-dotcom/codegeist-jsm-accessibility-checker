/**
 * test-csv-cycle139.js — THE CSV EXPORT OF THE ADMINISTRATION PAGE, TESTED.
 *
 * The problem this test answers (jury review `e486`, 09/11/2026, "à corriger"
 * point 2): the CSV button was never exercised. `admin.jsx` used `document`,
 * `Blob` and a simulated link, and nobody could say what happened when the
 * button was clicked.
 *
 * WHAT IS TESTED, AND WHAT IS NOT
 *
 *   The download path is now a module of its own (`src/frontend/csv.js`) whose
 *   environment (`document`, `URL`, `setTimeout`) is INJECTED. That makes the
 *   whole path testable offline, against a stub document that records what
 *   the code does: the blob that was built, the link that was created, the
 *   click, the removal, the revocation of the object URL.
 *
 *   WHAT THIS TEST CANNOT PROVE: that the browser of the person clicking the
 *   button saves the file. That needs a real page and a real browser. This
 *   is why the page ALSO shows the same CSV in a read-only field that the
 *   user can select and copy — a path that needs no browser API at all — and
 *   why the button says so when the download is not possible.
 *
 * THE CHECKS
 *
 *   CSV-01  the download succeeds and returns { ok: true };
 *   CSV-02  the file offered is a Blob of type "text/csv;charset=utf-8" whose
 *           text is exactly the CSV of the resolver;
 *   CSV-03  the link carries the file name (`download`) and the object URL;
 *   CSV-04  the link is attached to the page, clicked once, then removed;
 *   CSV-05  the object URL is revoked afterwards (no leak);
 *   CSV-06  without a page (no `document`) the function REFUSES instead of
 *           throwing — the page can then point at the field;
 *   CSV-07  when the browser refuses (createElement throws) the function
 *           REFUSES instead of throwing, and leaves nothing behind;
 *   CSV-08  the same when the object URL itself cannot be created;
 *   CSV-09  the page no longer carries its own copy of the download code: it
 *           imports the tested module;
 *   CSV-10  the page shows the same CSV in a READ-ONLY field;
 *   CSV-11  the button still exists and calls the tested function;
 *   CSV-12  that field has an accessible name (aria-labelledby + an id).
 *
 * THE COUNTER-PROOFS (the suite must be able to say NO)
 *
 *   CP-1  a copy of the module whose link is never clicked → CSV-04 goes red;
 *   CP-2  a copy of the module that builds an EMPTY file → CSV-02 goes red;
 *   CP-3  a copy of the page whose field is not read-only → CSV-10 goes red.
 *
 * Usage:
 *   node test-csv-cycle139.js
 *
 * RC 0 = every check passes, RC 1 = at least one check fails.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const APP = __dirname;
const SRC = path.join(APP, 'src');
const FRONTEND = path.join(SRC, 'frontend');
const FICHIER_CSV = path.join(FRONTEND, 'csv.js');
const FICHIER_JSX = path.join(FRONTEND, 'admin.jsx');

let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  // The detail is only printed when the control FAILS: a "PASS" line must
  // never carry a sentence that describes a failure.
  console.log(
    (ok ? 'PASS' : 'FAIL') + '  ' + label + (!ok && detail ? '  ->  ' + detail : '')
  );
}

// ---------------------------------------------------------------------------
// 1. The stub page: it records what the code does with it
// ---------------------------------------------------------------------------

/**
 * A stub `document` / `URL` / `setTimeout`, and the journal of what happened.
 *
 * @param {object} options { createElementThrows, createObjectURLThrows }
 * @returns {{env: object, journal: object}}
 */
function pageStub(options) {
  const opts = options || {};
  const journal = {
    blobs: [],
    liens: [],
    ajoutes: [],
    retires: [],
    clics: 0,
    revoked: [],
    timeouts: 0,
    lancerTimeout: null,
  };

  const body = {
    appendChild(el) {
      journal.ajoutes.push(el);
    },
    removeChild(el) {
      journal.retires.push(el);
    },
  };

  const documentStub = {
    body: body,
    createElement(tag) {
      if (opts.createElementThrows) throw new Error('the page refused to create an element');
      const el = {
        tag: tag,
        href: '',
        download: '',
        rel: '',
        clicked: 0,
        click() {
          el.clicked += 1;
          journal.clics += 1;
        },
      };
      journal.liens.push(el);
      return el;
    },
  };

  const urlStub = {
    createObjectURL(blob) {
      if (opts.createObjectURLThrows) throw new Error('the browser refused to create the URL');
      journal.blobs.push(blob);
      return 'blob:stub/' + journal.blobs.length;
    },
    revokeObjectURL(url) {
      journal.revoked.push(url);
    },
  };

  const setTimeoutStub = (fn, ms) => {
    journal.timeouts += 1;
    journal.lancerTimeout = fn;
    return 1;
  };

  return {
    env: { document: documentStub, URL: urlStub, setTimeout: setTimeoutStub },
    journal: journal,
  };
}

const CSV_EXEMPLE =
  'critere,niveau,ou,message\r\n1.4.10,A,champ "Nom",Le nom du champ ne dit pas ce qu\'il faut\r\n';

// ---------------------------------------------------------------------------
// 2. The checks
// ---------------------------------------------------------------------------

/**
 * The checks that need the module (the download path).
 *
 * @param {object} moduleCsv the module under test
 * @returns {Promise<object>} label -> boolean
 */
async function controlesDuChemin(moduleCsv) {
  const res = {};

  // --- the nominal path ---------------------------------------------------
  const nominal = pageStub();
  const reponse = await moduleCsv.telechargerCsv('pac-jsm-findings.csv', CSV_EXEMPLE, nominal.env);

  res['CSV-01 the download succeeds'] = reponse && reponse.ok === true;
  res['CSV-02 the file offered is the CSV of the resolver'] =
    nominal.journal.blobs.length === 1 &&
    nominal.journal.blobs[0].type === 'text/csv;charset=utf-8' &&
    (await nominal.journal.blobs[0].text()) === CSV_EXEMPLE;
  res['CSV-03 the link carries the file name and the object URL'] =
    nominal.journal.liens.length === 1 &&
    nominal.journal.liens[0].tag === 'a' &&
    nominal.journal.liens[0].download === 'pac-jsm-findings.csv' &&
    nominal.journal.liens[0].href === 'blob:stub/1';
  res['CSV-04 the link is attached, clicked once, then removed'] =
    nominal.journal.ajoutes.length === 1 &&
    nominal.journal.ajoutes[0] === nominal.journal.liens[0] &&
    nominal.journal.clics === 1 &&
    nominal.journal.retires.length === 1 &&
    nominal.journal.retires[0] === nominal.journal.liens[0];
  res['CSV-05 the object URL is revoked afterwards'] =
    nominal.journal.timeouts === 1 &&
    nominal.journal.revoked.length === 0 &&
    (function () {
      if (!nominal.journal.lancerTimeout) return false;
      nominal.journal.lancerTimeout();
      return nominal.journal.revoked.length === 1 && nominal.journal.revoked[0] === 'blob:stub/1';
    })();

  // --- the refusals -------------------------------------------------------
  let sansPage = null;
  try {
    sansPage = await moduleCsv.telechargerCsv('pac-jsm-findings.csv', CSV_EXEMPLE, {
      document: null,
      URL: { createObjectURL: function () {}, revokeObjectURL: function () {} },
      setTimeout: null,
    });
  } catch (e) {
    sansPage = { ok: undefined, raison: 'threw: ' + e.message };
  }
  res['CSV-06 without a page, the function refuses instead of throwing'] =
    sansPage && sansPage.ok === false && typeof sansPage.raison === 'string' && sansPage.raison !== '';

  const pageCassée = pageStub({ createElementThrows: true });
  let refus = null;
  try {
    refus = await moduleCsv.telechargerCsv('pac-jsm-findings.csv', CSV_EXEMPLE, pageCassée.env);
  } catch (e) {
    refus = { ok: undefined, raison: 'threw: ' + e.message };
  }
  res['CSV-07 when the browser refuses, the function refuses instead of throwing'] =
    refus && refus.ok === false && refus.raison !== '' && pageCassée.journal.ajoutes.length === 0;

  const pageSansUrl = pageStub({ createObjectURLThrows: true });
  let refusUrl = null;
  try {
    refusUrl = await moduleCsv.telechargerCsv('pac-jsm-findings.csv', CSV_EXEMPLE, pageSansUrl.env);
  } catch (e) {
    refusUrl = { ok: undefined, raison: 'threw: ' + e.message };
  }
  res['CSV-08 when the object URL cannot be created, the function refuses instead of throwing'] =
    refusUrl && refusUrl.ok === false && refusUrl.raison !== '';

  return res;
}

/**
 * The checks that read the page (the interface).
 *
 * @param {string} jsx the source of admin.jsx
 * @returns {object} label -> boolean
 */
function controlesDeLaPage(jsx) {
  const res = {};
  const sansCommentaires = jsx
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''))
    .join('\n');

  res['CSV-09 the page imports the tested module and does not carry its own copy'] =
    /from\s+["']\.\/csv\.js["']/.test(jsx) &&
    /telechargerCsv/.test(jsx) &&
    !/document\.createElement/.test(sansCommentaires);

  res['CSV-10 the page shows the same CSV in a read-only field'] =
    /<TextArea/.test(jsx) &&
    /isReadOnly/.test(jsx) &&
    /result\.csv/.test(jsx);

  res['CSV-11 the button still exists and calls the tested function'] =
    /Download the findings as CSV/.test(jsx) &&
    /onClick=\{exporterCsv\}/.test(jsx);

  res['CSV-12 that field has an accessible name'] =
    /aria-labelledby="csv-copier-titre"/.test(jsx) &&
    /id="csv-copier-titre"/.test(jsx);

  return res;
}

// ---------------------------------------------------------------------------
// 3. The counter-proofs: the suite must be able to say NO
// ---------------------------------------------------------------------------

/**
 * Write a sabotaged copy next to the original (so that its `require` still
 * resolves), load it, and delete it.
 *
 * @param {string} nom the name of the temporary file
 * @param {function} mutation receives the source, returns the sabotaged one
 * @returns {object} the loaded module
 */
function avecSabotage(nom, mutation) {
  const source = fs.readFileSync(FICHIER_CSV, 'utf8');
  const sabotage = mutation(source);
  if (sabotage === source) throw new Error('the mutation changed nothing');
  const temporaire = path.join(FRONTEND, nom);
  fs.writeFileSync(temporaire, sabotage, 'utf8');
  try {
    delete require.cache[require.resolve(temporaire)];
    return require(temporaire);
  } finally {
    try {
      fs.unlinkSync(temporaire);
    } catch (e) {
      /* the file stays; the suite reports it */
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Execution
// ---------------------------------------------------------------------------

(async () => {
  console.log('== 1. THE DOWNLOAD PATH (src/frontend/csv.js) ==');
  const moduleCsv = require(FICHIER_CSV);
  const res = await controlesDuChemin(moduleCsv);
  Object.keys(res).forEach((k) => check(k, res[k]));

  console.log('');
  console.log('== 2. THE PAGE (src/frontend/admin.jsx) ==');
  const jsx = fs.readFileSync(FICHIER_JSX, 'utf8');
  const resPage = controlesDeLaPage(jsx);
  Object.keys(resPage).forEach((k) => check(k, resPage[k]));

  console.log('');
  console.log('== 3. THE COUNTER-PROOFS (the suite must be able to say NO) ==');

  // CP-1 : the link is never clicked -> the click must be detected.
  try {
    const sabotage = avecSabotage('csv.sabotage-cp1', (src) =>
      src.replace('    lien.click();', '    /* sabotaged: the link is never clicked */')
    );
    const rouge = await controlesDuChemin(sabotage);
    check(
      'CONTRE-PROOF CP-1 a link that is never clicked is detected (CSV-04 must go red)',
      rouge['CSV-04 the link is attached, clicked once, then removed'] === false,
      'the sabotaged copy still passes CSV-04: the check may be blind'
    );
  } catch (e) {
    check('CONTRE-PROOF CP-1 a link that is never clicked is detected', false, e.message);
  }

  // CP-2 : an empty file -> the content of the file must be detected.
  try {
    const sabotage = avecSabotage('csv.sabotage-cp2', (src) =>
      src.replace(
        'return new Blob([String(csv === undefined || csv === null ? "" : csv)], {',
        'return new Blob([""], {'
      )
    );
    const rouge = await controlesDuChemin(sabotage);
    check(
      'CONTRE-PROOF CP-2 an empty file is detected (CSV-02 must go red)',
      rouge['CSV-02 the file offered is the CSV of the resolver'] === false,
      'the sabotaged copy still passes CSV-02: the check may be blind'
    );
  } catch (e) {
    check('CONTRE-PROOF CP-2 an empty file is detected', false, e.message);
  }

  // CP-3 : a field that is not read-only -> the interface must be detected.
  try {
    const source = fs.readFileSync(FICHIER_JSX, 'utf8');
    const sabotage = source.replace('isReadOnly', 'isCompact');
    const rouge = controlesDeLaPage(sabotage);
    check(
      'CONTRE-PROOF CP-3 a field that is not read-only is detected (CSV-10 must go red)',
      rouge['CSV-10 the page shows the same CSV in a read-only field'] === false,
      'the sabotaged page still passes CSV-10: the check may be blind'
    );
  } catch (e) {
    check('CONTRE-PROOF CP-3 a field that is not read-only is detected', false, e.message);
  }

  console.log('');
  if (failures === 0) {
    console.log('== TOUT PASS (' + checks + ' checks) ==');
  } else {
    console.log('== ' + failures + ' FAILURE(S) out of ' + checks + ' checks ==');
  }
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(String((e && e.stack) || e));
  process.exit(1);
});
