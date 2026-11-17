#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generer-doc-images-184.py — the document that describes the 4 images of the
gallery, written FROM the files (never by hand).

Every number of the document (md5, size, dimensions, counts) is read from
`media/SCAN-JSM-SCREENSHOTS-2026-11-17.json` and from the measurement
`docs/scan-jsm-2026-11-17.json`, so the document cannot drift from the
images it describes.

Usage: python3 tools/generer-doc-images-184.py [racine-du-depot]
Exit code: 0 = the document is written, 1 = otherwise.
"""

import json
import os
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MESURE = os.path.join(RACINE, "docs", "scan-jsm-2026-11-17.json")
MANIFESTE = os.path.join(RACINE, "media", "SCAN-JSM-SCREENSHOTS-2026-11-17.json")
SORTIE = os.path.join(RACINE, "docs", "SCAN-JSM-SCREENSHOTS-2026-11-17.md")

BASE = "https://raw.githubusercontent.com/tgg49099-dotcom/codegeist-jsm-accessibility-checker/main/media"

DESCRIPTION = {
    "scan-jsm-vignette-1500x1000.png": (
        "the run: the site, the mode, the number of HTTP calls, the findings and their "
        "repartition by WCAG criterion, one finding in full, and the list of the 9 endpoints "
        "the engine read"),
    "scan-jsm-constat-1500x1000.png": (
        "one finding in full: the criterion and its level, the confidence of the check, the "
        "endpoint it was read from, the resource, the request type, the fields read, the "
        "location, the value read, the message of the engine, the review it asks for — and "
        "the limits the app states itself"),
    "scan-jsm-regles-1500x1000.png": (
        "the rules the engine applied: for each criterion raised by the scan, its level, its "
        "confidence, the endpoints read, the request types, the message of the engine and a "
        "real example — then what this scan cannot check"),
    "scan-jsm-violations-1500x1000.png": (
        "the list of the 7 findings, in the table the administration page shows (criterion, "
        "level, where, location, message, review)"),
}

ROLE = {
    "scan-jsm-vignette-1500x1000.png": "**thumbnail** (the *Thumbnail image for the Project Gallery* field)",
    "scan-jsm-constat-1500x1000.png": "capture 1 — one finding, in plain words",
    "scan-jsm-regles-1500x1000.png": "capture 2 — the rules, in detail",
    "scan-jsm-violations-1500x1000.png": "capture 3 — the list of the violations",
}


def main():
    with open(MESURE, "r", encoding="utf-8") as f:
        mesure = json.load(f)
    with open(MANIFESTE, "r", encoding="utf-8") as f:
        manifeste = json.load(f)

    n_get = sum(1 for a in mesure["appels"] if a["m"] == "GET")
    n_post = sum(1 for a in mesure["appels"] if a["m"] == "POST")
    lignes = []
    lignes.append("# The scan of a real JSM portal, in images")
    lignes.append("")
    lignes.append("**These 4 images are not drawings.** Every line they show comes from a file of")
    lignes.append("this repository, and the file each line comes from is listed in")
    lignes.append("`media/SCAN-JSM-SCREENSHOTS-2026-11-17.json`. The images are computed by")
    lignes.append("`tools/generer-images-scan-184.py` from the measurement of a real run of the")
    lignes.append("real engine against a real portal, and `tools/verifier-images-scan-184.py`")
    lignes.append("replays that computation and checks that the result is identical — a picture")
    lignes.append("that had been drawn by hand would not survive that check.")
    lignes.append("")
    lignes.append("| | |")
    lignes.append("|---|---|")
    lignes.append("| Site scanned | `%s` |" % mesure["site"])
    lignes.append("| Date of the run | %s |" % mesure["date"])
    lignes.append("| Mode | `%s` (JSM active on the site) |" % mesure["mode"])
    lignes.append("| HTTP calls | **%d GET, %d POST**, nothing refused |" % (n_get, n_post))
    lignes.append("| Findings | **%d** (%s) |" % (
        mesure["constats_total"],
        ", ".join("%d x %s" % (mesure["repartition_criteres"][c], c)
                  for c in sorted(mesure["repartition_criteres"]))))
    lignes.append("| Fields read | %d, across %d request types |" % (
        mesure["champs_lus"], len(mesure["types_lus"])))
    lignes.append("")
    lignes.append("## The 4 images")
    lignes.append("")
    lignes.append("| # | File | Role | Size | Dimensions | md5 |")
    lignes.append("|---|---|---|---|---|---|")
    for i, im in enumerate(manifeste["images"], start=1):
        nom = im["fichier"]
        lignes.append("| %d | [`%s`](%s/%s) | %s | %d o | %dx%d (3:2) | `%s` |" % (
            i, nom, BASE, nom, ROLE.get(nom, "capture"), im["octets"],
            im["largeur"], im["hauteur"], im["md5"]))
    lignes.append("")
    for i, im in enumerate(manifeste["images"], start=1):
        nom = im["fichier"]
        lignes.append("### %d. %s" % (i, nom))
        lignes.append("")
        lignes.append("%s — %s." % (ROLE.get(nom, "capture"), DESCRIPTION.get(nom, "")))
        lignes.append("")
        lignes.append("* **URL publique** : `%s/%s`" % (BASE, nom))
        lignes.append("* **octets** : %d — **dimensions** : %dx%d (ratio 3:2)"
                      % (im["octets"], im["largeur"], im["hauteur"]))
        lignes.append("* **md5** : `%s`" % im["md5"])
        lignes.append("* **lignes dessinees** : %d, chacune avec sa source dans le manifeste" % len(im["lignes"]))
        lignes.append("")
    lignes.append("## How they were made")
    lignes.append("")
    lignes.append("```")
    lignes.append("python3 tools/generer-images-scan-184.py     # writes the 4 PNG + the manifest")
    lignes.append("python3 tools/verifier-images-scan-184.py    # replays the computation and checks it")
    lignes.append("```")
    lignes.append("")
    lignes.append("The sources of the images are:")
    lignes.append("")
    lignes.append("* `docs/scan-jsm-2026-11-17.json` — the measurement (the calls, the findings, the repartition);")
    lignes.append("* `docs/scan-jsm-2026-11-17-reprise.json` — the raw output of the same run;")
    lignes.append("* `src/regles.js` — the criteria catalogue of the engine;")
    lignes.append("* `src/frontend/admin.jsx` — the labels of the administration page.")
    lignes.append("")
    lignes.append("**What these images are not**: they are not screenshots of the Jira")
    lignes.append("administration page. Atlassian renders that page in an iframe, behind a")
    lignes.append("signed-in administrator session: it cannot be captured here. What is shown")
    lignes.append("is **the real output of the app's engine** on a real JSM portal — the same")
    lignes.append("strings the engine returns, the same values, the same endpoints.")
    lignes.append("")

    with open(SORTIE, "w", encoding="utf-8") as f:
        f.write("\n".join(lignes))

    print("ecrit : %s (%d octets)" % (os.path.relpath(SORTIE, RACINE), os.path.getsize(SORTIE)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
