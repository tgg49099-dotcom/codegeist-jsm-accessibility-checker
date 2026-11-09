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
| **Data leaves your site** | No. The app declares **no egress at all** |
| **Personal data in the answer** | A name or an e-mail **typed in the page** is masked, never returned in clear text. The content read from your site is returned **as it is** — it is what the app checks (see below) |
| **Permissions** | Read-only: `read:jira-work`, `read:servicedesk-request` |
| **App version in this repository** | the code of **production 2.7.0**, deployed on 9 November 2026 (20:54 UTC, version id `09201e49-daac-48f6-bf92-c1c73e01ffcc`), and the same code in the development environment as **2.10.0**; **plus one change committed on 9 November 2026 and not yet deployed** — the administrator check on the two MCP tools (see the note in "Who can open the page"). Forge assigns the numbers itself (the manifest declares no `app.version`), so the two environments number the same code differently |

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
types, their fields, help texts, article content. If JSM is not licensed
(`isLicensedForUse: false` — the exact situation of the test site this prototype
was measured on), the same rule engine automatically falls back to the Jira
equivalent: custom fields, field descriptions, create-screen metadata and issue
summaries. The report records which mode ran (`mode: "jsm"` or `mode:
"jira-fallback"`) and the raw probe result (`jsmProbe`), so nothing is claimed
that was not measured.

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

The check is covered by `test-admin-cycle139.js` (18 checks, with three
counter-proofs: without the check a non-administrator would get the report; a
wrong permission key refuses the administrator; a check that fails open would let
anybody through — the three sabotages must each turn the suite RED) and by
`test-mcp-admin-cycle140.js` (17 checks, four counter-proofs), which proves that
the two MCP tools apply **the same** check, before any read.

> **This change is committed, not deployed.** The version running in production is
> still **2.7.0**, in which the MCP path has no administrator check; the check on
> the two MCP tools goes live with the next deployment, after the re-review.
> Nothing in this file claims a behaviour the running app does not have.

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
> **Production now runs 2.7.0** (9 November 2026, 20:54 UTC), which is that same
> code plus the **server-side administrator check** and the **CSV written in a
> read-only field**. `forge deploy` numbers the versions itself: the manifest
> declares no `app.version`, so the CLI increments the minor number of the
> installed major version — production went 2.6.0 → **2.7.0**, development
> 2.9.0 → **2.10.0**. The version id of the production version is
> `09201e49-daac-48f6-bf92-c1c73e01ffcc`.

**Measured on 7 November 2026** (and re-measured on 9 November 2026, after the
deployment of 2.7.0), on both environments:

