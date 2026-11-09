# Privacy Notice — Portal Accessibility Checker for JSM

**App type:** Atlassian Forge app (Jira / Jira Service Management)
**App ID:** `33f1227e-0df1-4008-b181-ea9c50b116f5`
**Source code:** the repository this file lives in (MIT licence) — every line of the app is public, so the behaviour described below can be read in the code that implements it
**Published notice:** **https://labs.chiffreo.ch/privacy.html** — this is the **only** published privacy URL of this app; this file is the same notice, kept in the repository so that the code and the notice can be read side by side.

*Last updated: 7 November 2026.* This notice describes the app as it is deployed today
(production version **2.5.0**, deployed 7 November 2026). It replaces the version of
4 November 2026, which described an earlier shape: a **public trigger** (`authentication:
none`) that anyone could call. That module has been **removed** — § 3 explains what
changed, and § 3 also says exactly what did not change. The masking contract, the
sentence of § 8 and the whole of § 8's reasoning are unchanged, because the engine
(`src/index.js`) is unchanged: the interface moved, the code that reads your site did not.

---

## 1. What the app is

Portal Accessibility Checker for JSM is a **read-only** Atlassian Forge app. It reads the
metadata of a Jira Service Management customer portal and reports what it found against a
set of WCAG 2.2 AA criteria. It does not change, create or delete anything on your site.

It is started **by a person, from a page**: you open
**Administration → Apps → Portal Accessibility Checker for JSM** and press **Run the scan**.
Jira renders that page only for a signed-in administrator.

## 2. What the app reads

Every call is a relative `/rest/...` path on the site where the app is installed, made with the app's
own Atlassian identity. The manifest declares only the read scopes **`read:jira-work`** and
**`read:servicedesk-request`**: no write scope, no admin scope.

| Read | Why |
|---|---|
| Field definitions (`GET /rest/api/3/field`) | to read the labels and descriptions of the fields shown to customers |
| The list of projects and service projects (`GET /rest/api/3/project`) | to list the portals available on the site |
| The fields of each customer request type (`GET /rest/api/3/issue/createmeta/…`, `GET /rest/servicedeskapi/servicedesk/…/requesttype/…/field`) | to read the fields and the help texts of each request type |
| Issue search (`POST /rest/api/3/search/jql`, 20 results, fields `summary` and `description`) | to read the title and the description of the issues that carry the scanned portal strings |

If the Jira Service Management API of your site reports that the product is not licensed for use, the
app falls back to reading the equivalent Jira tickets that carry the same portal strings. It does not
read anything else.

Where a check needs information that only the rendered page carries (colour contrast, keyboard focus,
touch-target size), the app reports the check as *"needs human review"* instead of estimating it.

The app calls **no external service**: the manifest declares no `external` (egress) block and no
domain wildcard, and the code contains no outbound call to any host.

## 3. Personal data

Two honest remarks about the content the app reads, and one about what you may type in the page.

**The content read from your site.** The title and the description of an issue can contain personal
data typed by the people who wrote it — for example a name or an e-mail address in a ticket title.
When the app reads the 20 most recent issues of the scanned projects, it therefore reads that content,
and an excerpt of it can appear in the scan result.

**There is no public URL.** The earlier version of this app (up to 2.4.0) was started by calling a
web trigger declared with `authentication: none`: the scan URL was public, so anyone who had it could
trigger a scan and read its result. That module has been **removed from the manifest**, and the
deployed manifest of both environments now contains exactly two modules: the interface
(`jira:adminPage`) and the function it calls. The function **refuses any call that carries no
signed-in account**, so an anonymous visitor gets a refusal and never a report. The two URLs of the
former trigger were measured on 7 November 2026: they answer HTTP 424 with no scan data.

The consequence for you: the scan is now started by a named, signed-in administrator, and the
findings are shown to that administrator and to nobody else. The advice of the previous version —
"do not install the app on a site whose issue titles contain personal data you would not want a
stranger to be able to read" — no longer applies, because there is no stranger-facing URL.

**Personal data typed in the administration page.** The app does not create an account, does not
ask for a name or an e-mail address, and has no user profile. The page nevertheless offers two
**optional** fields — *Name* and *E-mail* — so that a reader can see the privacy behaviour: the
value comes back **masked**. The app applies the following **contract**, and never breaks it:

1. the values received in the `nom` and `e-mail` fields of the request are **never returned in clear
   text** — the answer carries a **mask** instead (point 2), whatever the channel the value arrived
   in;
2. the mask is `C***` for a name, `c***@***` for an e-mail address, where
   only the first character of the name and of the local part of the address are kept, and the domain
   of the address is never returned;
3. the mask applies **only to the fields that were actually received**: a field absent from the
   request is never invented, never given an empty value and never given a placeholder;
4. a received value of **3 characters or more is also masked wherever it appears in the answer**,
   including in the content read from your site — so that a value carried by the request cannot come
   back out through the audit data;
5. a received value of **less than 3 characters** is masked in the `privacy.maskedValues` block of the
   answer, but cannot be masked throughout the answer without destroying the report; this limit is
   stated in the answer itself (`privacy.limits`);
6. the request is **never written to the app logs** — the app contains no logging statement at all.

