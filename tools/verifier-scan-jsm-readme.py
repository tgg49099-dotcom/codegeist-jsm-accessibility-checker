#!/usr/bin/env python3
"""Checks that the README and the evidence files quote the MEASURED scan, and
that neither of them says that no video is published.

Inputs (no network):
  - docs/scan-jsm-2026-11-17.json   the measurement (engine report + counter-proof)
  - README.md                       the public description
  - docs/SCAN-JSM-2026-11-17.md     the dated evidence file
  - PLAN-CAPTURE-VIDEO.md           the capture plan (the dated block is appended)
  - an optional Devpost kit (the frozen pack), to check the same video claim

Every number checked here is READ from the measurement: the verifier does not
know what the scan found, it only checks that what the README says about it is
what the measurement says. That is why it goes RED on the previous README.

Usage:
  python3 tools/verifier-scan-jsm-readme.py [RACINE_REPO] [KIT_DEVPNOST]
"""
import json
import os
import re
import sys

RACINE = sys.argv[1] if len(sys.argv) > 1 else "."
KIT = sys.argv[2] if len(sys.argv) > 2 else ""

fails = 0


def check(label, ok, detail=""):
    global fails
    if not ok:
        fails += 1
    print("%s  %s%s" % ("PASS" if ok else "FAIL", label, ("  ->  " + str(detail)) if detail else ""))


def lire(rel):
    with open(os.path.join(RACINE, rel), encoding="utf-8") as f:
        return f.read()


preuve = json.loads(lire("docs/scan-jsm-2026-11-17.json"))
readme = lire("README.md")
md = lire("docs/SCAN-JSM-2026-11-17.md")
plan = lire("PLAN-CAPTURE-VIDEO.md")

# Les retours a la ligne du markdown coupent les phrases : on compare sur un
# texte "a plat" (espaces uniques), sinon un controle peut echouer sur un texte
# correct.
def aplatir(t):
    return re.sub(r"\s+", " ", t)


readme_plat = aplatir(readme)
md_plat = aplatir(md)

total = preuve["constats_total"]
repartition = preuve["repartition_criteres"]
par_passage = preuve["par_passage"]

# --- 1. le README cite le total, la date, le mode et les appels ------------
check("README: the number of findings is the measured one (%d)" % total,
      ("%d findings" % total) in readme_plat)
check("README: the measurement date is written", "17 November 2026" in readme_plat)
check("README: the JSM mode is named", "**JSM** mode" in readme_plat)
n_get = len([a for a in preuve["appels"] if a["m"] == "GET"])
n_post = len([a for a in preuve["appels"] if a["m"] == "POST"])
check("README: the number of GET requests is the measured one (%d)" % n_get,
      ("%d GET requests" % n_get) in readme_plat)
check("README: the refusals are stated as zero", "0 refused" in readme_plat)
check("README: no POST is claimed", ("%d POST" % n_post) not in readme_plat)

# --- 2. le README cite la repartition par critere, avec le BON nombre ------
for crit, n in sorted(repartition.items()):
    trouve = re.search(r"(\d+)\s*×\s*(?:criterion\s+)?%s" % re.escape(crit), readme_plat)
    ok = bool(trouve) and int(trouve.group(1)) == n
    check("README: criterion %s is cited with its measured count (%d)" % (crit, n), ok,
          "trouve: " + (trouve.group(0) if trouve else "rien"))

# --- 3. le README cite le passage (les types de requete) --------------------
for ressource, n in sorted(par_passage.items()):
    nom = ressource.split(" > ", 1)[1]
    if n == 0:
        continue
    trouve = re.search(re.escape(nom) + r"\s*\(?%d\)?" % n, readme_plat)
    check("README: the request type '%s' is cited with its measured count (%d)" % (nom, n), bool(trouve))

# --- 4. le README ne dit plus que la branche JSM n'a jamais ete executee ---
# On n'interdit pas la CHAINE "isLicensedForUse: false" : elle explique legitinement
# le repli Jira. Ce qu'on interdit, c'est l'AFFIRMATION FAUSSE d'avant.
interdits = [
    "was never executed",
    "the test site used for measurement reports",
    "the exact situation of the test site this prototype was measured on",
]
for phrase in interdits:
    check("README: the false claim %r is gone" % phrase, phrase not in readme_plat,
          "occurrences: %d" % readme_plat.count(phrase))
check("README: the README now states that the site reports isLicensedForUse: true",
      "reports `isLicensedForUse: true`" in readme_plat)

# --- 5. la video : l'URL est la, la phrase 'aucune video publiee' a disparu --
VIDEO_URL = "https://youtu.be/JAEoj9jpHMg"
check("README: the public video URL is written", VIDEO_URL in readme_plat)
check("README: the phrase 'none is published yet' is gone",
      "none is published yet" not in readme_plat.lower(),
      "occurrences: %d" % readme_plat.lower().count("none is published yet"))
check("PLAN: the dated block gives the public video URL", VIDEO_URL in plan)
check("PLAN: the plan itself is kept (its own 9 November statement is still there)",
      "nothing is uploaded to YouTube" in plan and "no video yet" in plan)

# --- 6. le fichier de preuve date dit la meme chose que la mesure -----------
check("evidence: the total is the measured one", ("**%d**" % total) in md_plat or ("%d constats" % total) in md_plat)
for crit, n in sorted(repartition.items()):
    trouve = re.search(r"(\d+)\s*×\s*%s" % re.escape(crit), md_plat)
    ok = bool(trouve) and int(trouve.group(1)) == n
    check("evidence: criterion %s is cited with its measured count (%d)" % (crit, n), ok)
for t in preuve["types_lus"]:
    n = par_passage.get("Support > %s" % t["nom"], 0)
    trouve = re.search(r"\|\s*%s\s*\|\s*%d\s*\|" % (re.escape(t["nom"]), n), md_plat)
    check("evidence: the request type '%s' is cited with its measured count (%d)" % (t["nom"], n),
          bool(trouve))
check("evidence: the evidence file points at the machine-readable twin",
      "docs/scan-jsm-2026-11-17.json" in md_plat)

# --- 7. le README pointe vers le fichier de preuve -------------------------
check("README: the evidence file is linked", "docs/SCAN-JSM-2026-11-17.md" in readme_plat)
check("README: the evidence file exists on disk",
      os.path.isfile(os.path.join(RACINE, "docs", "SCAN-JSM-2026-11-17.md")))

# --- 8. le kit Devpost (optionnel) : meme contrat pour la video ------------
if KIT:
    try:
        kit = open(KIT, encoding="utf-8").read()
    except OSError as e:
        check("kit: the file can be read", False, e)
        kit = ""
    if kit:
        check("kit: the public video URL is written", VIDEO_URL in kit)
        check("kit: the placeholder URL_YOUTUBE_A_REMPLIR is gone",
              "URL_YOUTUBE_A_REMPLIR" not in kit)
        check("kit: the 'TO BE COMPLETED BY THE OWNER' notes are gone",
              "TO BE COMPLETED BY THE OWNER" not in kit)
        check("kit: the signed installation link is intact",
              "developer.atlassian.com/console/install/" in kit and "signature=" in kit)

print("VERDICT: %s" % ("GREEN" if fails == 0 else "RED"))
sys.exit(0 if fails == 0 else 1)
