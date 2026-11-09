/**
 * admin.jsx — the administration page of Portal Accessibility Checker for JSM.
 *
 * UI Kit 2 (@forge/react). ONE job: let a signed-in Jira administrator run
 * the accessibility scan and read its findings.
 *
 * The interface is the app's only entry point: the manifest declares one
 * `jira:adminPage` module and no public module, so there is no URL anybody
 * can call without an account. Jira renders this page in the administration
 * area, and the resolver behind it (src/resolvers.js) answers only a
 * signed-in Jira administrator — the check is made on the server, with the
 * caller's own identity.
 *
 * Rules followed here (Atlassian's own template instructions):
 *   - only components exported by @forge/react; no raw HTML tag (`<div>`,
 *     `<strong>`…) — a raw tag makes the platform replace the whole app with
 *     an error banner;
 *   - UI Kit 2 does not call our code: the bundle registers itself with
 *     ForgeReconciler.render(<App/>);
 *   - every message is in English: the judges install the app (contest rule
 *     l. 178) and the Marketplace listing is English too.
 */

import React, { useState } from "react";
import ForgeReconciler, {
  Button,
  ButtonGroup,
  DynamicTable,
  Heading,
  SectionMessage,
  Spinner,
  Text,
  TextArea,
  Textfield,
} from "@forge/react";
import { runScan, runDemoScan } from "./api.js";
import { telechargerCsv } from "./csv.js";

// UI Kit 2 reports a text change with an EVENT, not with the bare text. The
// offline harness used to send a bare string, and being liberal about it
// costs nothing.
function readValue(event) {
  if (typeof event === "string") return event;
  if (event && event.target && typeof event.target.value === "string") {
    return event.target.value;
  }
  return "";
}

// The findings of a report. A real scan calls them `findings`, the demo
// report calls them `constats` — same shape, same engine.
function findingsOf(report) {
  if (!report) return [];
  return report.findings || report.constats || [];
}

// The endpoints the scan read (a real scan) or the fixtures it used (demo).
function sourcesOf(report) {
  if (!report) return [];
  if (report.read) return Object.keys(report.read);
  if (report.sources && typeof report.sources === "object") {
    return Object.keys(report.sources);
  }
  return [];
}

// The CSV is produced by the RESOLVER (server side, same escaping rules as
// the demo export). It leaves the page two ways: the download button, and the
// read-only field that holds the same text — the field needs no browser API
// at all, so it works even where a download is refused. See src/frontend/csv.js.

function FindingsTable({ findings }) {
  if (!findings || findings.length === 0) {
    return (
      <SectionMessage appearance="success" title="No finding">
        <Text>
          The checks ran and found nothing to report on what they can read
          through the REST API.
        </Text>
      </SectionMessage>
    );
  }
  return (
    <DynamicTable
      caption="Findings"
      head={{
        cells: [
          { key: "critere", content: "Criterion" },
          { key: "niveau", content: "Level" },
          { key: "ou", content: "Where" },
          { key: "message", content: "Message" },
          { key: "revue", content: "Review" },
        ],
      }}
      rows={findings.map(function (f, i) {
        const ou = [f.ressource, f.emplacement].filter(Boolean).join(" — ");
        return {
          key: "finding-" + i,
          cells: [
            { key: "critere-" + i, content: f.critere || "" },
            { key: "niveau-" + i, content: f.niveau || "" },
            { key: "ou-" + i, content: ou },
            { key: "message-" + i, content: f.message || "" },
            {
              key: "revue-" + i,
              content: f.a_verifier === true ? "human review" : "automatic",
            },
          ],
        };
      })}
    />
  );
}

function AdminPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [csvMessage, setCsvMessage] = useState(null);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");

  async function lancer(mode) {
    setBusy(true);
    setError(null);
    setResult(null);
    // The two optional fields let a reader see the privacy behaviour: the
    // value is returned MASKED, never in clear text. An empty field is not
    // sent at all, so nothing is ever invented.
    const payload = {};
    if (nom.trim() !== "") payload.nom = nom.trim();
    if (email.trim() !== "") payload["e-mail"] = email.trim();
    try {
      const reponse =
        mode === "demo" ? await runDemoScan(payload) : await runScan(payload);
      if (!reponse || reponse.ok !== true) {
        setError(
          (reponse && reponse.error
            ? reponse.error + " — " + reponse.message
            : null) || "the resolver answered nothing"
        );
        return;
      }
      setResult(reponse);
    } catch (err) {
      setError((err && (err.message || err.name)) || String(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * The download of the CSV. It never throws: when the page does not allow
   * the download, the message says so and points at the field that always
   * holds the same text.
   */
  function exporterCsv() {
    const resultat = telechargerCsv(
      "pac-jsm-findings.csv",
      (result && result.csv) || ""
    );
    setCsvMessage(
      resultat.ok
        ? "The CSV was handed over to the browser. If no file was saved, select the CSV below and copy it."
        : "This page cannot save a file (" +
          resultat.raison +
          "). Select the CSV below and copy it."
    );
  }

  const report = result ? result.report : null;
  const findings = findingsOf(report);
  const aVerifier = findings.filter((f) => f.a_verifier === true).length;
  const sources = sourcesOf(report);
  const masked = report && report.privacy ? report.privacy.maskedValues : null;
  const recus = report && report.privacy ? report.privacy.receivedFields : [];
  // The identity section says WITH WHICH identity the site was read. When the
  // platform refused to read with the caller's own permissions, the scan read
  // NOTHING: that is not "a site without any accessibility problem", and it
  // must not be displayed as a successful scan with zero findings.
  const autorisation = report ? report.autorisation : null;
  const lectureRefusee = !!(autorisation && autorisation.ok === false);

  return (
    <>
      <Heading size="medium">Portal Accessibility Checker for JSM</Heading>

      <Text>
        Read-only accessibility scan of your Jira Service Management customer
        portal, read through the site&apos;s own REST API and checked against
        WCAG 2.2 AA.
      </Text>

      <SectionMessage appearance="information" title="What this app does">
        <Text>
          It reads only. It writes nothing on your site, calls no external
          service and stores nothing. The scan only runs for a signed-in Jira
          administrator: the server checks that the account holds the global
          "Administer Jira" permission, and refuses otherwise. The two fields
          below are a privacy demonstration — type a name or an e-mail and
          the answer shows the value masked, never in clear text. Checks that
          only exist in the rendered page (contrast, keyboard focus, target
          size) are reported as needing human review instead of being guessed.
        </Text>
      </SectionMessage>

      <Textfield
        label="Name (optional — try it: the value comes back masked)"
        placeholder="Camille Dupont"
        value={nom}
        onChange={(event) => setNom(readValue(event))}
      />
      <Textfield
        label="E-mail (optional — try it: the value comes back masked)"
        placeholder="camille.dupont@example.com"
        value={email}
        onChange={(event) => setEmail(readValue(event))}
      />

      <ButtonGroup>
        <Button
          appearance="primary"
          isDisabled={busy}
          onClick={() => lancer("scan")}
        >
          Run the scan
        </Button>
        <Button isDisabled={busy} onClick={() => lancer("demo")}>
          Run the demo scan (no site needed)
        </Button>
      </ButtonGroup>

      {busy ? (
        <>
          <Spinner />
          <Text>Reading the site…</Text>
        </>
      ) : null}

      {error ? (
        <SectionMessage appearance="error" title="The scan did not run">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      {result && report ? (
        <>
          {lectureRefusee ? (
            <SectionMessage
              appearance="error"
              title="The site was not read — nothing was scanned"
            >
              <Text>{autorisation.message}</Text>
            </SectionMessage>
          ) : null}

          {lectureRefusee ? null : (
            <SectionMessage
              appearance={findings.length === 0 ? "success" : "warning"}
              title={
                findings.length +
                " finding(s) — " +
                aVerifier +
                " to be checked by a human"
              }
            >
              <Text>
                Mode: {report.mode || "demo"}. Read{" "}
                {sources.length} source(s). Generated at {report.generatedAt}.
              </Text>
            </SectionMessage>
          )}

          {autorisation && autorisation.ok === true ? (
            <SectionMessage appearance="information" title="Identity">
              <Text>
                The site was read with your own Jira permissions (asUser). The
                app never reads with a wider identity, and it never falls back
                to one.
              </Text>
            </SectionMessage>
          ) : null}

          {recus && recus.length > 0 ? (
            <SectionMessage appearance="information" title="Privacy">
              <Text>
                The scan received {recus.join(", ")} and returned{" "}
                {Object.keys(masked || {})
                  .map((c) => c + " = " + masked[c])
                  .join(", ")}{" "}
                — a mask, never the value.
              </Text>
            </SectionMessage>
          ) : null}

          <FindingsTable findings={findings} />

          <Heading size="small">Export the findings</Heading>
          <Text>
            The CSV below is the export: select it and copy it — that works
            whatever the browser allows the download button to do.
          </Text>
          <Heading id="csv-copier-titre" size="xsmall">
            Findings as CSV (to copy)
          </Heading>
          <TextArea
            id="csv-copier"
            aria-labelledby="csv-copier-titre"
            isReadOnly
            isMonospaced
            isCompact
            minimumRows={4}
            maxHeight={220}
            value={(result && result.csv) || ""}
          />
          <ButtonGroup>
            <Button onClick={exporterCsv}>
              Download the findings as CSV
            </Button>
          </ButtonGroup>
          {csvMessage ? <Text>{csvMessage}</Text> : null}

          {report.limites && report.limites.length > 0 ? (
            <>
              <Heading size="small">What this scan cannot check</Heading>
              {report.limites.map((limite, i) => (
                <Text key={"limite-" + i}>• {limite}</Text>
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

// UI Kit 2: the platform does NOT call our code — the bundle registers
// itself. `App` is exported as well so the offline harness can mount the
// very same element without a browser.
export const App = <AdminPage />;

ForgeReconciler.render(App);
