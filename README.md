# Portal Accessibility Checker for JSM

**An Atlassian Forge app that reads the customer-facing content of your Jira Service
Management site through the official REST APIs and reports WCAG 2.2 accessibility
findings — as findings to verify, never as a compliance verdict.**

The scan is started **from a button in the Jira administration page**. There is no
public URL: until version 2.4.0 the app answered a web trigger declared with
`authentication: none`, and that module has been removed.

| | |
|---|---|
| **Runs on** | Atlassian Forge — on Atlassian's infrastructure, inside your own site |
| **Price** | Free (hackathon prototype, Codegeist 2026) |
| **Data leaves your site** | The app itself sends nothing: it declares **no egress at all**, runs on Atlassian's infrastructure and calls only the REST APIs of your own site. What it *returns* is the report itself — to the administration page, or, for the two MCP tools, to the MCP client the administrator chose to call them from (that client is chosen by the admin and is outside this app; see [MCP tools](#the-two-tools-on-atlassians-mcp-server-deployed-since-production-260)) |
| **Personal data in the answer** | A name or an e-mail **typed in the page** is masked, never returned in clear text. The content read from your site is returned **as it is** — it is what the app checks (see below) |
| **Permissions** | Read-only: `read:jira-work`, `read:servicedesk-request` |
| **App version in this repository** | the code of this branch (code files unchanged since commit `9a0d99f`, 16 November 2026: Forge packages updated, no known high or critical advisory left in production dependencies). Measured on 17 November 2026 with the Platform API: it is the code served by production **2.11.0** of the app (deployed 16 November 2026 at 16:38:53 UTC) **and** by the **judge copy** (a separate Forge app, `d6ddc803-a5a2-4c18-b918-4629395f97f9`, production **2.1.0**, deployed 17 November 2026 at 01:22:51 UTC, no licence) — the judges install the judge copy (see "Marketplace" below). Forge assigns the numbers itself (the manifest declares no `app.version`), so the two apps number the same code differently |


## In two minutes (for the Codegeist judges)

**The problem.** Your customers never open Jira — they open your service portal.
Since 28 June 2025, the European Accessibility Act (Directive (EU) 2019/882)
requires the websites and online applications of consumer services such as
e-commerce and consumer banking to be "perceivable, operable, understandable
and robust" (Annex I, Section IV). Many of those teams run support through a
service portal.

**Who it is for.** The service desk owners of those teams: the people who write
the request types, field labels, descriptions and page titles that customers
fill and read.

**What you will see.** In **Administration → Apps → Portal Accessibility Checker
for JSM**, the button **Run the demo scan (no site needed)** runs the rule engine
on bundled sample data; **Run the scan** reads your own portal. Each finding ties
a value the app really read to a WCAG 2.2 criterion, its location and a message;
what only exists in the rendered page is marked "human review" in the
**Review** column, never guessed, and the app never says "compliant". The findings can be copied as CSV.

**Why it is different.** axe and Lighthouse check a rendered page; this app
checks the source of the portal content inside JSM, where it is edited, and an
AI agent can run the same scan through two read-only tools on Atlassian's MCP
server.

