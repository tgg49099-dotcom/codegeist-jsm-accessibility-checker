/**
 * csv.js — how the findings leave the administration page.
 *
 * TWO WAYS, BOTH BUILT ON THE SAME STRING
 *
 *   1. `telechargerCsv` — the download button. It is the usual web way: build
 *      a Blob, make an object URL, create a link with the `download`
 *      attribute, click it. The browser then saves the file.
 *   2. The CSV is ALSO written in a read-only text field on the page (see
 *      admin.jsx). Selecting that field and copying it needs no browser API
 *      at all: no Blob, no object URL, no synthetic click. If the download is
 *      refused by the page the user is looking at — or if the page does not
 *      give our code the web page at all — the field is the path that always
 *      works.
 *
 * WHY THE ENVIRONMENT IS INJECTED
 *
 *   The download needs `document`, `URL` and `setTimeout`. They are passed in
 *   as an argument instead of being taken from the global scope, so that the
 *   whole path can be exercised OFFLINE, against a stub document that records
 *   what the code does (test-csv-cycle139.js). That test is what tells us the
 *   button does its job; what it cannot tell us is whether the browser of the
 *   person clicking it saves the file — that needs a real page, and the
 *   interface says so in a visible message when the download is not possible.
 *
 * NOTHING LEAVES THE PAGE: the CSV is built by the resolver (same escaping
 * rules as the demo export) and stays in the browser.
 */

/**
 * The default environment: the browser's own objects, when they exist.
 *
 * @returns {{document: object|null, URL: object|null, setTimeout: function|null}}
 */
function environnementParDefaut() {
  return {
    document: typeof document !== "undefined" ? document : null,
    URL: typeof URL !== "undefined" ? URL : null,
    setTimeout: typeof setTimeout !== "undefined" ? setTimeout : null,
  };
}

/**
 * The CSV the download offers.
 *
 * @param {string} csv the CSV text, built by the resolver
 * @returns {Blob|null} the blob, or null when the platform has no Blob
 */
function blobCsv(csv, env) {
  const cible = env || environnementParDefaut();
  if (typeof Blob === "undefined") return null;
  return new Blob([String(csv === undefined || csv === null ? "" : csv)], {
    type: "text/csv;charset=utf-8",
  });
}

/**
 * The download itself.
 *
 * It NEVER throws: a failure is a returned object, so the page can say what
 * happened instead of showing an empty screen.
 *
 * @param {string} nomFichier the name of the file offered to the user
 * @param {string} csv       the CSV text
 * @param {object} [env]     { document, URL, setTimeout } — injected for the
 *                           offline test; the browser's own objects otherwise
 * @returns {{ok: boolean, raison: string, methode: string}}
 *          ok=false means "no download happened"; the page then points at the
 *          field where the CSV can be copied.
 */
function telechargerCsv(nomFichier, csv, env) {
  const cible = env || environnementParDefaut();

  if (!cible.document || !cible.URL) {
    return {
      ok: false,
      methode: "aucune",
      raison:
        "this page does not give the app access to the web page, so a file cannot be created here",
    };
  }

  const blob = blobCsv(csv, cible);
  if (!blob) {
    return {
      ok: false,
      methode: "aucune",
      raison: "this browser cannot build a file (no Blob)",
    };
  }

  let url = "";
  try {
    url = cible.URL.createObjectURL(blob);
  } catch (e) {
    return {
      ok: false,
      methode: "aucune",
      raison: "the browser refused to create the file: " + ((e && e.message) || String(e)),
    };
  }

  let lien = null;
  try {
    lien = cible.document.createElement("a");
    lien.href = url;
    lien.download = nomFichier;
    lien.rel = "noopener";
    cible.document.body.appendChild(lien);
    lien.click();
    cible.document.body.removeChild(lien);
  } catch (e) {
    if (lien && cible.document.body) {
      try {
        cible.document.body.removeChild(lien);
      } catch (e2) {
        /* the link was never attached */
      }
    }
    return {
      ok: false,
      methode: "aucune",
      raison: "the browser refused the download: " + ((e && e.message) || String(e)),
    };
  }

  if (cible.setTimeout) {
    cible.setTimeout(function () {
      try {
        cible.URL.revokeObjectURL(url);
      } catch (e) {
        /* the page may already be gone */
      }
    }, 2000);
  }

  return { ok: true, methode: "telechargement", raison: "" };
}

module.exports = { telechargerCsv, blobCsv, environnementParDefaut };
