#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
contre-epreuve-notice.py — la contre-epreuve du verificateur de notice.

POURQUOI CE FILE
----------------
Un verificateur qui dit « tout passe » ne prouve rien tant qu'on n'a pas montre
qu'il SAIT dire non. Ce script sabotage la notice (et le README) de quatre
facons et exige que `tools/verifier-notice-pv.py` :

  1. sorte avec le code 1 (echec) ;
  2. nomme le controle casse sur une ligne « FAIL » (un simple plantage ne
     compterait pas : un harnais qui crash signale aussi un echec, et il
     validerait donc un produit casse) ;
  3. ne plante pas (aucune trace Python dans la sortie).

Il controle aussi le cas inverse : sur les documents REELS, le verificateur
doit sortir avec 0.

Usage : python3 tools/contre-epreuve-notice.py
Code de sortie : 0 = la contre-epreuve est bonne, 1 = elle a echoue.
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
    """Copie les trois fichiers dont le verificateur a besoin."""
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


# Chaque sabotage : (nom, fichier vise, transformation, controle qui doit etre rouge)
SABOTAGES = [
    (
        "une seconde copie de la notice est citee dans le README",
        "README.md",
        lambda s: s.replace(
            "https://labs.chiffreo.ch/privacy.html",
            "https://labs.chiffreo.ch/privacy.html https://labs.chiffreo.ch/privacy-v2.html",
            1,
        ),
        "NOTICE-04",
    ),
    (
        "une URL non autorisee (qui n'est pas une copie de la notice) est citee",
        "PRIVACY.md",
        lambda s: s.replace(
            "https://labs.chiffreo.ch/privacy.html",
            "https://labs.chiffreo.ch/privacy.html https://exemple.fr/autre-page.html",
            1,
        ),
        "NOTICE-04",
    ),
    (
        "la page publiee disparait de la notice",
        "PRIVACY.md",
        # toutes les occurrences : la notice citait la page publiee a deux
        # endroits, il faut les enlever tous les deux.
        lambda s: s.replace("https://labs.chiffreo.ch/privacy.html", ""),
        "NOTICE-04",
    ),
    (
        "la phrase du § 8 derive de la constante PHRASE_PV",
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
    # --- 1. les documents reels : le verificateur doit etre vert ------------
    rc, out, err = lancer(RACINE)
    dire(rc == 0, "le verificateur accepte les documents reels (RC 0)", "RC=%d" % rc)
    dire("Traceback" not in err, "le verificateur ne plante pas sur les documents reels")
    if rc != 0:
        print(out)

    # --- 2. les sabotages : le verificateur doit devenir rouge -------------
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
            dire(False, "sabotage « %s » : la mutation n'a rien change" % nom)
            continue
        ecrire(chemin, sabotage)
        rc, out, err = lancer(racine_de_test)
        rouge = re.search(r"^FAIL\s+" + re.escape(attendu) + r"\b", out, re.M) is not None
        plante = "Traceback" in err or "Traceback" in out
        dire(rc == 1, "sabotage « %s » : le verificateur sort en RC 1" % nom, "RC=%d" % rc)
        dire(rouge, "sabotage « %s » : le controle %s est nomme en FAIL" % (nom, attendu))
        dire(not plante, "sabotage « %s » : le verificateur n'a pas plante" % nom)
        if not rouge:
            print("--- sortie du verificateur ---")
            print(out)

    shutil.rmtree(base, ignore_errors=True)

    print("")
    if echecs:
        print("== %d ECHEC(S) : le verificateur n'est pas fiable ==" % len(echecs))
        return 1
    print("== TOUT PASS : le verificateur est vert sur les documents reels et rouge sur chaque sabotage ==")
    return 0


if __name__ == "__main__":
    sys.exit(main())
