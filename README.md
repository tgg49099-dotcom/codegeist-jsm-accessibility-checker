# Portal Accessibility Checker for JSM

**An Atlassian Forge app that reads the customer-facing content of your Jira Service
Management site through the official REST APIs and reports WCAG 2.2 accessibility
findings — as findings to verify, never as a compliance verdict.**

| | |
|---|---|
| **Runs on** | Atlassian Forge — on Atlassian's infrastructure, inside your own site |
| **Price** | Free (hackathon prototype, Codegeist 2026) |
| **Data leaves your site** | No. The app declares **no egress at all** |
| **Permissions** | Read-only: `read:jira-work`, `read:servicedesk-request` |
| **App version** | 2.1.0 — deployed to the **production** environment on 2026-11-04 |

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
node test-rules.js <fields.json> <issues.json>   # 16 checks — live-site rule behaviour (see below)
```

`test-rules.js` needs two JSON files you can export from any Jira site you
administer: `GET /rest/api/3/field` and `POST /rest/api/3/search/jql`.
`test-demo.js` and `test-contre-epreuve.js` have no dependency at all;
`test-app-demo.js` needs `@forge/api` present (it loads the real app entry
point), which `npm install` provides.

`test-contre-epreuve.js` is a counter-proof suite: it breaks the rule engine on
purpose and requires the test harness to fail — a green suite that cannot turn
red proves nothing, so the ability to fail is itself tested.

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
src/index.js      entry point: JSM probe, mode selection, REST reads, findings
src/regles.js     the WCAG 2.2 rule engine — pure functions, zero Atlassian imports,
                  shared by the live scan and the demo mode
src/demo.js       demo mode driver over src/demo/*.json fixtures
docs/             the criterion-by-criterion basis (French), incl. what REST can prove
test-*.js         offline harness (117 checks total across the four suites)
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

## License

MIT — see [LICENSE](LICENSE).
