#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
contre-epreuve-notice.py — the counter-proof of the notice checker.

WHY THIS FILE
----------------
A checker that says "everything passes" proves nothing until we have shown
that it KNOWS how to say no. This script sabotages the notice (and the README)
in four ways and requires that `tools/verifier-notice-pv.py`:

  1. exits with the code 1 (failure);
  2. names the broken check on a "FAIL" line (a plain crash would not count:
     a harness that crashes also reports a failure, and it would therefore
     validate a broken product);
  3. does not crash (no Python traceback in the output).

It also checks the opposite case: on the REAL documents, the checker
must exit with 0.

Usage: python3 tools/contre-epreuve-notice.py
Exit code: 0 = the counter-proof is good, 1 = it failed.
"""

import os
import re
import shutil
import subprocess
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERIF = os.path.join(RACINE, "tools", "verifier-notice-pv.py")
PY = sys.executable or "python3"

FICHiers = ("README.md", "PRIVACY.md")
SOUS_DOSSIER = "src"


def lire(chemin):
    with open(chemin, "r", encoding="utf-8") as f:
        return f.read()


def ecrire(chemin, texte):
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(texte)


def preparer(racine_de_test):
    """Copies the three files the checker needs."""
    os.makedirs(os.path.join(racine_de_test, SOUS_DOSSIER), exist_ok=True)
    for nom in FICHiers:
        shutil.copyfile(
            os.path.join(RACINE, nom), os.path.join(racine_de_test, nom)
        )
    shutil.copyfile(
        os.path.join(RACINE, SOUS_DOSSIER, "index.js"),
        os.path.join(racine_de_test, SOUS_DOSSIER, "index.js"),
    )
    return racine_de_test


# Each sabotage: (name, target file, transformation, check that must turn red)
SABOTAGES = [
    (
        "a second copy of the notice is cited in the README",
        "README.md",
        lambda s: s.replace(
            "https://labs.chiffreo.ch/privacy.html",
            "https://labs.chiffreo.ch/privacy.html https://labs.chiffreo.ch/privacy-v2.html",
            1,
        ),
        "NOTICE-04",
    ),
    (
        "an unauthorized URL (which is not a copy of the notice) is cited",
        "PRIVACY.md",
        lambda s: s.replace(
            "https://labs.chiffreo.ch/privacy.html",
            "https://labs.chiffreo.ch/privacy.html https://exemple.fr/autre-page.html",
            1,
        ),
        "NOTICE-04",
    ),
    (
        "the published page disappears from the notice",
        "PRIVACY.md",
        # all occurrences: the notice cited the published page in two
        # places, both of them have to be removed.
        lambda s: s.replace("https://labs.chiffreo.ch/privacy.html", ""),
        "NOTICE-04",
    ),
    (
        "the § 8 sentence drifts from the PHRASE_PV constant",
        "PRIVACY.md",
        lambda s: re.sub(
            r"(##\s*8\..*?\n\n> )(.*?)(\n\n)",
            lambda m: m.group(1) + m.group(2).replace("stores nothing", "keeps a copy", 1) + m.group(3),
            s,
            count=1,
            flags=re.S,
        ),
        "NOTICE-03",
    ),
]

echecs = []


def dire(ok, libelle, detail=""):
    print(("PASS" if ok else "FAIL") + "  " + libelle + (("  ->  " + detail) if detail else ""))
    if not ok:
        echecs.append(libelle)


def lancer(racine_de_test):
    proc = subprocess.run(
        [PY, VERIF, racine_de_test],
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stdout, proc.stderr


def main():
    # --- 1. the real documents: the checker must be green ------------
    rc, out, err = lancer(RACINE)
    dire(rc == 0, "the verifier accepts the real documents (RC 0)", "RC=%d" % rc)
    dire("Traceback" not in err, "the verifier does not crash on the real documents")
    if rc != 0:
        print(out)

    # --- 2. the sabotages: the checker must turn red -------------
    base = os.path.join(RACINE, "tools", ".contre-epreuve-notice")
    shutil.rmtree(base, ignore_errors=True)
    os.makedirs(base, exist_ok=True)

    for i, (nom, fichier, mutation, attendu) in enumerate(SABOTAGES):
        racine_de_test = os.path.join(base, "cas-%d" % i)
        preparer(racine_de_test)
        chemin = os.path.join(racine_de_test, fichier)
        original = lire(chemin)
        sabotage = mutation(original)
        if sabotage == original:
            dire(False, "sabotage '%s': the mutation changed nothing" % nom)
            continue
        ecrire(chemin, sabotage)
        rc, out, err = lancer(racine_de_test)
        rouge = re.search(r"^FAIL\s+" + re.escape(attendu) + r"\b", out, re.M) is not None
        plante = "Traceback" in err or "Traceback" in out
        dire(rc == 1, "sabotage '%s': the verifier exits with RC 1" % nom, "RC=%d" % rc)
        dire(rouge, "sabotage '%s': the %s control is named in a FAIL line" % (nom, attendu))
        dire(not plante, "sabotage '%s': the verifier did not crash" % nom)
        if not rouge:
            print("--- verifier output ---")
            print(out)

    shutil.rmtree(base, ignore_errors=True)

    print("")
    if echecs:
        print("== %d FAILURE(S): the verifier is not reliable ==" % len(echecs))
        return 1
    print("== ALL PASS: the verifier is GREEN on the real documents and RED on each sabotage ==")
    return 0


if __name__ == "__main__":
    sys.exit(main())
