#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
contre-epreuve-controleur-push.py — la CONTRE-ÉPREUVE du contrôleur de push.

Un contrôleur qui dit « tout est conforme » ne prouve rien tant qu'on n'a pas
montré qu'il MORDE sur une copie falsifiée. Ce script :

  1. copie l'état public servi (le commit `NOUVEAU`) ;
  2. falsifie la copie de deux façons :
     a) il REMET une phrase retirée par le push (l'en-tête JSM à l'ancien
        nom, « X-Experimental-API ») → le contrôleur doit le voir ;
     b) il SUPPRIME une phrase ajoutée par le push (l'en-tête JSM à son
        nouveau nom, « X-ExperimentalApi ») → le contrôleur doit le voir ;
  3. exige que le contrôleur sorte en ÉCHEC (RC 1) et qu'il nomme la
     contradiction.

Usage :
    python3 tools/contre-epreuve-controleur-push.py [ANCIEN] [NOUVEAU]

    ANCIEN  ref git de l'état d'AVANT le push (ex. edabff9)
    NOUVEAU ref git de l'ÉTAT SERVI (ex. aaad5d8)

Exit 0 = les deux falsifications sont détectées ; 1 = une l'a échappé.
"""
import io
import os
import shutil
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
CONTROLEUR = os.path.join(ICI, "controleur-push.py")

ANCIEN = sys.argv[1] if len(sys.argv) > 1 else "edabff9"
NOUVEAU = sys.argv[2] if len(sys.argv) > 2 else "HEAD"

ANCIEN_LIGNE = "const JSM_HDRS = { 'X-Experimental-API': 'opt-in', Accept: 'application/json' };"
NOUVEAU_LIGNE = "const JSM_HDRS = { 'X-ExperimentalApi': 'opt-in', Accept: 'application/json' };"
CIBLE = os.path.join("src", "index.js")

echecs = 0
verifications = 0


def verifier(libelle, ok, detail=""):
    global echecs, verifications
    verifications += 1
    if not ok:
        echecs += 1
    print(("PASS" if ok else "FAIL") + "  " + libelle + (("  ->  " + detail) if detail else ""))


def copier_serve(dossier_git):
    """Copie l'état PUBLIC SERVI — les FICHIERS SUIVIS par git seulement.

    On n'utilise PAS shutil.copytree : le dossier servi peut contenir un
    node_modules (gitignoré, ~200 Mo) qui n'a rien à faire dans l'état
    public. `git archive` donne exactement ce qu'un clone NEUF contient :
    les fichiers versionnés."""
    cible = tempfile.mkdtemp(prefix="pac-push-falsifie-")
    copie = os.path.join(cible, "copie")
    os.makedirs(copie)
    archive = subprocess.run(["git", "-C", dossier_git, "archive", NOUVEAU],
                             capture_output=True, check=True)
    tar = subprocess.run(["tar", "-x", "-C", copie], input=archive.stdout,
                         capture_output=True, check=True)
    if tar.returncode != 0:
        raise SystemExit("extraction impossible : " + tar.stderr.decode("utf-8", "replace"))
    return copie, cible


def falsifier(retirer=None, remettre=None):
    """Copie l'état servi et applique la falsification demandée."""
    copie, cible = copier_serve(DOSSIER_GIT)
    chemin = os.path.join(copie, CIBLE)
    texte = io.open(chemin, encoding="utf-8").read()
    if retirer is not None:
        if texte.count(retirer) != 1:
            raise SystemExit("ancre introuvable : " + retirer)
        texte = texte.replace(retirer, "")
    if remettre is not None:
        if texte.count(NOUVEAU_LIGNE) != 1:
            raise SystemExit("ancre introuvable : " + NOUVEAU_LIGNE)
        texte = texte.replace(NOUVEAU_LIGNE, remettre)
    io.open(chemin, "w", encoding="utf-8").write(texte)
    return copie, cible


def lancer(dossier):
    # Le 4e argument : le dépôt où lire le diff. La copie falsifiée n'est
    # PAS un dépôt git (c'est une extraction de `git archive`) : sans ce
    # 4e argument, le contrôleur irait chercher le diff dans la copie et
    # planterait au lieu d'afficher un FAIL.
    res = subprocess.run(
        [sys.executable, CONTROLEUR, ANCIEN, NOUVEAU, dossier, DOSSIER_GIT],
        capture_output=True, text=True)
    return res.returncode, res.stdout + res.stderr


RACINE = subprocess.run(
    ["git", "-C", os.path.dirname(os.path.abspath(__file__)),
     "rev-parse", "--show-toplevel"], capture_output=True, text=True)
DOSSIER_GIT = RACINE.stdout.strip() if RACINE.returncode == 0 else os.getcwd()

print("== Contre-epreuve du controleur de push ==")
print("")

# --- 0. le contrôleur est VERT sur l'état servi tel quel -----------------
code, sortie = lancer(DOSSIER_GIT)
verifier("the controller is GREEN on the served state (RC 0)", code == 0,
         "RC %d" % code)

# --- a. une phrase retirée est remise : le contrôleur doit la voir -------
dossier, racine = falsifier(remettre=ANCIEN_LIGNE)
try:
    code, sortie = lancer(dossier)
    nomme = "RETIREE mais encore presente" in sortie and "X-Experimental-API" in sortie
    verifier("a removed phrase put back is DETECTED (RC 1)", code == 1, "RC %d" % code)
    verifier("the controller names the contradiction", nomme,
             sortie.strip().split("\n")[-2] if sortie.strip() else "")
finally:
    shutil.rmtree(racine, ignore_errors=True)

# --- b. une phrase ajoutée est retirée : le contrôleur doit la voir -----
dossier, racine = falsifier(retirer=NOUVEAU_LIGNE)
try:
    code, sortie = lancer(dossier)
    nomme = "AJOUTEE mais absente du public" in sortie and "X-ExperimentalApi" in sortie
    verifier("an added phrase removed is DETECTED (RC 1)", code == 1, "RC %d" % code)
    verifier("the controller names the contradiction", nomme,
             sortie.strip().split("\n")[-2] if sortie.strip() else "")
finally:
    shutil.rmtree(racine, ignore_errors=True)

print("")
if echecs == 0:
    print("== ALL PASS (%d checks): the controller bites on a falsified copy ==" % verifications)
    sys.exit(0)
print("== %d FAILURE(S) on %d checks ==" % (echecs, verifications))
sys.exit(1)
