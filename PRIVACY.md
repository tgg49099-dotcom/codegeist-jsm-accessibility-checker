# Privacy Notice — Portal Accessibility Checker for JSM

**App type:** Atlassian Forge app (Jira / Jira Service Management)
**App ID:** `33f1227e-0df1-4008-b181-ea9c50b116f5`
**Source code:** https://github.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker (MIT licence)
**Published notice:** https://labs.chiffreo.ch/privacy.html — this file is the same notice, kept in the
repository so that the behaviour it describes can be read in the code that implements it.

*Last updated: 5 November 2026.* This file is the local copy of the notice published on 4 November
2026 (https://labs.chiffreo.ch/privacy.html). It adds **two** things the published page does not
have — **§ 3, "Personal data sent to the trigger"**, which describes the HTTP contract introduced
with production version 2.2.0, and **§ 8, "The exact sentence displayed in the app"** — and puts
"Personal data" before "What the app stores". Everything else is the same notice. The HTTP contract
was re-measured on the production trigger of version **2.4.0** on 5 November 2026 (five calls: the
recognised channel, the field name with spaces around it, a repeated parameter, a form-urlencoded
body, and a call with no personal field at all).

---

## 1. What the app is

Portal Accessibility Checker for JSM is a **read-only** Atlassian Forge app. It reads the metadata of a
Jira Service Management customer portal and reports what it found against a set of WCAG 2.2 AA
criteria. It does not change, create or delete anything on your site.

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

## 3. Personal data

Two honest remarks about the content the app reads, and one about what a caller may send it.

**The content read from your site.** The title and the description of an issue can contain personal
data typed by the people who wrote it — for example a name or an e-mail address in a ticket title.
When the app reads the 20 most recent issues of the scanned projects, it therefore reads that content,
and an excerpt of it can appear in the scan result.

**The trigger URL is public.** The scan trigger is declared with `authentication: none`: the scan URL
is public, so anyone who has it can trigger a scan and read its result. Do not install the app on a
site whose issue titles contain personal data you would not want a stranger to be able to read.

**Personal data sent to the trigger.** The app does not create an account, does not ask for a name or
an e-mail address, and has no user profile. A caller may nevertheless put a name or an e-mail address
in the trigger request — for example `?nom=…&e-mail=…`. The app applies the following **HTTP
contract**, and never breaks it:

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
whatever the way it arrives: in the query parameters (the documented `{ [key]: string[] }` shape), in
the body (a JSON object, a JSON string, a `application/x-www-form-urlencoded` text or a Buffer), in
the HTTP headers, or in the raw trigger URL. The name of the field is read with **the spaces around
it ignored** (` nom ` is `nom`), and **every** value of a repeated parameter is collected, not only
the first one (`?nom=V1&nom=V2` masks both `V1` and `V2`). This was measured on the **production**
trigger of version 2.4.0: the recognised channel, the field name with spaces around it, a repeated
parameter and a form-urlencoded body all return the value masked, and none of them returns it in
clear text.

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
A scan is computed on the fly and the findings are returned in the response of the scan itself (JSON,
or CSV when the CSV format is requested). The `generatedAt` timestamp of a scan is part of that
response; it is not kept anywhere.

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

* You decide which portal and which request types are scanned. Nothing is scanned unless you ask for it.
* The app holds no data after the scan, so there is nothing to export and no data to delete.
* You can remove the app at any time from **Administration → Manage apps**.

## 8. The exact sentence displayed in the app

Every answer produced by the app — the JSON report and the demo report — carries this sentence in its
`privacy.statement` field:

> This app reads your site content through Atlassian read-only REST APIs, stores nothing, and sends
> nothing outside your Atlassian tenant. A name or e-mail address that it receives in the request is
> returned as a mask, never in clear text. The content it reads from your site is returned as it is,
> because that content is what it checks.

The sentence says exactly what the app does, and no more: the last sentence is the honest counterpart
of the first paragraph of § 3 — the content read from your site comes back unchanged, because it is
the content the app checks. The masking described above applies to the values **received in the
request**, not to the content of your site.

## 9. Contact

Questions, corrections or a request to stop processing can be raised as an issue in the public
repository: https://github.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker/issues

The source code of every line of the app is public under the MIT licence in the same repository, so
the behaviour described above can be read directly, not taken on trust.

---

Published by Tgg Labs — personal projects by Tgg, in Switzerland.
