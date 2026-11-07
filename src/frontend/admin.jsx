/**
 * admin.jsx — the administration page of Portal Accessibility Checker for JSM.
 *
 * UI Kit 2 (@forge/react). ONE job: let a signed-in Jira administrator run
 * the accessibility scan and read its findings.
 *
 * CYCLE 128 (05/11/2026) — THIS PAGE REPLACES THE PUBLIC TRIGGER.
 * The app used to answer a public trigger module with `authentication: none`:
 * anyone who knew the URL could scan a customer's site and read the findings.
 * This page is the interface instead — it is only rendered by Jira for an
 * administrator, and the resolver behind it (src/resolvers.js) only answers
 * the signed-in user who pressed the button.
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
  Textfield,
} from "@forge/react";
import { runScan, runDemoScan } from "./api.js";

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
// the demo export) and downloaded by the browser.
function telechargerCsv(nomFichier, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  lien.rel = "noopener";
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

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

  const report = result ? result.report : null;
  const findings = findingsOf(report);
  const aVerifier = findings.filter((f) => f.a_verifier === true).length;
  const sources = sourcesOf(report);
  const masked = report && report.privacy ? report.privacy.maskedValues : null;
  const recus = report && report.privacy ? report.privacy.receivedFields : [];

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
          service and stores nothing. Scan results are returned only to the
          logged-in user who started the scan. Checks that only exist in the
          rendered page (contrast, keyboard focus, target size) are reported as
          needing human review instead of being guessed.
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

          <ButtonGroup>
            <Button onClick={() => telechargerCsv("pac-jsm-findings.csv", result.csv || "")}>
              Download the findings as CSV
            </Button>
          </ButtonGroup>

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
