# Portal Accessibility Checker for JSM

**An Atlassian Forge app that reads the customer-facing content of your Jira Service
Management site through the official REST APIs and reports WCAG 2.2 accessibility
findings — as findings to verify, never as a compliance verdict.**

| | |
|---|---|
| **Runs on** | Atlassian Forge — on Atlassian's infrastructure, inside your own site |
| **Price** | Free (hackathon prototype, Codegeist 2026) |
| **Data leaves your site** | No. The app declares **no egress at all** |
| **Personal data in the answer** | A `nom` or an `e-mail` **carried by the request** is masked, never in clear text. The content read from your site is returned **as it is** — it is what the app checks (see below) |
| **Permissions** | Read-only: `read:jira-work`, `read:servicedesk-request` |
| **App version** | 2.4.0 — deployed to the **production** environment on 2026-11-05 (14:16 UTC) |

## What it does

You call one web trigger URL. The app reads your site content through the product
REST APIs and answers with a timestamped JSON report: every piece of content it
read (`read.*`) and every accessibility finding it produced (`findings[]`).

The scanner probes Jira Service Management first (`GET /rest/servicedeskapi/info`).
If JSM is licensed on the site, it scans the customer portal content: request
types, their fields, help texts, article content. If JSM is not licensed
(`isLicensedForUse: false` — the exact situation of the test site this prototype
was measured on), the same rule engine automatically falls back to the Jira
equivalent: custom fields, field descriptions, create-screen metadata and issue
summaries. The report records which mode ran (`mode: "jsm"` or `mode:
"jira-fallback"`) and the raw probe result (`jsmProbe`), so nothing is claimed
that was not measured.

## The HTTP contract of the web trigger

The trigger is a public URL (`authentication: none`): anyone who has it can start a scan and read
its answer. A caller may put a name or an e-mail address in the request — `?nom=…&e-mail=…` — for
example to say who asked for the scan. The app never gives that value back in clear text.

**The rule, in one sentence: a value received in the `nom` or `e-mail` field of a request is never
returned in clear text — the answer carries a mask instead, and every value of a repeated parameter
is masked, whatever the channel it arrived in.**

| | |
|---|---|
| Fields watched | `nom` (alias `name`) and `e-mail` (aliases `email`, `e_mail`) |
| Where they are looked for | the query parameters (`{ [key]: string[] }`, the documented shape), the body (object, JSON, `application/x-www-form-urlencoded` text or Buffer), the HTTP headers, and the raw trigger URL. The name of the field is read with **the spaces around it ignored** (` nom ` is `nom`) |
| What comes back | a mask: `C***` for a name, `c***@***` for an e-mail address (first character only; the domain is never returned) |
| Absent field | **never invented** — no `null`, no empty string, no placeholder. `receivedFields` is empty and `maskedValues` is `{}` |
| Repeated parameter | **every** value is collected and masked, not only the first one (`?nom=V1&nom=V2` masks both) |
| Elsewhere in the answer | a received value of **3 characters or more is masked wherever it appears**, including in the content read from your site |
| Shorter values | a value of **less than 3 characters** is masked in `maskedValues` but cannot be masked throughout the answer without destroying the report — the answer says so in `privacy.limits` |
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

The rule is implemented in `src/index.js` (section *contrat HTTP*), and it is proved three times: by
an offline test suite (`node test-contrat-http.js`, 51 checks), by its counter-proof
(`node test-contrat-http-contre-epreuve.js`, 19 checks — the suite must turn **red** when the
contract is broken), and by **five calls to the production trigger** (version 2.4.0): the recognised
channel, the field name with spaces around it, a repeated parameter, a form-urlencoded body, and a
call with no personal field at all. The full notice is in [PRIVACY.md](PRIVACY.md).

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
"non-compliant". It produces *findings* (`critere`, `niveau`, `source`,
`ressource`, `emplacement`, `valeur`, `message`, `a_verifier`) that a human must
verify.

## Try it without any site: the demo mode

