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
| **App version in this repository** | 2.5.0 — the code deployed to the **production** environment on 7 November 2026 (02:20 UTC). The development environment runs 2.8.0 |

## What it does

You open **Administration → Apps → Portal Accessibility Checker for JSM**, and you
press **Run the scan**. The page reads your site content through the product REST
APIs and shows the findings **in the page**, with a CSV export button
(**Download the findings as CSV**).

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
administration area, **only for a signed-in administrator**. The scan is behind a
`function` module (`resolver`) that refuses any call which carries no signed-in
account — an anonymous visitor gets a refusal, never a report.

`manifest.yml` declares **exactly two modules** and nothing else:

```yaml
modules:
  jira:adminPage:                 # the interface (render: native, resource: admin)
    - key: pac-jsm-admin-page
      ...
  function:                       # the only code path to the scan
    - key: resolver
      handler: resolvers.handler
```

There is no `webtrigger`, no `productTrigger`, no `scheduleTrigger`, no `external`
(egress) block and no domain wildcard. That is checkable by reading the manifest:

```
python3 tools/verifier-manifest-cycle128.py     # 10 checks, RC 0
python3 tools/contre-epreuve-verificateur.py     # the checker must turn RED on 4 sabotages
```

**Measured on 7 November 2026**, on both environments:

* `forge version details -e production --json` and `-e development --json` both
  report `egresses: []`, `remotes: []`, `services: []`, the two read scopes, one
  `jira:adminPage` module and one `function` module — **no trigger module in
  either environment**;
* the two URLs of the former public trigger answer **HTTP 424 Failed Dependency**
  with 157 bytes and no scan data (they are no longer routable);
* an anonymous request to the administration URL returns the Atlassian sign-in
  shell: 0 occurrence of the app name, 0 occurrence of the button, no finding.

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
node test-ihm-cycle129.js                 # 35 checks — the interface replaces the public trigger
node test-contrat-http.js                 # 59 checks — the privacy contract (masking, absent fields, logs)
node test-app-demo.js                     # 22 checks — the resolver returns the 23/23 verdict
node test-demo.js                         # 55 checks — demo fixtures: 23/23 faults, 0 false positives
node test-contre-epreuve.js               # 13 checks — the harness turns RED when a rule is sabotaged
node test-contrat-http-contre-epreuve.js  # 28 checks — that harness turns RED when the contract is broken
python3 tools/verifier-manifest-cycle128.py       # 10 checks — no public module, no egress, two read scopes
python3 tools/contre-epreuve-verificateur.py      # 13 checks — that checker turns RED on 4 sabotages
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
interface (5 sabotages: a trigger reintroduced, a write scope, an egress, a raw
HTML tag, a French message) and `tools/contre-epreuve-verificateur.py` does it
for the manifest checker.

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
                  1 function       (resolver -> src/resolvers.js)
src/resolvers.js  the only entry point: it checks the caller's account id
                  (backendRuntimePayload.principal.accountId or context.accountId),
                  refuses a call without one, and calls the engine
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
test-*.js         the offline harness (212 checks in six suites, plus 41 checks
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

## Privacy notice

**https://labs.chiffreo.ch/privacy.html** — the single published privacy URL of
this app. The same text is in [PRIVACY.md](PRIVACY.md) in this repository.

## License

MIT — see [LICENSE](LICENSE).
