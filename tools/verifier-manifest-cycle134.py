#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verifier-manifest-cycle134.py — the manifest checker of the Codegeist app
"Portal Accessibility Checker for JSM".

WHY THIS FILE EXISTS
--------------------
This file REPLACES `tools/verifier-manifest-cycle128.py` (cycle 134,
09/11/2026), which is removed so that there is only ONE checker and no
stale one. The cycle-128 checker proved one thing: the manifest exposed NO
public module — the app could not be called by anyone who found a URL.

Cycle 134 added the `rovo:mcp` module (the Codegeist 2026 bonus "Best app
with Atlassian MCP"), so the property to prove changed with the code. It is
now:

  * there is still NO unauthenticated public module (no `webtrigger`, no
    `productTrigger`, no `scheduleTrigger`, no `trigger`): the only entry
    points are the administration page (a signed-in Jira administrator) and
    the two MCP tools (the signed-in caller, read with the caller's own
    permissions — see src/mcp.js);
  * there is exactly ONE `rovo:mcp` module (Atlassian allows at most one per
    app), it exposes exactly TWO tools, and every tool it exposes is a
    declared `action` whose `function` exists;
  * the two modules of the previous version (`jira:adminPage` + `function`)
    are still there, untouched;
  * the scopes are still exactly the two read-only scopes: no scope was
    added, no scope was removed;
  * the app still declares no egress (no `external`, no `remotes`).

It is dependency-free (no PyYAML): the manifest is a hand-written YAML file
of a known shape, and the reader below parses that shape — after REMOVING
the comments, so that a word mentioned in a comment can never be mistaken
for a declaration (the reverse mistake is just as bad: a comment that
documents a removal must not keep the removed thing alive).

Usage:
    python3 tools/verifier-manifest-cycle134.py [chemin/vers/manifest.yml]

Exit code:
    0 = every check passed
    1 = at least one check failed (each failure is printed with the reason)
    2 = the manifest could not be read at all
"""

import os
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHEMIN_PAR_DEFAUT = os.path.join(RACINE, "manifest.yml")

# Les modules qui donnent un point d'entree declencheable par le visiteur.
# `rovo:mcp` n'est PAS dans cette liste : ce n'est pas un point d'entree
# public, c'est un serveur d'outils dont l'appel est porte par l'identite de
# l'appelant (verifie par le code, src/mcp.js). La liste reste interdite :
# c'est elle qui prouve que l'app n'est pas appelable par quiconque trouve
# une URL.
MODULES_PUBLICS = (
    "webtrigger",
    "productTrigger",
    "scheduleTrigger",
    "trigger",
)

# Une cle de sortie (`external`, `remotes`, `egress`) autoriserait l'app a
# appeler un service exterieur : la notice de confidentialite dit qu'il n'y
# en a aucun.
CLES_DE_SORTIE = ("external", "remotes", "egress")

SCOPES_ATTENDUS = ["read:jira-work", "read:servicedesk-request"]

# Les types de modules attendus, et les modules de la version precedente
# (cycle 128) qui doivent toujours etre la.
TYPES_ATTENDUS = ["jira:adminPage", "function", "action", "rovo:mcp"]
MODULES_CYCLE_128 = ["jira:adminPage", "function"]

# Le nombre d'outils MCP : deux, pas plus (la consigne du cycle 134).
OUTILS_ATTENDUS = 2

# La longueur maximale d'une description d'action (regle Atlassian).
LONGUEUR_DESCRIPTION_MAX = 255

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
    modules : dict type -> liste d'items (chaque item : dict avec au moins
              `key`, plus les champs lus, plus `tools` pour les modules qui
              en déclarent)
    scopes  : la liste des scopes déclarés sous `permissions: > scopes:`
    """
    with open(chemin, "r", encoding="utf-8") as f:
        brut = f.read()

    lignes = [sans_commentaire(l).rstrip() for l in brut.split("\n")]

    racines = []
    modules = {}
    scopes = []

    racine_courante = None
    dans_scopes = False
    bloc_modules = False
    type_courant = None
    item_courant = None
    champ_courant = None
    style_courant = None
    indent_champ = 0
    tampon = []

    def vider():
        nonlocal tampon, style_courant, indent_champ
        if champ_courant is not None and item_courant is not None and tampon:
            if style_courant == ">":
                item_courant[champ_courant] = " ".join(t.strip() for t in tampon if t.strip())
            else:
                item_courant[champ_courant] = "\n".join(t.strip() for t in tampon)
        tampon = []
        style_courant = None
        indent_champ = 0

    for ligne in lignes:
        if not ligne.strip():
            continue
        indent = len(ligne) - len(ligne.lstrip(" "))
        contenu = ligne.strip()

        # Un bloc scalaire plié (description: >) continue sur les lignes
        # suivantes, plus indentées que le champ. Rien d'autre n'est lu
        # pendant ce temps.
        if style_courant is not None:
            if indent > indent_champ:
                tampon.append(contenu)
                continue
            vider()

        if indent == 0:
            vider()
            champ_courant = None
            item_courant = None
            type_courant = None
            racine_courante = contenu[:-1].strip() if contenu.endswith(":") else contenu
            if racine_courante not in racines:
                racines.append(racine_courante)
            bloc_modules = racine_courante == "modules"
            dans_scopes = False
            continue

        if bloc_modules:
            if indent == 2 and contenu.endswith(":"):
                vider()
                type_courant = contenu[:-1].strip()
                modules.setdefault(type_courant, [])
                item_courant = None
                champ_courant = None
                continue
            if indent == 4 and contenu.startswith("- ") and type_courant is not None:
                vider()
                item_courant = {}
                modules[type_courant].append(item_courant)
                champ_courant = None
                reste = contenu[2:].strip()
                if reste.startswith("key:"):
                    item_courant["key"] = reste.split(":", 1)[1].strip()
                continue
            if indent == 6 and item_courant is not None:
                if contenu.startswith("- "):
                    # liste simple (tools: …)
                    item_courant.setdefault(champ_courant or "liste", []).append(contenu[2:].strip())
                    continue
                if contenu.endswith(":"):
                    vider()
                    champ_courant = contenu[:-1].strip()
                    item_courant.setdefault(champ_courant, [])
                    continue
                vider()
                cle, _, valeur = contenu.partition(":")
                champ_courant = cle.strip()
                valeur = valeur.strip()
                if valeur in (">", "|"):
                    style_courant = valeur
                    indent_champ = indent
                    tampon = []
                else:
                    item_courant[champ_courant] = valeur
                continue
            if indent >= 8 and item_courant is not None:
                if contenu.startswith("- "):
                    item_courant.setdefault(champ_courant or "liste", []).append(contenu[2:].strip())
                else:
                    tampon.append(contenu)
                continue

        if racine_courante == "permissions":
            if indent == 2 and contenu.endswith(":"):
                dans_scopes = contenu[:-1].strip() == "scopes"
                continue
            if indent == 4 and dans_scopes and contenu.startswith("- "):
                scopes.append(contenu[2:].strip())

    vider()
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


def cles(items):
    return [i.get("key") for i in (items or [])]


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
    types = list(modules.keys())

    print("== Vérification du manifeste (cycle 134) : %s ==" % chemin)
    print("")

    # 1. aucun module public declencheable par le visiteur
    publics = modules_publics(racines, modules)
    controle(
        "VERIF-01 aucun module public declencheable (webtrigger, productTrigger, scheduleTrigger, trigger)",
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
        "modules : " + ", ".join(types),
    )

    # 4. le module de fonction, avec la clé `resolver`
    controle(
        "VERIF-04 le module de fonction resolver est déclaré",
        "function" in modules and "resolver" in cles(modules["function"]),
        "clés : " + ", ".join(cles(modules.get("function"))),
    )

    # 5. les types de modules sont exactement les quatre attendus
    controle(
        "VERIF-05 les types de modules sont exactement jira:adminPage, function, action, rovo:mcp",
        sorted(types) == sorted(TYPES_ATTENDUS),
        "modules : " + ", ".join(types),
    )

    # 6. les modules du cycle 128 sont toujours là
    controle(
        "VERIF-06 les modules du cycle 128 (jira:adminPage, function) sont toujours déclarés",
        all(t in modules for t in MODULES_CYCLE_128),
        "modules : " + ", ".join(types),
    )

    # 7. les scopes sont exactement les deux scopes de lecture
    controle(
        "VERIF-07 les scopes sont exactement read:jira-work et read:servicedesk-request",
        scopes == SCOPES_ATTENDUS,
        "scopes : " + ", ".join(scopes),
    )

    # 8. aucun scope d'écriture
    ecriture = [s for s in scopes if s.startswith("write:") or s.startswith("admin:")]
    controle(
        "VERIF-08 aucun scope d'écriture ni d'administration",
        not ecriture,
        "trouvé : " + ", ".join(ecriture) if ecriture else "aucun",
    )

    # 9. la ressource d'interface existe
    ressource = None
    for ligne in brut.split("\n"):
        s = sans_commentaire(ligne).strip()
        if s.startswith("path:"):
            ressource = s.split(":", 1)[1].strip()
            break
    controle(
        "VERIF-09 le fichier de ressource de l'interface existe",
        ressource is not None and os.path.exists(os.path.join(racine, ressource)),
        ressource or "aucune clé path: déclarée",
    )

    # 10. le handler du resolver existe et exporte la fonction annoncée
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
        "VERIF-10 le handler du resolver existe et exporte la fonction annoncée",
        handler_ok,
        (handler or "aucun handler déclaré") + " -> " + (fichier_handler or "?"),
    )

    # 11. l'app a un id
    controle(
        "VERIF-11 l'app a un identifiant (app.id)",
        "ari:cloud:ecosystem::app/" in brut,
        "app.id déclaré",
    )

    # 12. exactement un module rovo:mcp
    mcps = modules.get("rovo:mcp") or []
    controle(
        "VERIF-12 exactement un module rovo:mcp",
        len(mcps) == 1,
        "%d module(s) rovo:mcp" % len(mcps),
    )

    # 13. les outils exposés sont exactement deux et sont tous des actions declarées
    outils = []
    for mcp in mcps:
        for outil in mcp.get("tools") or []:
            if outil not in outils:
                outils.append(outil)
    actions = cles(modules.get("action"))
    controle(
        "VERIF-13 le module rovo:mcp expose exactement %d outils" % OUTILS_ATTENDUS,
        len(outils) == OUTILS_ATTENDUS,
        "outils : " + ", ".join(outils),
    )
    controle(
        "VERIF-14 chaque outil exposé est une action déclarée",
        bool(outils) and all(o in actions for o in outils),
        "actions : " + ", ".join(actions),
    )

    # 15. chaque action pointe une fonction declaree, et son handler existe
    cles_fonction = cles(modules.get("function"))
    actions_sans_fonction = []
    handlers_manquants = []
    for action in modules.get("action") or []:
        f = action.get("function")
        if not f or f not in cles_fonction:
            actions_sans_fonction.append(action.get("key", "?"))
            continue
        trouve = False
        for item in modules.get("function") or []:
            if item.get("key") == f:
                handler = item.get("handler")
                if handler:
                    pieces = handler.split(".")
                    chemin_h = os.path.join(racine, "src", pieces[0] + ".js")
                    if os.path.exists(chemin_h):
                        with open(chemin_h, "r", encoding="utf-8") as fh:
                            if ("exports." + pieces[-1]) in fh.read():
                                trouve = True
        if not trouve:
            handlers_manquants.append(action.get("key", "?"))
    controle(
        "VERIF-15 chaque action pointe une fonction déclarée",
        not actions_sans_fonction,
        "sans fonction : " + ", ".join(actions_sans_fonction) if actions_sans_fonction else "toutes",
    )
    controle(
        "VERIF-16 le handler de chaque action existe et exporte la fonction annoncée",
        not handlers_manquants,
        "handlers manquants : " + ", ".join(handlers_manquants) if handlers_manquants else "tous présents",
    )

    # 17. les descriptions d'action respectent la longueur maximale
    trop_longues = []
    for action in modules.get("action") or []:
        description = action.get("description") or ""
        if len(description) > LONGUEUR_DESCRIPTION_MAX:
            trop_longues.append("%s (%d caracteres)" % (action.get("key", "?"), len(description)))
    controle(
        "VERIF-17 la description de chaque action fait au plus %d caracteres" % LONGUEUR_DESCRIPTION_MAX,
        not trop_longues,
        "; ".join(trop_longues) if trop_longues else "toutes conformes",
    )

    # 18. le nom du serveur MCP tient dans 30 caracteres (regle Atlassian)
    noms_mcp = []
    for mcp in mcps:
        nom = mcp.get("name") or ""
        if len(nom) > 30:
            noms_mcp.append("%s (%d caracteres)" % (nom, len(nom)))
    controle(
        "VERIF-18 le nom du serveur MCP fait au plus 30 caracteres",
        not noms_mcp,
        "; ".join(noms_mcp) if noms_mcp else ", ".join((m.get("name") or "?") for m in mcps),
    )

    echecs = [r for r in resultats if not r[1]]
    print("")
    if not echecs:
        print(
            "== TOUT PASS (%d contrôles) : aucun point d'entrée public, deux outils MCP déclarés, "
            "deux scopes de lecture, aucune sortie réseau ==" % len(resultats)
        )
        return 0
    print("== %d ÉCHEC(S) sur %d contrôles ==" % (len(echecs), len(resultats)))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