The same entry point runs the **same rule engine** (`src/regles.js`) against six
documented fixture files (`src/demo/`) — no account, no site, no tenant:

```
?demo=1
```

The fixtures contain 23 seeded faults and 6 negative controls. The offline
harness (below) asserts 23/23 faults detected and 0 false positives on the
controls.

## Run the tests (offline, no Atlassian account needed)

```
npm install
node test-demo.js                  # 55 checks — demo fixtures: 23/23 faults, 0 false positives
node test-app-demo.js              # 33 checks — the app entry point returns the 23/23 verdict
node test-contre-epreuve.js        # 13 checks — the harness turns RED when a rule is sabotaged
node test-contrat-http.js          # 51 checks — the HTTP contract (masking, absent fields, logs)
node test-contrat-http-contre-epreuve.js   # 19 checks — that harness turns RED when the contract is broken
node test-rules.js <fields.json> <issues.json>   # 16 checks — live-site rule behaviour (see below)
```

`test-rules.js` needs two JSON files you can export from any Jira site you
administer: `GET /rest/api/3/field` and `POST /rest/api/3/search/jql`.
`test-demo.js` and `test-contre-epreuve.js` have no dependency at all;
`test-app-demo.js`, `test-contrat-http.js` and their counter-proof need
`@forge/api` present (they load the real app entry point), which `npm install`
provides.

`test-contre-epreuve.js` is a counter-proof suite: it breaks the rule engine on
purpose and requires the test harness to fail — a green suite that cannot turn
red proves nothing, so the ability to fail is itself tested.
`test-contrat-http-contre-epreuve.js` does the same for the HTTP contract: it
sabotages the app six ways (mask removed, body sweep disabled, absent fields
invented, request ignored, the displayed sentence made stronger than the code,
site content masked) and requires the contract suite to fail **by naming
the broken check** — a suite that fails by crashing would prove nothing.

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
forge webtrigger create -f scan-trigger -s <your-site>.atlassian.net -p jira -e production
```

The last command prints the URL to call. The response is the JSON report.

## Architecture

```
manifest.yml      1 webtrigger (scan-trigger, urlFormat v2, dynamic response)
                  1 function    (scan-fn -> src/index.js)
src/index.js      entry point: JSM probe, mode selection, REST reads, findings,
                  and the HTTP contract (masking of the personal data received)
src/regles.js     the WCAG 2.2 rule engine — pure functions, zero Atlassian imports,
                  shared by the live scan and the demo mode
src/demo.js       demo mode driver over src/demo/*.json fixtures
docs/             the criterion-by-criterion basis (French), incl. what REST can prove
scripts/          appel-webtrigger.sh — the two production calls (red case, green case)
PRIVACY.md        the privacy notice (what is read, where it goes, how long it is kept)
test-*.js         offline harness (171 checks across the five suites that need no
                  site export; test-rules.js adds 16 more and needs two JSON exports)
```

One rule engine, two data sources. No data is stored, no content is modified:
the app reads and reports.

## Limitations, stated plainly

- The JSM branch of the scanner is written and deployed but was never executed
  against a licensed JSM site: the test site used for measurement reports
  `isLicensedForUse: false`. The Jira-fallback branch is the one measured live.
- Partial criteria produce *signals to verify*, not proof — the finding itself
  says which of the two it is.
- The report is machine-readable JSON; there is no UI panel in this prototype.
- One limit of the HTTP contract, stated rather than hidden: a personal value of
  **less than 3 characters** is masked in the `privacy` block, but cannot be masked
  throughout the answer without destroying the report. The answer repeats that limit
  in `privacy.limits` on every call.
- The masking covers the values **received in the request**. The content read from
  your site is returned **as it is** — a ticket title or a field label that happens
  to contain a name is part of the report, because it is the content the app checks.
  The app says so in its `privacy.statement` on every call, and
  [PRIVACY.md](PRIVACY.md) § 3 spells it out.

## License

MIT — see [LICENSE](LICENSE).