* the manifests **uploaded** for production 2.7.0 and for development 2.10.0 (both
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
* on 9 November 2026, the **Platform API** (GraphQL, `api.atlassian.com/graphql`)
  answers `isLatest: true` for **production 2.7.0** (version id
  `09201e49-daac-48f6-bf92-c1c73e01ffcc`) and for **development 2.10.0**,
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
identity. This app cannot call the permissions API (it declares two read
scopes, and such a check would need a third), so it **removes the `asApp()`
call altogether** rather than justify it halfway. The application contains
**zero** `asApp()` calls, so it cannot read anything the person who started the
scan could not read themselves.

Two consequences, both visible in the product:

* the report carries an `autorisation` section that says which identity was
  used (`asUser`) — the declaration is checked against the code by
  `test-identite-cycle136.js`, so the two cannot drift apart;
* if the platform refuses that identity (HTTP 401/403 — the caller's account
  has not authorised the app to read the site on their behalf), the app
  **refuses** and says what to do. It never returns an empty report, which
  would read as "this site has no accessibility problem" when in fact
  **nothing was read**.

```
node test-identite-cycle136.js            # 12 checks — 0 asApp() in the active code, and the
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
  report. *(This bullet describes the code of this repository; the production
  version running today, 2.7.0, still runs the previous MCP path — the
  administrator check on the tools goes live with the next deployment.)*
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
(`src/regles.js` is not re-implemented here). `node test-mcp-cycle134.js`
checks all of this offline, against a simulated platform, and checks that the
harness turns red when each of these properties is broken.

> This module is **deployed**: production 2.7.0 (9 November 2026) declares the
> `rovo:mcp` module and the two actions. The tools become usable on a site where
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
API can and cannot prove:

| Criterion | Title | Level | What the engine checks |
|---|---|---|---|
| 1.1.1 | Non-text Content | A | Provable from REST — image/media node without an `alt`, or with an empty one |
| 1.3.1 | Info and Relationships | A | Provable from REST — skipped heading levels; table whose first row has no header cell |
| 2.4.2 | Page Titled | A | Provable from REST — empty or generic title, or title sharing no word with the start of the content |
| 2.4.4 | Link Purpose (In Context) | A | Provable from REST — link text that is a bare URL or a non-descriptive label ("click here" and friends) |
| 3.2.6 | Consistent Help | A | Provable from REST — help present on one request type/field and absent on its sibling |
| 3.3.2 | Labels or Instructions | A | Provable from REST — form field without a label; **required** field without instruction/description |
| 4.1.2 | Name, Role, Value | A | Provable from REST — inline node (mention, status) carrying no `text` label |
| 1.2.2 | Captions (Prerecorded) | A | Content-only (partial) — media attachment without a `text/vtt` or `.vtt`/`.srt` transcription |
| 1.3.3 | Sensory Characteristics | A | Content-only (partial) — instructions relying on shape/color/position words alone |
| 1.3.5 | Identify Input Purpose | AA | Content-only (partial) — field purpose not announced (no purpose keyword in name or description) |
| 1.4.1 | Use of Color | A | Content-only (partial) — information carried by a color mark alone, with no other mark |
| 1.4.3 | Contrast (Minimum) | AA | Content-only (partial) — ratio computed under a **white background assumption**, reported as "uncertain contrast", never as "non-conformant" |
| 2.4.6 | Headings and Labels | AA | Content-only (partial) — internal-looking labels (lowercase technical names, ≥ 4-digit numeric IDs) |

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
node test-ihm-cycle129.js                 # 43 checks — the interface replaces the public trigger
node test-contrat-http.js                 # 59 checks — the privacy contract (masking, absent fields, logs)
node test-app-demo.js                     # 22 checks — the resolver returns the 23/23 verdict
node test-demo.js                         # 55 checks — detects all 23 seeded issues in the bundled demo data
node test-contre-epreuve.js               # 13 checks — the harness turns RED when a rule is sabotaged
node test-contrat-http-contre-epreuve.js  # 28 checks — that harness turns RED when the contract is broken
node test-mcp-cycle134.js                  # 32 checks — the two MCP tools read the caller's site, and nothing else
node test-admin-cycle139.js                # 18 checks — the administrator check on the page's path
node test-csv-cycle139.js                  # 15 checks — the CSV is written in a copyable field
node test-mcp-admin-cycle140.js            # 17 checks — the SAME administrator check on the two MCP tools
node test-identite-cycle136.js             # 12 checks — 0 asApp() in the active code, and a refusal when the
                                          #            platform refuses the caller's identity
python3 tools/verifier-manifest-cycle134.py       # 18 checks — no public module, no egress, two read scopes,
                                                   #           one rovo:mcp module with two tools
python3 tools/contre-epreuve-verificateur.py      # 28 checks — that checker turns RED on 9 sabotages
python3 tools/verifier-notice-pv.py               #  5 checks — § 8 of PRIVACY.md quotes the code verbatim,
                                                   #           and there is exactly ONE privacy URL
```

`test-rules.js` needs two JSON files you can export from any Jira site you
administer: `GET /rest/api/3/field` and `POST /rest/api/3/search/jql` (16 checks
— it is not part of `npm test` for that reason).

`test-contrat-http-contre-epreuve.js` and `test-contre-epreuve.js` are
counter-proof suites: they break the product on purpose and require the test
harness to fail — **by naming the broken check**, because a suite that fails by
crashing would prove nothing. `test-ihm-cycle129.js` does the same for the
interface (8 sabotages: a trigger reintroduced, a write scope, an egress, a raw
HTML tag, a French message, an MCP tool pointing at a missing action, a second
MCP server, an over-long action description) and
`tools/contre-epreuve-verificateur.py` does it for the manifest checker
(9 sabotages). `test-mcp-cycle134.js` does it for the two tools (6 sabotages:
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
tools/            the manifest checker (and its counter-proof) and the check that
                  the privacy notice quotes the code verbatim
PRIVACY.md        the privacy notice (what is read, where it goes, how long it is kept)
test-*.js         the offline harness (314 checks in eleven suites, plus 51 checks
                  in the three tools of tools/)
```

One rule engine, two data sources, one interface. No data is stored, no content
is modified: the app reads and reports.

## Limitations, stated plainly

- The JSM branch of the scanner is written and deployed but was never executed
  against a licensed JSM site: the test site used for measurement reports
  `isLicensedForUse: false`. The Jira-fallback branch is the one measured live.
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

## Contest entry and Marketplace listing — state on 9 November 2026

* **Codegeist 2026**: this app is entered in the category *Apps for Business
  Teams*, and for **one** bonus prize: **Best app with Atlassian MCP** — the
  manifest declares one `rovo:mcp` module, deployed in production since 2.6.0,
  exposing the two read-only tools described above. The second prize of the
  rules, *Best Marketplace published app*, is **not** claimed: the rules open it
  to an app "published to the Marketplace or submitted for listing" and ask for
  the link to the listing or to the Marketplace review ticket, and **neither
  exists yet** — no listing, no review ticket. The same decision is written in
  the same places: the `BONUS` block of the submission text and the owner's
  checklist.
* **Marketplace**: the app is **not published** and has **no listing**. Sharing
  is enabled so the judges can install it, but a listing is a separate, human
  step (partner profile, then listing, then review submission). Until that
  exists the app is **free** and its revenue is **0 $**.
* **Demonstration video**: **none is published yet**. The rules ask for a public
  YouTube video of the version the judges will install; the capture plan — site,
  version, the six shots, and what is needed to film — is written in
  [`PLAN-CAPTURE-VIDEO.md`](PLAN-CAPTURE-VIDEO.md). The offline-built 2.5.0
  video is **not** a demonstration of this version and is not published as one.

## Privacy notice

**https://labs.chiffreo.ch/privacy.html** — the single published privacy URL of
this app. The same text is in [PRIVACY.md](PRIVACY.md) in this repository.

## License

MIT — see [LICENSE](LICENSE).