**Why you can trust it.** Only a Jira administrator can scan (checked on the
server, with the caller's own identity); two read-only scopes, no egress, no
storage. The rule engine is tested offline with `npm install && npm test`, no
Atlassian account needed — see [Run the tests](#run-the-tests-offline-no-atlassian-account-needed).
What has **not** been run yet is stated plainly in
[Limitations](#limitations-stated-plainly).

**Contents:** [What it does](#what-it-does) ·
[Criteria checked](#the-13-wcag-22-criteria-it-checks) ·
[MCP tools](#the-two-tools-on-atlassians-mcp-server-deployed-since-production-260) ·
[Privacy contract](#the-privacy-contract-of-the-scan-request) ·
[Run the tests](#run-the-tests-offline-no-atlassian-account-needed) ·
[Deploy](#deploy-it-on-your-own-site) · [Architecture](#architecture) ·
[Limitations](#limitations-stated-plainly) ·
[Contest entry](#contest-entry-and-marketplace-listing--state-on-17-november-2026)

## The scan of a real JSM portal, in images

The 7 findings of the scan measured on a real JSM portal on 17 November 2026
are published as images, in the words of the engine itself:

| | image | what it shows |
|---|---|---|
| thumbnail | [`media/scan-jsm-vignette-1500x1000.png`](media/scan-jsm-vignette-1500x1000.png) | the run: 9 GET calls, 0 refused, 7 findings (6 on 3.3.2, 1 on 1.3.5), one finding in full, and the 9 endpoints the engine read |
| capture 1 | [`media/scan-jsm-constat-1500x1000.png`](media/scan-jsm-constat-1500x1000.png) | one finding in plain words: criterion, level, the endpoint it was read from, resource, location, value read, the message of the engine, the review it asks for |
| capture 2 | [`media/scan-jsm-regles-1500x1000.png`](media/scan-jsm-regles-1500x1000.png) | the rules the engine applied — level, confidence, endpoints, request types, messages — and what the scan cannot check |
| capture 3 | [`media/scan-jsm-violations-1500x1000.png`](media/scan-jsm-violations-1500x1000.png) | the list of the 7 findings, in the table the administration page shows |

These 4 images are **computed**, not drawn: every line they show comes from a
file of this repository, and the manifest
[`media/SCAN-JSM-SCREENSHOTS-2026-11-17.json`](media/SCAN-JSM-SCREENSHOTS-2026-11-17.json)
says which file each line comes from. They are produced by
[`tools/generer-images-scan-184.py`](tools/generer-images-scan-184.py) from the
measurement of the real run
([`docs/scan-jsm-2026-11-17.json`](docs/scan-jsm-2026-11-17.json)), and
[`tools/verifier-images-scan-184.py`](tools/verifier-images-scan-184.py) replays
that computation and checks the result is identical — a picture drawn by hand
would not survive that check. Size, dimensions, md5 and the public URLs are in
[`docs/SCAN-JSM-SCREENSHOTS-2026-11-17.md`](docs/SCAN-JSM-SCREENSHOTS-2026-11-17.md).

## What it does

You open **Administration → Apps → Portal Accessibility Checker for JSM**, and you
press **Run the scan**. The page reads your site content through the product REST
APIs and shows the findings **in the page**. The findings are also given as CSV:
the CSV is written in a **read-only field** under the table — select it and copy
it, a path that needs no browser API at all — and the button **Download the
findings as CSV** offers the same file when the browser allows the download.

Why the field comes first: UI Kit 2 has **no documented access to the page's
DOM**. The official reference says "You won't have access to any of the
underlying DOM, so features that depend on that will not work"
(<https://developer.atlassian.com/platform/forge/ui-kit.md>, consulted on
9 November 2026), and neither `URL.createObjectURL` nor `document.createElement`
appears anywhere in the Forge documentation. The one documented UI Kit 2 download
route is the `FileCard` component, whose `onDownload` callback may return a
`Promise<Blob>` and then "automatically trigger a browser download"
(<https://developer.atlassian.com/platform/forge/ui-kit/components/file-card.md>).
So the interface promises the **copy field**, which works whatever the browser
allows, and offers the button as a convenience that says what happened.

The scanner probes Jira Service Management first (`GET /rest/servicedeskapi/info`).
If JSM is licensed on the site, it scans the customer portal content: request
types, their fields and help texts. Knowledge-base articles are **not** read:
no knowledge-base endpoint is called. If JSM is not licensed
(`isLicensedForUse: false` — the situation of the test site until 17 November
2026), the same rule engine automatically falls back to the Jira equivalent:
custom fields, field descriptions, create-screen metadata and issue summaries.
The report records which mode ran (`mode: "jsm"` or `mode: "jira-fallback"`) and
the raw probe result (`jsmProbe`), so nothing is claimed that was not measured.

**Measured on a real JSM portal — 17 November 2026.** The `Support` service desk
of the test site `tgg-dev.atlassian.net` reports `isLicensedForUse: true`, so the
scan ran in **JSM** mode: **9 GET requests, 0 refused, 7 findings — 6 × criterion
3.3.2** (level A) **and 1 × 1.3.5** (level AA)**. They come from the request types
read (Get IT help 1, Report a system problem 2, Report broken hardware 3, Request
a new account 1); the numbers are verified twice — see [`docs/SCAN-JSM-2026-11-17.md`](docs/SCAN-JSM-2026-11-17.md).

A second button, **Run the demo scan (no site needed)**, runs the same engine on
six bundled fixtures — no account, no site, no tenant.

## The interface, and the absence of a public entry point

The interface is a `jira:adminPage` module: Jira itself renders it, in the
administration area, at `/jira/settings/apps/{appId}/{envId}`. The official
reference (<https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-admin-page.md>,
consulted on 9 November 2026) says where the page appears and how its URL is
built; it names **no role and no permission** for opening it. This app therefore
does **not** claim that the page is administrator-only: a **signed-in user** who
can open Jira administration can open the page, and the app checks the rights
itself, on the server. The scan is behind a `function` module (`resolver`) that
refuses any call which carries no signed-in account — an anonymous visitor gets a
refusal, never a report.

**The administrator check is made on the server, not in the page.** A page is a
display: anything able to call the function would otherwise receive the findings
of the customer's site. So `scan()` asks Jira, with the caller's own identity
(`asUser`), what permissions that account holds:

```
GET /rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN
```

**The same check guards the two MCP tools.** An agent could call them, so the
check is not left to the page: `src/droits-admin.js` holds it — **one**
implementation, called by the resolver (`src/resolvers.js`) and by the two
tools (`src/mcp.js`) — and it runs **before any read of the site** on both
paths. There is one control, not two copies of it.

"Get my permissions", Jira Cloud REST API v3 — see
<https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-permissions/>
(consulted on 9 November 2026). `ADMINISTER` ("Administer Jira") and
`SYSTEM_ADMIN` ("Jira System Administrators") are the two **global** permissions
of a Jira site — the ones the site itself lists on `GET /rest/api/3/permissions`.
No new scope is needed for this: the official page lists the classic scope
`read:jira-work` as the recommended scope of that endpoint, and the app already
declares it — so the manifest is unchanged and nothing has to be reinstalled.

Those two names are the ones Forge itself uses for this kind of check: the
display-conditions reference lists `hasGlobalPermission` (with the global keys
`ADMINISTER` and `SYSTEM_ADMIN`) and `canAdministerJira`
(<https://developer.atlassian.com/platform/forge/manifest-reference/display-conditions/jira.md>,
consulted on 9 November 2026). This app does not use them to *hide* the page:
hiding the entry would hide it from a reviewer who is not an administrator, and
a refusal that says why is more useful than a missing menu. The names, though,
come from the same official source as the check itself.

The check **fails closed**: if the platform refuses it (401), if the answer says
nothing about those two permissions, or if it cannot be read, the scan does not
run and the caller gets a refusal. The site is not read once for a caller who is
not an administrator. The demo scan reads no site at all, so it stays available
to any signed-in user.

The check is covered by `test-admin.js` (18 checks, with three
counter-proofs: without the check a non-administrator would get the report; a
wrong permission key refuses the administrator; a check that fails open would let
anybody through — the three sabotages must each turn the suite RED) and by
`test-mcp-admin.js` (17 checks, four counter-proofs), which proves that
the two MCP tools apply **the same** check, before any read.

`test-refus-non-admin.js` (14 checks, three counter-proofs) proves the refusal
**in both directions**: a caller who holds neither `ADMINISTER` nor
`SYSTEM_ADMIN` is refused — on the page *and* by the two MCP tools — with the
same wording, and **nothing of the site is read**; an administrator is still
allowed (so the suite is not green because everything refuses). Its
counter-proofs remove the control itself, remove the gate from the page, and
remove the gate from the MCP path: each of the three must turn the suite RED.

> **This change is deployed** since production 2.8.0 and is in every later version,
> including the judge copy: the two MCP tools apply the same
> administrator check as the page, **before any read** of the site. The package
> uploaded for that deployment contains the check, called before the scan.
> Nothing in this file claims a behaviour the running app does not have.

> **What 2.9.0 changed** (commit `1e90a0c`, deployed to production on
> 14 November 2026 at 23:33:09 UTC): the rules engine now knows **English** — a
> non-descriptive link ("click here", "read more", "details"), a vague title
> ("Information", "Other", "Links"), a purpose keyword ("name", "address",
> "date of birth", "company") and a sensory instruction ("red button", "top
> right", "grey box") are detected in an English portal, with whole-word
> matching. The **purpose-of-input check (WCAG 1.3.5)** now applies to
> **free-text custom fields only**: Jira system fields (summary, description,
> attachments) and pickers, dates and people fields no longer produce a
> 1.3.5 finding. The **default request-type names** of a JSM portal ("Get IT
> help", "Fix an account problem", "Request admin access") are no longer
> compared with the request-type description, so a correct default name is not
> reported as a non-descriptive title. A title that shares no significant word
> with the beginning of the content is now reported as a **hint to check**
> ("a verifier"), not as an automatic finding. The interface is unchanged.
> The offline suite that proves all of this is `test-portail-par-defaut.js`
> (19 checks, including the four English faults).
>
> **What 2.10.0 changed** (commit `1ff128d`, deployed to production on
> 15 November 2026 at 13:36:51 UTC): a request type whose `groupIds` is empty
> is "Hidden from portal" — the customer never sees it — and the scan is a scan
> of the portal. Before the fix, such a type took one of the five places the
> scan reads and was judged like a visible one: the scan could report a finding
> on a page the customer never opens, and a visible type could be pushed out of
> the five. After the fix the hidden type is neither judged nor counted; a type
> **without** a `groupIds` field is kept. The new test `test-types-caches.js`
> (4 checks) proves it, and it turns RED on the code before the fix.

`manifest.yml` declares **four module types** and nothing else:

```yaml
modules:
  jira:adminPage:                 # the interface (render: native, resource: admin)
    - key: pac-jsm-admin-page
      ...
  function:                       # the code paths to the scan
    - key: resolver
      handler: resolvers.handler
    - key: mcp-scan
      handler: mcp.scanAccessibility
    - key: mcp-last-findings
      handler: mcp.listLastFindings
  action:                         # the two tools, exposed by the rovo:mcp module
    - key: scan_accessibility
      ...
    - key: list_last_findings
      ...
  rovo:mcp:                       # ONE MCP server, exposing the two actions above
    - key: pac-jsm-mcp
      name: Portal Accessibility Checker
      tools:
        - scan_accessibility
        - list_last_findings
```

There is no `webtrigger`, no `productTrigger`, no `scheduleTrigger`, no `external`
(egress) block and no domain wildcard. That is checkable by reading the manifest:

```
python3 tools/verifier-manifest-cycle134.py     # 18 checks, RC 0
python3 tools/contre-epreuve-verificateur.py     # the checker must turn RED on 9 sabotages
```

> **The `rovo:mcp` module is deployed since production 2.6.0** (9 November 2026,
> 13:28 UTC), together with the `asUser` identity. The previous production version
> (2.5.0) declared only the interface and the resolver. The manifest that was
> uploaded for 2.6.0 declares exactly one `rovo:mcp` module, the two `action`
> modules and the three `function` handlers — and still no `webtrigger`, no
> `productTrigger`, no `scheduleTrigger`.
>
> **Version history.** `forge deploy` numbers the versions itself: the manifest declares no
> `app.version`, so the CLI increments the minor number of the installed major version.
> Production went 2.6.0 → 2.7.0 → 2.8.0 → 2.9.0 → 2.10.0 (15 November 2026, the
> hidden-request-type fix) → **2.11.0** (16 November 2026 at 16:38:53 UTC, the
> dependency update of commit `9a0d99f`; manifest unchanged). The judge copy is a separate
> app with its own numbering: its production **2.1.0** (17 November 2026 at 01:22:51 UTC)
> serves the same code — 51 files compared one by one with this branch, 0 difference — and
> its manifest differs only by the app id and a comment saying it is the judge copy. The
> Platform API (`api.atlassian.com/graphql`, `app(id:)` → `environmentsPage`, `isLatest`)
> is the authority for what is served on a given day.
> The development environment numbers on its own: its 2.11.0 of 15 November 2026 (quoted
> below) was a different build, with an `app.licensing.enabled` block; it now runs 2.12.0.

**Measured on 7 November 2026** (and re-measured on 15 November 2026, after the
deployment of 2.10.0), on both environments:

* the manifests **uploaded** for production 2.10.0 and for development 2.11.0 (both
  packages are kept as evidence) declare `egresses: []`, `remotes: []`,
  `services: []`, the **two read scopes** and **four** kinds of module —
  `jira:adminPage`, three `function` handlers, two `action` modules and one
  `rovo:mcp` module — and **no trigger module in either environment**
  (`forge version details --json` needs a TTY and cannot run in this container:
  the state was read from the **Platform API** and from the **uploaded packages**
  themselves);
* the two URLs of the former public trigger answer **HTTP 424 Failed Dependency**
  with 157 bytes and no scan data (they are no longer routable);
* an anonymous request to the administration URL returns the Atlassian sign-in
  shell: 0 occurrence of the app name, 0 occurrence of the button, no finding;
* on 15 November 2026, the **Platform API** (GraphQL, `api.atlassian.com/graphql`)
  answers `isLatest: true` for **production 2.10.0** (version id
  `09201e49-daac-48f6-bf92-c1c73e01ffcc`) and for **development 2.11.0**,
  and the package uploaded for that deployment (kept as evidence) declares the
  `rovo:mcp` module, the two `action` modules, the three `function` handlers, the
  two read scopes — **and no trigger module**.

## The identity of the reads: `asUser`, always

The app acts **on behalf of a person**: the administrator who presses the button
in the administration page, or the caller of an MCP tool. It therefore reads the
site **with that person's own Jira permissions** (`asUser`) — never with a wider
identity.

This is not a choice, it is the rule the Marketplace security review applies:

> 1. « An application must default to using asUser() when performing an
>    operation on behalf of the user. »
> 2. « Before making calls using asApp(), you must verify the expected
>    permissions (for example, from product context) with the permissions
>    REST APIs. »
>
> — *Security requirements for cloud apps*, section « Forge apps »

The second rule asks for a permissions check **before** the app widens the
identity. This app **removes the `asApp()` call altogether** rather than
justify it halfway — and it *does* call the permissions API, with the caller's
own identity (`GET /rest/api/3/mypermissions`, the check described above), so
the two read scopes are the only ones it declares. The application contains
**zero** `asApp()` calls, so it cannot read anything the person who started the
scan could not read themselves.

Two consequences, both visible in the product:

* the report carries an `autorisation` section that says which identity was
  used (`asUser`) — the declaration is checked against the code by
  `test-identite.js`, so the two cannot drift apart;
* if the platform refuses that identity (HTTP 401/403 — the caller's account
  has not authorised the app to read the site on their behalf), the app
  **refuses** and says what to do. It never returns an empty report, which
  would read as "this site has no accessibility problem" when in fact
  **nothing was read**.

```
node test-identite.js            # 12 checks — 0 asApp() in the active code, and the
                                          #            behaviour when the platform refuses
```

## The two tools on Atlassian's MCP server (deployed since production 2.6.0)

The source of this app declares **one** `rovo:mcp` module — Atlassian allows at
most one per app — which exposes **two** actions as tools:

| Tool | What it does |
|---|---|
| `scan_accessibility(url)` | runs the WCAG 2.2 AA scan of the customer portal and returns the findings, the endpoints that were read (path and HTTP status only) and the limits of the scan |
| `list_last_findings()` | returns the same findings as a compact list |

What the two tools do **not** do is the interesting part:

* **they are reserved to Jira administrators, exactly like the scan started
  from the administration page**: the same server-side check
  (`src/droits-admin.js`, `GET /rest/api/3/mypermissions?permissions=ADMINISTER,SYSTEM_ADMIN`,
  asked with the caller's own identity, failing closed) runs **before any read
  of the site**. A caller who is not an administrator gets a refusal, never a
  report. *(This bullet describes the code of this repository **and** the version
  running in every production version since **2.8.0**, including the judge copy:
  the check on the tools is deployed, and the uploaded package contains it,
  called before any read.)*
* **they read the site with the caller's own permissions** (`asUser`), not with
  the app's wider ones: an agent can never read what the person who called it
  cannot read. The identity comes from the platform, never from a value the
  model produced;
* **they read nothing else**: the same relative `/rest/...` paths as the
  administration page, through the same two read scopes. No scope was added;
* **they never fetch the URL they are given**: it is compared with the host of
  the site where the app is installed, and a URL pointing at another site is
  refused;
* **they write nothing and keep nothing**: no storage call, no external call.
  The app keeps no history of the scans it has run, so `list_last_findings()`
  returns the findings that are current at the time of the call, and says so;
* **they refuse an unauthenticated caller**: the tools first ask the platform
  who is calling, and a refusal (401) stops the tool before anything is read.

The tools run the very same engine and the very same rules as the button
(`src/regles.js` is not re-implemented here). `node test-mcp.js`
checks all of this offline, against a simulated platform, and checks that the
harness turns red when each of these properties is broken.

> This module is **deployed**: every production version since 2.6.0, and the judge
> copy, declare the `rovo:mcp` module and the two actions. The tools become usable on a site where
> **Rovo is activated** (a paid plan — see below).

> **Rovo is a paid Atlassian product, and the tools need it.** Atlassian states
> that « Rovo, including Search, Chat, and Studio apps as well as agents, is
> available to customers with a **Standard, Premium, or Enterprise** Cloud plan »
> (https://www.atlassian.com/licensing/rovo). A site on the **Free** plan has
> no Rovo, therefore no MCP server, therefore **neither of these two tools** —
> the administration page (the scan button) works on every plan, including
> Free. The cost of Rovo is yours, the app itself is free.

## The privacy contract of the scan request

The page has two optional fields — **Name** and **E-mail**. They exist so that a
reader can see the privacy behaviour: the value comes back **masked**, never in
clear text. The engine applies the following rule, and never breaks it:

| | |
|---|---|
| Fields watched | `nom` (alias `name`) and `e-mail` (aliases `email`, `e_mail`) |
| Where they are looked for | in the payload the page sends with the scan (`{ "nom": …, "e-mail": … }`), and — for the engine, which has not changed — in any request-shaped input: query parameters, body (object, JSON, urlencoded text or Buffer), HTTP headers, raw URL |
| What comes back | a mask: `C***` for a name, `c***@***` for an e-mail address (first character only; the domain is never returned) |
| Absent field | **never invented** — no `null`, no empty string, no placeholder. `receivedFields` is empty and `maskedValues` is `{}` |
| Elsewhere in the answer | a received value of **3 characters or more is masked wherever it appears**, including in the content read from your site |
| Shorter values | a value of **less than 3 characters** is masked in `privacy.maskedValues` but cannot be masked throughout the answer without destroying the report — the answer says so in `privacy.limits` |
| Logs | the request is never logged: the app contains **no logging statement at all** |

Every answer carries the contract in a `privacy` block, so it can be checked by reading the answer:

```json
"privacy": {
  "statement": "This app reads your site content through Atlassian read-only REST APIs, stores nothing, and sends nothing outside your Atlassian tenant. A name or e-mail address that it receives in the request is returned as a mask, never in clear text. The content it reads from your site is returned as it is, because that content is what it checks.",
  "rule": "The values received in the \"nom\" and \"e-mail\" fields of the request are never returned in clear text: the app returns a mask instead, and only for the fields that were actually received.",
  "receivedFields": ["nom", "e-mail"],
  "maskedValues": { "nom": "C***", "e-mail": "c***@***" },
  "limits": ["…"]
}
```

The rule is implemented in `src/index.js` (section *privacy contract*) and proved
three times: by an offline test suite (`node test-contrat-http.js`, 59 checks), by
its counter-proof (`node test-contrat-http-contre-epreuve.js`, 28 checks — the
suite must turn **red** when the contract is broken, and must name the broken
check), and by the live page itself (the "Privacy" panel of the administration
page shows the mask, never the value). The full notice is in
[PRIVACY.md](PRIVACY.md), and the published notice is at
**https://labs.chiffreo.ch/privacy.html** — that is the **only** privacy URL in
this repository.

## The 13 WCAG 2.2 criteria it checks

Target: WCAG 2.2 level AA. Each criterion below is level A or AA, so all of them
are inside an AA target. The engine is deliberately explicit about what a REST
API can and cannot prove.

**One scan does not run all 13.** What is read depends on the mode, and the
table says where each criterion actually runs:

* **JSM mode** (JSM licensed on the site — the customer portal is scanned):
  request types, their names, their help texts and their fields are read —
  **5 criteria** run (3.3.2, 1.3.5, 3.2.6, 2.4.2, 2.4.6).
* **Jira fallback** (JSM not licensed or its API not answering — Jira issues
  are scanned instead): custom fields, create-screen metadata, issue summaries
  and issue bodies are read — **10 criteria** run (2.4.6, 3.3.2, 2.4.2 on
  fields and summaries; 1.1.1, 1.3.1, 2.4.4, 4.1.2, 1.4.1, 1.4.3, 1.3.3 on
  issue bodies).
* **1.2.2 never runs in a scan of a site**: attachments are not fetched by any
  scan. It runs on the bundled demo data only (the six fixtures of the demo
  scan include attachments). The demo scan exercises all 13 criteria.

| Criterion | Title | Level | Where it runs in a scan | What the engine checks |
|---|---|---|---|---|
| 1.1.1 | Non-text Content | A | Jira fallback (issue bodies) | Provable from REST — image/media node without an `alt`, or with an empty one |
| 1.3.1 | Info and Relationships | A | Jira fallback (issue bodies) | Provable from REST — skipped heading levels; table whose first row has no header cell |
| 2.4.2 | Page Titled | A | Both modes (request-type names; issue summaries) | Provable from REST — empty or generic title (English and French lists); a title sharing no word with the start of the content is only flagged "to verify" |
| 2.4.4 | Link Purpose (In Context) | A | Jira fallback (issue bodies) | Provable from REST — link text that is a bare URL or a non-descriptive label ("click here" and friends) |
| 3.2.6 | Consistent Help | A | JSM mode only (request types) | Provable from REST — help present on one request type/field and absent on its sibling |
| 3.3.2 | Labels or Instructions | A | Both modes (request-type fields; ambiguous custom fields) | Provable from REST — form field without a label; **required** field without instruction/description |
| 4.1.2 | Name, Role, Value | A | Jira fallback (issue bodies) | Provable from REST — inline node (mention, status) carrying no `text` label |
| 1.2.2 | Captions (Prerecorded) | A | **Never in a scan** — bundled demo data only | Content-only (partial) — media attachment without a `text/vtt` or `.vtt`/`.srt` transcription |
| 1.3.3 | Sensory Characteristics | A | Jira fallback (issue bodies) | Content-only (partial) — instructions relying on shape/color/position words alone |
| 1.3.5 | Identify Input Purpose | AA | JSM mode only (request-type fields) | Content-only (partial) — free-text custom field that **collects personal data** (e-mail, phone, name…; English or French): the input purpose must be identifiable **by programme** when rendered (`autocomplete`), which no REST API exposes — so the finding is a signal to verify. A field that collects no personal data ("Steps to reproduce", "Reference") is **not** a 1.3.5 finding; neither are the Jira system fields (Summary, Attachment) |
| 1.4.1 | Use of Color | A | Jira fallback (issue bodies) | Content-only (partial) — information carried by a color mark alone, with no other mark |
| 1.4.3 | Contrast (Minimum) | AA | Jira fallback (issue bodies) | Content-only (partial) — ratio computed under a **white background assumption**, reported as "uncertain contrast", never as "non-conformant" |
| 2.4.6 | Headings and Labels | AA | Both modes (field labels; custom field names) | Content-only (partial) — internal-looking labels (lowercase technical names, ≥ 4-digit numeric IDs) |

Three things are **not** checkable through the REST API and the app says so in
its method note rather than inventing a result: rendered contrast, reading/focus
order on screen, and visible rendered labels.

**Language rule used throughout the product:** the app never says "compliant" or
"non-compliant". It produces *findings* (`criterion`, `level`, `source`,
`resource`, `location`, `value`, `message`, `to_verify`) that a human must
verify.

## Run the tests (offline, no Atlassian account needed)

```
npm install
npm test                          # 15 suites, 367 checks — every node suite below, in one go
node test-ihm.js                 # 43 checks — the interface replaces the public trigger
node test-contrat-http.js                 # 59 checks — the privacy contract (masking, absent fields, logs)
node test-app-demo.js                     # 22 checks — the resolver returns the 23/23 verdict
node test-demo.js                         # 55 checks — detects all 23 seeded issues in the bundled demo data
node test-contre-epreuve.js               # 13 checks — the harness turns RED when a rule is sabotaged
node test-contrat-http-contre-epreuve.js  # 28 checks — that harness turns RED when the contract is broken
node test-mcp.js                  # 32 checks — the two MCP tools read the caller's site, and nothing else
node test-admin.js                # 18 checks — the administrator check on the page's path
node test-csv.js                  # 15 checks — the CSV is written in a copyable field
node test-mcp-admin.js            # 17 checks — the SAME administrator check on the two MCP tools
node test-identite.js             # 12 checks — 0 asApp() in the active code, and a refusal when the
                                          #            platform refuses the caller's identity
node test-mcp-porte.js            # 16 checks — the administrator door, with five counter-proofs
node test-refus-non-admin.js       # 14 checks — a NON-administrator is refused, on the page AND on the
                                          #            two MCP tools, and nothing of the site is read
node test-portail-par-defaut.js    # 19 checks — a judge's English site: the default JSM portal and
                                          #            plain Jira tickets, no false "finding"
node test-types-caches.js          #  4 checks — a request type hidden from the portal is neither judged
                                          #            nor counted in the five types read
python3 tools/verifier-manifest-cycle134.py       # 18 checks — no public module, no egress, two read scopes,
                                                   #           one rovo:mcp module with two tools
python3 tools/contre-epreuve-verificateur.py      # 29 checks — that checker turns RED on 9 sabotages
python3 tools/verifier-notice-pv.py               #  7 checks — § 8 of PRIVACY.md quotes the code verbatim,
                                                   #           and there is exactly ONE privacy URL
python3 tools/contre-epreuve-notice.py            # 14 checks — that check turns RED on each sabotage of the notice
python3 tools/verifier-scan-jsm-readme.py         # 31 checks — this README quotes the scan measured on
                                                   #           17 November 2026, and the video it cites
```

Every count above is checked, not typed: `python3 tools/verifier-chiffres-tests.py`
runs each suite and each tool, counts its PASS lines and fails if a number of this
section (or of the layout section below) differs, or if a suite of `npm test` is
missing here; `--counter-proof` breaks this README five ways and requires it to fail.

`test-rules.js` needs two JSON files you can export from any Jira site you
administer: `GET /rest/api/3/field` and `POST /rest/api/3/search/jql` (16 checks
— it is not part of `npm test` for that reason).

The production dependencies are audited too: `npm run audit:prod` runs
`npm audit --omit=dev --audit-level=high` and fails on any high or critical
advisory (the Atlassian Marketplace security requirements forbid third-party
libraries "with known critical or high vulnerabilities"). The pinned
`prosemirror-view` override in `package.json` is what keeps that audit clean.

`test-contrat-http-contre-epreuve.js` and `test-contre-epreuve.js` are
counter-proof suites: they break the product on purpose and require the test
harness to fail — **by naming the broken check**, because a suite that fails by
crashing would prove nothing. `test-ihm.js` does the same for the
interface (8 sabotages: a trigger reintroduced, a write scope, an egress, a raw
HTML tag, a French message, an MCP tool pointing at a missing action, a second
MCP server, an over-long action description) and
`tools/contre-epreuve-verificateur.py` does it for the manifest checker
(9 sabotages). `test-mcp.js` does it for the two tools (6 sabotages:
the tools read with the app's identity, the site check is disabled, the identity
gate is disabled, the probe uses the app's identity, the URL is sent to an
external service, the tools store the history).

## Deploy it on your own site

The app is not yet listed on the Atlassian Marketplace (Codegeist submission in
progress — an installation link for judges is provided with the submission). To
run it from source on a site where you are an administrator:

```
npm install -g @forge/cli
forge login
# create your own Forge app once, then put its id in manifest.yml (app.id)
forge deploy -e production --non-interactive
forge install -e production --site <your-site>.atlassian.net -p jira --non-interactive --confirm-scopes
```

Then open **Administration → Apps → Portal Accessibility Checker for JSM**.
There is **no URL to call**: the interface is the entry point.

## Architecture

```
manifest.yml      1 jira:adminPage (the interface, render: native, resource: admin)
                  3 function       (resolver -> src/resolvers.js, and the two MCP handlers)
                  2 action         (the two tools exposed by the MCP server)
                  1 rovo:mcp       (the MCP server, exposing those two actions)
src/resolvers.js  the entry point of the interface: it checks the caller's account id
                  (backendRuntimePayload.principal.accountId or context.accountId),
                  refuses a call without one, and calls the engine
src/droits-admin.js  THE administrator check, written once: the endpoint, the two
                  global permission keys, the fail-closed decision. The resolver
                  and the two MCP tools call this same function
src/mcp.js        the two tools: the administrator check (the same function as
                  the page's), the identity gate, the host check, and the two
                  answers (the report, the compact list)
src/index.js      the engine: JSM probe, mode selection, REST reads, findings,
                  and the privacy contract (masking of the personal data received)
src/regles.js     the WCAG 2.2 rule engine — pure functions, zero Atlassian imports,
                  shared by the live scan and the demo scan
src/frontend/     the interface: admin.jsx (UI Kit 2), api.js + bridge.js (the
                  invoke() transport to the resolver)
src/demo.js       the demo scan over src/demo/*.json fixtures
docs/             the criterion-by-criterion basis, incl. what REST can prove
docs/SCAN-JSM-2026-11-17.md  the measurement of the 17 November 2026 scan of a real
                  JSM portal (count, criteria, passages), with its machine-readable
                  twin docs/scan-jsm-2026-11-17.json
scan-reel.js      the harness that produced that measurement: it runs the real
                  engine (src/index.js) against a real site over REST, and refuses
                  every call that is not a GET (except the app's own search POST)
tools/            the manifest checker (and its counter-proof), the check that
                  the privacy notice quotes the code verbatim, the check that this
                  README quotes the measured scan (tools/verifier-scan-jsm-readme.py)
                  and its counter-proof against the site
                  (tools/contre-epreuve-scan-jsm.py)
PRIVACY.md        the privacy notice (what is read, where it goes, how long it is kept)
test-*.js         the offline harness (367 checks in fifteen suites, plus 99 checks
                  in the five tools of tools/)
```

One rule engine, two data sources, one interface. No data is stored, no content
is modified: the app reads and reports.

## Limitations, stated plainly

- The JSM branch of the scanner **has now been executed against a licensed JSM
  site**: on 17 November 2026 the scan of the `Support` service desk of the test
  site returned 7 findings (6 × 3.3.2, 1 × 1.3.5) in `mode: "jsm"` — see
  [`docs/SCAN-JSM-2026-11-17.md`](docs/SCAN-JSM-2026-11-17.md). Before that date
  the measurement was made in the `jira-fallback` mode (15 November 2026). What
  the REST API cannot see is unchanged: the scan reads the portal's source, not
  the rendered page, so contrast, focus order, target size and status messages
  stay out of reach.
- Partial criteria produce *signals to verify*, not proof — the finding itself
  says which of the two it is.
- One limit of the privacy contract, stated rather than hidden: a personal value
  of **less than 3 characters** is masked in the `privacy` block, but cannot be
  masked throughout the answer without destroying the report. The answer repeats
  that limit in `privacy.limits` on every call.
- The masking covers the values **received in the request**. The content read from
  your site is returned **as it is** — a ticket title or a field label that happens
  to contain a name is part of the report, because it is the content the app checks.
  The app says so in its `privacy.statement` on every call, and
  [PRIVACY.md](PRIVACY.md) § 3 spells it out.
- The scan reflects the site **at the moment it is run**; the app keeps no history.

## Contest entry and Marketplace listing — state on 17 November 2026

* **Codegeist 2026**: this app is entered in the category *Apps for Business
  Teams*, and the bonus it claims is **Best app with Atlassian MCP** — the
  manifest declares one `rovo:mcp` module, deployed in production since 2.6.0
  and carrying the administrator check since production 2.8.0, exposing the two
  read-only tools described above. The rules of that bonus ask for "a Forge app
  exposing an MCP server" and ask for **no** Marketplace publication, so
  nothing has to be listed to claim it. The choice is written in the same
  places: the `BONUS` block of the submission text and the owner's checklist.
* **Marketplace**: the app is **not published** and has **no listing** yet. Atlassian stops
  sharing an app by installation link once it is submitted for a Marketplace listing, so the
  judges install a separate **judge copy** (same code, its own app id, no licence, sharing
  enabled). Its installation link is the one provided with the submission.
  Re-measured on 23 November 2026: the link answers HTTP 200 — but that 200 is
  the developer console shell (271 bytes), and it is **the same shell for every
  app id**: a link with an entirely invented app id and an entirely invented
  signature gives exactly the same answers (200, then 401 when the console asks
  who you are, then 302 to the Atlassian sign-in, then 405). The app id and the
  signature are therefore checked **only after the sign-in**, which this network
  cannot reach — the sign-in screen answers HTTP 405 with an anti-bot challenge,
  which is not bypassed. So the link is **provided with the submission, but its
  existence and its signature are not verified end to end**. The listing itself
  is a separate, human step (partner profile, then listing, then review
  submission). Until that exists the app is **free** and its revenue is **0 $**.
* **Demonstration video**: published on 17 November 2026 and public:
  **https://youtu.be/JAEoj9jpHMg** (channel *Tgg Labs*, 3 min 12 s, English
  subtitles; YouTube's public oEmbed answers HTTP 200). It shows the **captured**
  version of the app — its captions announce 2.9.0, the version served on
  15 November 2026 — and it is not a frame-by-frame replay of the build the
  judges install: they install the **judge copy**, which Forge numbers 2.1.0 and
  which serves the code of this repository. The only code change made after the
  capture (15 November 2026) is that a request type hidden from the portal is no
  longer judged or counted. The capture plan — site, version, the five shots, and
  what is needed to film — is written in
  [`PLAN-CAPTURE-VIDEO.md`](PLAN-CAPTURE-VIDEO.md).

## Privacy notice

**https://labs.chiffreo.ch/privacy.html** — the single published privacy URL of
this app. The repository keeps the long-form notice: [PRIVACY.md](PRIVACY.md).

## License

MIT — see [LICENSE](LICENSE).
