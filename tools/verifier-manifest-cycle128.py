#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verifier-manifest-cycle128.py — the manifest checker of the Codegeist app
"Portal Accessibility Checker for JSM".

WHY THIS FILE EXISTS
--------------------
Until cycle 128 (05/11/2026) the manifest declared a PUBLIC trigger module
(`webtrigger`, `request: authentication: none`): a URL that anyone could call
to run a scan of the customer's site and read the findings in clear text. The
jury review of 05/11/2026 called it a blocking defect, and it was right.

The manifest now declares exactly TWO modules — an interface (`jira:adminPage`)
and the function it calls (`resolver`) — and no public module at all. This
script checks that, by READING THE MANIFEST, with no network access and no
Forge account.

It is dependency-free (no PyYAML): the manifest is a hand-written YAML file of
a known shape, and the reader below parses that shape — after REMOVING the
comments, so that a word mentioned in a comment can never be mistaken for a
declaration (the reverse mistake is just as bad: a comment that documents a
removal must not keep the removed thing alive).

Usage:
    python3 tools/verifier-manifest-cycle128.py [chemin/vers/manifest.yml]

Exit code:
    0 = every check passed
    1 = at least one check failed (each failure is printed with the reason)
    2 = the manifest could not be read at all
"""

import os
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHEMIN_PAR_DEFAUT = os.path.join(RACINE, "manifest.yml")

# Les modules publics qu'un module d'interface ne doit PAS remplacer par
# lui-meme : chacun d'eux donne un point d'entree que le visiteur declenche.
MODULES_PUBLICS = (
    "webtrigger",
    "productTrigger",
    "scheduleTrigger",
    "rovo",
    "trigger",
)

# Une cle de sortie (`external`, `remotes`, `egress`) autoriserait l'app a
# appeler un service exterieur : la notice de confidentialite dit qu'il n'y
# en a aucun.
CLES_DE_SORTIE = ("external", "remotes", "egress")

SCOPES_ATTENDUS = ["read:jira-work", "read:servicedesk-request"]

resultats = []


def controle(libelle, ok, detail=""):
    resultats.append((libelle, bool(ok), detail))
    etat = "PASS" if ok else "FAIL"
    ligne = "%s  %s" % (etat, libelle)
    if detail:
        ligne += "  ->  " + detail
    print(ligne)
    return bool(ok)


# ---------------------------------------------------------------------------
# Lecture du manifeste (sans dépendance, sur la forme de ce manifeste)
# ---------------------------------------------------------------------------


def sans_commentaire(ligne):
    """Retire le commentaire d'une ligne (le manifeste n'a pas de '#' dans une valeur)."""
    i = ligne.find("#")
    if i == -1:
        return ligne
    return ligne[:i]


def lire_manifeste(chemin):
    """Renvoie (racines, modules, scopes, brut).

    racines : la liste des clés racines déclarées (`modules`, `permissions`, …)
    modules : la liste des TYPES de modules déclarés sous `modules:`
    scopes  : la liste des scopes déclarés sous `permissions: > scopes:`
    """
    with open(chemin, "r", encoding="utf-8") as f:
        brut = f.read()

    lignes = [sans_commentaire(l).rstrip() for l in brut.split("\n")]

    racines = []
    modules = []
    scopes = []

    racine_courante = None
    dans_scopes = False
    bloc_modules = False

    for ligne in lignes:
        if not ligne.strip():
            continue
        indent = len(ligne) - len(ligne.lstrip(" "))
        contenu = ligne.strip()

        if indent == 0:
            racine_courante = contenu[:-1].strip() if contenu.endswith(":") else contenu
            if racine_courante not in racines:
                racines.append(racine_courante)
            bloc_modules = racine_courante == "modules"
            dans_scopes = False
            continue

        if bloc_modules and indent == 2 and contenu.endswith(":"):
            modules.append(contenu[:-1].strip())
            continue

        if racine_courante == "permissions":
            if indent == 2 and contenu.endswith(":"):
                dans_scopes = contenu[:-1].strip() == "scopes"
                continue
            if indent == 4 and dans_scopes and contenu.startswith("- "):
                scopes.append(contenu[2:].strip())

    return racines, modules, scopes, brut


def modules_publics(racines, modules):
    """Types de modules publics trouvés (dans les clés ou dans le texte)."""
    trouves = []
    for m in modules:
        base = m.split(":")[0].strip().lower()
        for public in MODULES_PUBLICS:
            if base == public.lower() or public.lower() in base:
                trouves.append(m)
                break
    for cle in CLES_DE_SORTIE:
        if cle in [r.lower() for r in racines]:
            trouves.append(cle + ":")
    return trouves


# ---------------------------------------------------------------------------
# Exécution
# ---------------------------------------------------------------------------


def main(argv):
    chemin = argv[1] if len(argv) > 1 else CHEMIN_PAR_DEFAUT
    if not os.path.exists(chemin):
        print("manifeste introuvable : %s" % chemin, file=sys.stderr)
        return 2

    racines, modules, scopes, brut = lire_manifeste(chemin)
    racine = os.path.dirname(os.path.abspath(chemin))

    print("== Vérification du manifeste : %s ==" % chemin)
    print("")

    # 1. aucun module public
    publics = modules_publics(racines, modules)
    controle(
        "VERIF-01 aucun module public (webtrigger, productTrigger, scheduleTrigger, rovo)",
        not publics,
        "trouvé : " + ", ".join(publics) if publics else "aucun",
    )

    # 2. aucun appel réseau sortant
    controle(
        "VERIF-02 aucune sortie réseau déclarée (external / remotes / egress)",
        not [c for c in CLES_DE_SORTIE if c in [r.lower() for r in racines]],
        "racines : " + ", ".join(racines),
    )

    # 3. le module d'interface
    controle(
        "VERIF-03 le module d'interface jira:adminPage est déclaré",
        "jira:adminPage" in modules,
        "modules : " + ", ".join(modules),
    )

    # 4. le module de fonction
    controle(
        "VERIF-04 le module de fonction est déclaré",
        "function" in modules,
        "modules : " + ", ".join(modules),
    )

    # 5. exactement deux modules
    controle(
        "VERIF-05 exactement deux types de modules (une interface, une fonction)",
        len(modules) == 2 and "jira:adminPage" in modules and "function" in modules,
        "modules : " + ", ".join(modules),
    )

    # 6. les scopes sont exactement les deux scopes de lecture
    controle(
        "VERIF-06 les scopes sont exactement read:jira-work et read:servicedesk-request",
        scopes == SCOPES_ATTENDUS,
        "scopes : " + ", ".join(scopes),
    )

    # 7. aucun scope d'écriture
    ecriture = [s for s in scopes if s.startswith("write:") or s.startswith("admin:")]
    controle(
        "VERIF-07 aucun scope d'écriture ni d'administration",
        not ecriture,
        "trouvé : " + ", ".join(ecriture) if ecriture else "aucun",
    )

    # 8. la ressource d'interface existe
    ressource = None
    for ligne in brut.split("\n"):
        s = sans_commentaire(ligne).strip()
        if s.startswith("path:"):
            ressource = s.split(":", 1)[1].strip()
            break
    controle(
        "VERIF-08 le fichier de ressource de l'interface existe",
        ressource is not None and os.path.exists(os.path.join(racine, ressource)),
        ressource or "aucune clé path: déclarée",
    )

    # 9. le handler du resolver existe et exporte la fonction annoncée
    handler = None
    for ligne in brut.split("\n"):
        s = sans_commentaire(ligne).strip()
        if s.startswith("handler:"):
            handler = s.split(":", 1)[1].strip()
            break
    fichier_handler = None
    export_handler = None
    if handler:
        pieces = handler.split(".")
        fichier_handler = "src/" + pieces[0] + ".js"
        export_handler = pieces[-1]
    chemin_handler = os.path.join(racine, fichier_handler) if fichier_handler else None
    handler_ok = False
    if chemin_handler and os.path.exists(chemin_handler):
        with open(chemin_handler, "r", encoding="utf-8") as f:
            handler_ok = ("exports." + export_handler) in f.read()
    controle(
        "VERIF-09 le handler du resolver existe et exporte la fonction annoncée",
        handler_ok,
        (handler or "aucun handler déclaré") + " -> " + (fichier_handler or "?"),
    )

    # 10. l'app a un id
    controle(
        "VERIF-10 l'app a un identifiant (app.id)",
        "ari:cloud:ecosystem::app/" in brut,
        "app.id déclaré",
    )

    echecs = [r for r in resultats if not r[1]]
    print("")
    if not echecs:
        print("== TOUT PASS (%d contrôles) : le manifeste n'expose aucun point d'entrée public ==" % len(resultats))
        return 0
    print("== %d ÉCHEC(S) sur %d contrôles ==" % (len(echecs), len(resultats)))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
