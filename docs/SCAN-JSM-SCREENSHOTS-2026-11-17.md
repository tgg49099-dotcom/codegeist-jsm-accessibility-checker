# The scan of a real JSM portal, in images

**These 4 images are not drawings.** Every line they show comes from a file of
this repository, and the file each line comes from is listed in
`media/SCAN-JSM-SCREENSHOTS-2026-11-17.json`. The images are computed by
`tools/generer-images-scan-184.py` from the measurement of a real run of the
real engine against a real portal, and `tools/verifier-images-scan-184.py`
replays that computation and checks that the result is identical — a picture
that had been drawn by hand would not survive that check.

| | |
|---|---|
| Site scanned | `https://tgg-dev.atlassian.net` |
| Date of the run | 2026-11-17 |
| Mode | `jsm` (JSM active on the site) |
| HTTP calls | **9 GET, 0 POST**, nothing refused |
| Findings | **7** (1 x 1.3.5, 6 x 3.3.2) |
| Fields read | 23, across 5 request types |

## The 4 images

| # | File | Role | Size | Dimensions | md5 |
|---|---|---|---|---|---|
| 1 | [`scan-jsm-vignette-1500x1000.png`](https://raw.githubusercontent.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker/main/media/scan-jsm-vignette-1500x1000.png) | **thumbnail** (the *Thumbnail image for the Project Gallery* field) | 127122 o | 1500x1000 (3:2) | `6310a0c4b048de8101798fd14648a8bf` |
| 2 | [`scan-jsm-constat-1500x1000.png`](https://raw.githubusercontent.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker/main/media/scan-jsm-constat-1500x1000.png) | capture 1 — one finding, in plain words | 114442 o | 1500x1000 (3:2) | `271a89b451206d467ab81a9565f32c4d` |
| 3 | [`scan-jsm-regles-1500x1000.png`](https://raw.githubusercontent.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker/main/media/scan-jsm-regles-1500x1000.png) | capture 2 — the rules, in detail | 143420 o | 1500x1000 (3:2) | `e5e1fd13d8481db8e8260ee7e49b1e6f` |
| 4 | [`scan-jsm-violations-1500x1000.png`](https://raw.githubusercontent.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker/main/media/scan-jsm-violations-1500x1000.png) | capture 3 — the list of the violations | 121226 o | 1500x1000 (3:2) | `c1adf4d5140210365b5e4d6db21b1500` |

### 1. scan-jsm-vignette-1500x1000.png

**thumbnail** (the *Thumbnail image for the Project Gallery* field) — the run: the site, the mode, the number of HTTP calls, the findings and their repartition by WCAG criterion, one finding in full, and the list of the 9 endpoints the engine read.

* **URL publique** : `https://raw.githubusercontent.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker/main/media/scan-jsm-vignette-1500x1000.png`
* **octets** : 127122 — **dimensions** : 1500x1000 (ratio 3:2)
* **md5** : `6310a0c4b048de8101798fd14648a8bf`
* **lignes dessinees** : 31, chacune avec sa source dans le manifeste

### 2. scan-jsm-constat-1500x1000.png

capture 1 — one finding, in plain words — one finding in full: the criterion and its level, the confidence of the check, the endpoint it was read from, the resource, the request type, the fields read, the location, the value read, the message of the engine, the review it asks for — and the limits the app states itself.

* **URL publique** : `https://raw.githubusercontent.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker/main/media/scan-jsm-constat-1500x1000.png`
* **octets** : 114442 — **dimensions** : 1500x1000 (ratio 3:2)
* **md5** : `271a89b451206d467ab81a9565f32c4d`
* **lignes dessinees** : 35, chacune avec sa source dans le manifeste

### 3. scan-jsm-regles-1500x1000.png

capture 2 — the rules, in detail — the rules the engine applied: for each criterion raised by the scan, its level, its confidence, the endpoints read, the request types, the message of the engine and a real example — then what this scan cannot check.

* **URL publique** : `https://raw.githubusercontent.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker/main/media/scan-jsm-regles-1500x1000.png`
* **octets** : 143420 — **dimensions** : 1500x1000 (ratio 3:2)
* **md5** : `e5e1fd13d8481db8e8260ee7e49b1e6f`
* **lignes dessinees** : 44, chacune avec sa source dans le manifeste

### 4. scan-jsm-violations-1500x1000.png

capture 3 — the list of the violations — the list of the 7 findings, in the table the administration page shows (criterion, level, where, location, message, review).

* **URL publique** : `https://raw.githubusercontent.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker/main/media/scan-jsm-violations-1500x1000.png`
* **octets** : 121226 — **dimensions** : 1500x1000 (ratio 3:2)
* **md5** : `c1adf4d5140210365b5e4d6db21b1500`
* **lignes dessinees** : 26, chacune avec sa source dans le manifeste

## How they were made

```
python3 tools/generer-images-scan-184.py     # writes the 4 PNG + the manifest
python3 tools/verifier-images-scan-184.py    # replays the computation and checks it
```

The sources of the images are:

* `docs/scan-jsm-2026-11-17.json` — the measurement (the calls, the findings, the repartition);
* `docs/scan-jsm-2026-11-17-reprise.json` — the raw output of the same run;
* `src/regles.js` — the criteria catalogue of the engine;
* `src/frontend/admin.jsx` — the labels of the administration page.

**What these images are not**: they are not screenshots of the Jira
administration page. Atlassian renders that page in an iframe, behind a
signed-in administrator session: it cannot be captured here. What is shown
is **the real output of the app's engine** on a real JSM portal — the same
strings the engine returns, the same values, the same endpoints.