**Every channel is covered, not only the obvious one.** A value is collected — and therefore masked —
whatever the way it arrives: in the query parameters, in the body (a JSON object, a JSON string, a
`application/x-www-form-urlencoded` text or a Buffer), in the HTTP headers, or in the raw request
URL. The name of the field is read with **the spaces around it ignored** (` nom ` is `nom`), and
**every** value of a repeated parameter is collected, not only the first one (`?nom=V1&nom=V2` masks
both `V1` and `V2`). This multi-channel coverage was measured on the **production trigger of version
2.4.0** — the version that still had the public URL — and the engine has not changed since. The
version deployed today (2.5.0) has a **single** channel, the payload the page sends with the scan;
the same masking rules apply to it, and they are proved offline by two suites of the public
repository (`node test-contrat-http.js`, 59 checks, and its counter-proof, 28 checks).

The answer carries this block, so that the contract can be checked by reading the answer:

```json
"privacy": {
  "statement": "…",
  "rule": "The values received in the \"nom\" and \"e-mail\" fields of the request are never returned in clear text: the app returns a mask instead, and only for the fields that were actually received.",
  "receivedFields": ["nom", "e-mail"],
  "maskedValues": { "nom": "C***", "e-mail": "c***@***" },
  "limits": ["…"]
}
```

When the request carries no such field, `receivedFields` is empty and `maskedValues` is empty: no
value is invented.

## 4. What the app stores

**Nothing.** The app declares no Forge storage (`storage`) in its manifest and makes no storage call.
A scan is computed on the fly and the findings are returned in the answer of the scan itself (in the
administration page, and as CSV when you download the export). The `generatedAt` timestamp of a scan
is part of that answer; it is not kept anywhere.

## 5. Where the data goes

Nowhere else. Everything runs on Atlassian infrastructure — the Forge runtime, the site's own REST
API — inside your Atlassian tenant. The app has **no external service, no third-party SDK, no
analytics, no telemetry and no cookies**. It sends no data to the app developer, to Atlassian beyond
the calls your own site's API handles, or to any other third party. The findings you see are produced
on your site and returned to you.

These points were checked against the published source code, not merely intended: the code contains no
outbound call to any host, no storage call, and no analytics or telemetry code.

## 6. How long the data is kept

**Not at all.** Nothing is written, so nothing has to be deleted. Removing the app from your site
(**Administration → Manage apps**) removes its installation entirely.

## 7. Your choices

* You decide when the scan runs and which portal and request types are scanned. Nothing is scanned
  unless an administrator asks for it.
* The app holds no data after the scan, so there is nothing to export and no data to delete.
* You can remove the app at any time from **Administration → Manage apps**.

## The two Rovo MCP tools (in the source code; not deployed yet)

*The source code of this app (the repository this file lives in) contains one more module than
the deployed version does: a `rovo:mcp` module, which exposes two tools through Atlassian's MCP
server. **Production 2.5.0 does not have it.** The section below describes what those tools do,
so that the notice can be read next to the code; the published page
(https://labs.chiffreo.ch/privacy.html) must be updated at the same time as the deployment, and
not before.*

**The two tools.** `scan_accessibility(url)` runs the same WCAG 2.2 AA scan as the button on the
administration page and returns the findings. `list_last_findings()` returns the same findings as
a compact list.

**What they read.** The same relative `/rest/...` paths as § 2, through the same two read scopes
(`read:jira-work`, `read:servicedesk-request`). **No scope was added and none was removed.**

**Whose permissions they use.** The caller's own. When an agent calls a tool, the site is read
*as the person who called it*, not with the app's wider permissions: an agent can therefore never
read what the person calling it cannot read. If the platform refuses that identity (the caller has
not granted the app access, or the call is not authenticated), the tool returns a refusal and
reads nothing.

**Whose site they read.** Only the site where the app is installed. The URL given to
`scan_accessibility` is compared with the host of that site and is **never fetched**; a URL
pointing at another site is refused, and nothing is scanned.

**What they write and keep.** Nothing. The tools make no storage call, no write call and no call
to an external service — the same promise as § 4 and § 5. In particular the app keeps **no
history** of the scans it has run: `list_last_findings()` returns the findings that are current
at the time of the call, and says so in its answer. The tool output lists the endpoints that were
read with their HTTP status, and no content and no account identifier.

**Who can call them.** A signed-in Atlassian user who has granted the app access, through
Atlassian's MCP server. Whether MCP clients outside Atlassian may use them is a setting of your
site, controlled by your administrators.

## 8. The exact sentence displayed in the app

Every answer produced by the app — the JSON report and the demo report — carries this sentence in its
`privacy.statement` field:

> This app reads your site content through Atlassian read-only REST APIs and stores nothing. It calls
> no external service. Scan results are returned only to the logged-in user who started the scan. A
> name or e-mail address that it receives in the request is returned as a mask, never in clear text.
> The content it reads from your site is returned as it is, because that content is what it checks.

The sentence says exactly what the app does, and no more: the last sentence is the honest counterpart
of the first paragraph of § 3 — the content read from your site comes back unchanged, because it is
the content the app checks. The masking described above applies to the values **received in the
request**, not to the content of your site.

This sentence changed with the interface (7 November 2026): it now says that the results are returned
only to the signed-in user who started the scan, which is what replaced the public URL. The quoted
text above is **copied from the constant `PHRASE_PV` of `src/index.js`** — it is not a paraphrase, and
the repository contains the check that proves it (`python3 tools/verifier-notice-pv.py`, control
`NOTICE-03`).

## 9. Contact

Questions, corrections or a request to stop processing can be raised as an issue in the public
repository: the *Issues* tab of the repository this file lives in.

The source code of every line of the app is public under the MIT licence in the same repository, so
the behaviour described above can be read directly, not taken on trust.

---

Published by Tgg Labs — personal projects by Tgg, in Switzerland.
