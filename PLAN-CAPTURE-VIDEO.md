# The demonstration video — capture plan

**Written on 9 November 2026. This plan is not the video: it says what has to be filmed, where, on
which version, and what is needed to do it. Nothing has been filmed here, nothing has been
published.**

## 1. Why it exists

The contest rules require a **demonstration video**: less than five minutes, uploaded and
**public on YouTube**, with the link pasted into the submission form.

The video that exists in this repository (`VIDEO-SOUTENANCE-2.5.0.mp4`, 144.8 s) was **built
offline** from the 2.5.0 source: it replays the 2.5.0 screen, not the screen of the version the
judges will install. A picture compared with a reference built the same way proves the
resemblance, not the behaviour.

⇒ **The 2.5.0 file must not be published as the demonstration video.** A real capture is needed,
made by a person, on the deployed version.

## 2. What has to be filmed, in this order

| # | What is on the screen | What it proves |
|---|---|---|
| 1 | `https://tgg-dev.atlassian.net` → Jira → *Settings (gear) → Apps → Portal Accessibility Checker for JSM* | the page is rendered by Jira, in the administration area |
| 2 | the **Run the scan** button pressed, then the page reading the site | the **real** scan, on a **real** site |
| 3 | the findings table (criterion, level, where, message, "human review" / "automatic") | the findings actually produced |
| 4 | the **Run the demo scan (no site needed)** button → 23 findings | the same engine runs without a site |
| 5 | the version, in a caption or in the voice-over | the filmed version is the installed version |

> The export step is **not** in the script: the real click has never been observed in this
> container, so the video does not promise it. If it is ever filmed, it is filmed as it is seen.

## 3. The site, the version, the account

- **Site**: `https://tgg-dev.atlassian.net`. That is where the app is installed **in production**
  (`forge install list -e production --json` returns two installations — `development` and
  `production` — on that site, `majorVersion: 2 (Latest)`, status `Up-to-date`).
- **Version to film**: **the version live in production on the day of the capture**, and it must be
  **announced on screen or in the voice-over**. On 10 November 2026 that is **2.8.0** (the
  server-side administrator check on the two MCP tools), version id
  `09201e49-daac-48f6-bf92-c1c73e01ffcc`. If production has moved since,
  the Platform API (`api.atlassian.com/graphql`, `app(id:)` → `environmentsPage`) is the
  authority — it answers `isLatest: true` for the version that is really served.
- **Account**: a **Jira administrator** of that site. The scan is **refused** to a signed-in
  non-administrator — that is the intended behaviour, and it is worth one sentence in the
  voice-over.
- **Language**: English. If the narration is not in English, English subtitles are required.

## 4. What is needed to film it (nothing to pay for)

- **a Windows desktop agent** — this container has neither a browser nor a screen, so the capture
  cannot be made from here;
- a browser (Chrome or Edge) and a screen recorder (the Windows Game Bar, `Win+G`, or OBS Studio);
- the Jira session open on `tgg-dev.atlassian.net`, as an administrator;
- five minutes of preparation, less than five minutes of video.

## 5. The workshop relay — measured, not assumed

Probe on 9 November 2026, `curl -s -o /dev/null -w '%{http_code}' --max-time 10`:

| Address | HTTP code | What it means |
|---|---|---|
| `http://172.30.1.1:8787/` | **000** (curl exits 28, timed out) | no response at all |
| `http://172.30.2.1:8787/` | **404** (`Server: nginx/1.24.0 (Ubuntu)`) | the port answers, but an nginx answers 404 on **every** path (`/`, `/health`, `/status`, `/video`, `/index.html`): nothing is served |
| `172.30.3.1`, `172.30.4.1`, `172.30.5.1` : 8787 | **404** | same |
| `172.30.6.1` … `172.30.12.1` : 8787 | **000** | no response |

⇒ **The workshop relay cannot be used to host the capture**: where the port answers, it is a 404
from nginx, and where it does not answer, it is a timeout.

## 6. What is not done here

- nothing is uploaded to YouTube;
- nothing is filmed (no browser, no screen, no Jira session in this container);
- no claim that a video exists: until it is online, the submission text says "no video yet".
