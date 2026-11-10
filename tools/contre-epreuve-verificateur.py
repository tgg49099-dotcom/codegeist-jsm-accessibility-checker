#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
contre-epreuve-verificateur.py — la contre-épreuve du vérificateur de manifeste.

POURQUOI CE FILE
----------------
Un vérificateur qui dit « 10 contrôles PASS » ne prouve rien tant qu'on n'a pas
montré qu'il SAIT dire non. Ce script sabotise le manifeste de quatre façons
et exige que le vérificateur :

  1. sorte avec le code 1 (échec) ;
  2. nomme le contrôle cassé sur une ligne « FAIL » (un simple plantage ne
     compterait pas : un harnais qui crash a la fin signale aussi un échec,
     et il validerait donc un produit cassé) ;
  3. ne plante pas (aucune trace Python dans la sortie).

Il contrôle aussi le cas inverse : sur le manifeste RÉEL, le vérificateur doit
sortir avec 0.

Usage : python3 tools/contre-epreuve-verificateur.py
Code de sortie : 0 = la contre-épreuve est bonne, 1 = elle a échoué.
"""

import os
import re
import subprocess
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERIF = os.path.join(RACINE, "tools", "verifier-manifest-cycle134.py")
MANIFESTE = os.path.join(RACINE, "manifest.yml")

PY = sys.executable or "python3"

# Chaque sabotage : (nom, transformation du manifeste, contrôle qui doit être rouge)
SABOTAGES = [
    (
        "un module public (webtrigger) est réintroduit",
        lambda s: s.replace(
            "\nmodules:\n",
            "\nmodules:\n  webtrigger:\n    - key: scan-trigger\n      function: resolver\n"
            "      urlFormat: v2\n      request:\n        authentication: none\n"
            "      response:\n        type: dynamic\n",
            1,
        ),
        "VERIF-01",
    ),
    (
        "une sortie réseau (external) est réintroduite",
        lambda s: s.replace(
            "\npermissions:\n",
            "\nexternal:\n  fetch:\n    - host: \"*.atlassian.net\"\npermissions:\n",
            1,
        ),
        "VERIF-02",
    ),
    (
        "un scope d'écriture est réintroduit",
        lambda s: s.replace("    - read:jira-work\n", "    - write:jira-work\n", 1),
        "VERIF-08",
    ),
    (
        "le module d'interface est supprimé",
        lambda s: re.sub(r"\n  jira:adminPage:\n(?:    .*\n)+", "\n", s, count=1),
        "VERIF-03",
    ),
    # --- sabotages du module rovo:mcp : le module rovo:mcp et ses deux outils ------
    (
        "un outil MCP ne pointe plus vers une action déclarée",
        lambda s: s.replace("\n        - scan_accessibility\n", "\n        - scan_qui_nexiste_pas\n", 1),
        "VERIF-14",
    ),
    (
        "le module rovo:mcp n'expose plus qu'un outil",
        lambda s: s.replace("\n        - list_last_findings\n", "\n", 1),
        "VERIF-13",
    ),
    (
        "un deuxième serveur MCP est déclaré",
        lambda s: s.replace(
            "\n  rovo:mcp:\n",
            "\n  rovo:mcp:\n    - key: pac-jsm-mcp-bis\n      name: Second MCP\n      tools:\n        - scan_accessibility\n",
            1,
        ),
        "VERIF-12",
    ),
    (
        "la description d'une action dépasse 255 caractères",
        lambda s: s.replace(
            "        permissions. Nothing is written or stored.\n",
            "        permissions. Nothing is written or stored. "
            + ("Ce texte est volontairement trop long. " * 12)
            + "\n",
            1,
        ),
        "VERIF-17",
    ),
    (
        "le module action est supprimé",
        lambda s: re.sub(r"\n  action:\n(?:    .*\n|      .*\n)+", "\n", s, count=1),
        "VERIF-05",
    ),
]

echecs = []


def lancer(chemin_manifeste):
    proc = subprocess.run(
        [PY, VERIF, chemin_manifeste],
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stdout, proc.stderr


def dire(ok, libelle, detail=""):
    print(("PASS" if ok else "FAIL") + "  " + libelle + (("  ->  " + detail) if detail else ""))
    if not ok:
        echecs.append(libelle)


def main():
    # --- 1. le manifeste réel : le vérificateur doit être vert --------------
    rc, out, err = lancer(MANIFESTE)
    dire(rc == 0, "le vérificateur accepte le manifeste réel (RC 0)", "RC=%d" % rc)
    dire("Traceback" not in err, "le vérificateur ne plante pas sur le manifeste réel")
    if rc != 0:
        print(out)

    # --- 2. les sabotages : le vérificateur doit devenir rouge --------------
    sabotage_dir = os.path.join(RACINE, "tools", ".contre-epreuve")
    os.makedirs(sabotage_dir, exist_ok=True)
    with open(MANIFESTE, "r", encoding="utf-8") as f:
        original = f.read()

    for i, (nom, mutation, attendu) in enumerate(SABOTAGES):
        sabotage = mutation(original)
        if sabotage == original:
            dire(False, "sabotage « %s » : la mutation n'a rien changé" % nom)
            continue
        chemin = os.path.join(RACINE, "manifest.sabotage-%d.yml" % i)
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(sabotage)
        try:
            rc, out, err = lancer(chemin)
            rouge = re.search(r"^FAIL\s+" + re.escape(attendu) + r"\b", out, re.M) is not None
            plante = "Traceback" in err or "Traceback" in out
            dire(rc == 1, "sabotage « %s » : le vérificateur sort en RC 1" % nom, "RC=%d" % rc)
            dire(rouge, "sabotage « %s » : le contrôle %s est nommé en FAIL" % (nom, attendu))
            dire(not plante, "sabotage « %s » : le vérificateur n'a pas planté" % nom)
            if not rouge:
                print("--- sortie du vérificateur ---")
                print(out)
        finally:
            if os.path.exists(chemin):
                os.remove(chemin)

    try:
        os.rmdir(sabotage_dir)
    except OSError:
        pass

    print("")
    if echecs:
        print("== %d ÉCHEC(S) : le vérificateur n'est pas fiable ==" % len(echecs))
        return 1
    print("== TOUT PASS : le vérificateur est vert sur le manifeste réel et rouge sur chaque sabotage ==")
    return 0


if __name__ == "__main__":
    sys.exit(main())
