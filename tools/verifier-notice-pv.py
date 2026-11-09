#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verifier-notice-pv.py — the coherence check between the privacy notice and the code.

TWO THINGS ARE CHECKED HERE, both of them things that silently drifted before:

  1. § 8 of PRIVACY.md quotes "the exact sentence displayed in the app". That
     sentence is the constant `PHRASE_PV` of `src/index.js`. The notice must
     quote it **verbatim**: a paraphrase in a privacy notice is a false
     statement, and the drift is invisible unless something compares the two.

  2. The notice and the README must carry **exactly one** privacy URL — the
     published one. Several copies of a privacy notice are several places to
     forget to update one of them (which is exactly what happened with the
     public trigger in November 2026). Any OTHER URL cited by the documents is
     allowed only if it is listed, one by one, in `AUTORISEES_AUTRES` below:
     a new URL has to be added to that list on purpose, so it shows up in the
     diff.

Usage : python3 tools/verifier-notice-pv.py [racine-du-depot]
Code de sortie : 0 = tout passe, 1 = au moins un contrôle échoue.
"""

import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

URL_PUBLIEE = "https://labs.chiffreo.ch/privacy.html"

# Les URL autres que la page publiee, citees a dessein, une par une.
# Ajouter une URL ici est un choix visible dans le diff ; l'absence dans cette
# liste fait echouer le controle (contre-epreuve : tools/contre-epreuve-notice.py).
AUTORISEES_AUTRES = {
    # La source officielle d'Atlassian pour la restriction de Rovo (plans
    # Standard / Premium / Enterprise). Ce n'est pas une copie de la notice :
    # c'est la regle citee. (Ajoute le 09/11/2026, cycle 136.)
    "https://www.atlassian.com/licensing/rovo",
    # Les pages officielles citees pour le controle d'administrateur et pour
    # l'export CSV. Ce sont des regles citees, pas des copies de la notice.
    # (Ajoute le 09/11/2026, cycle 139.)
    # "Get my permissions", Jira Cloud REST API v3 : l'endpoint du controle.
    "https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-permissions/",
    # Les conditions d'affichage de Jira : `hasGlobalPermission` (ADMINISTER,
    # SYSTEM_ADMIN) et `canAdministerJira`.
    "https://developer.atlassian.com/platform/forge/manifest-reference/display-conditions/jira.md",
    # Le module `jira:adminPage` : la page et son URL, sans role nomme.
    "https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-admin-page.md",
    # UI Kit 2 : pas d'acces au DOM de la page.
    "https://developer.atlassian.com/platform/forge/ui-kit.md",
    # UI Kit 2 : `FileCard`, la seule voie de telechargement documentee.
    "https://developer.atlassian.com/platform/forge/ui-kit/components/file-card.md",
}

echecs = []


def controle(libelle, ok, detail=""):
    print(("PASS" if ok else "FAIL") + "  " + libelle + (("  ->  " + detail) if detail else ""))
    if not ok:
        echecs.append(libelle)
    return ok


def lire(chemin):
    with open(chemin, "r", encoding="utf-8") as f:
        return f.read()


def phrase_pv(racine):
    """La constante PHRASE_PV du moteur, telle qu'elle est écrite dans le code."""
    src = lire(os.path.join(racine, "src", "index.js"))
    m = re.search(r"const\s+PHRASE_PV\s*=\s*\n?\s*'((?:[^'\\]|\\.)*)'", src)
    if not m:
        return None
    return m.group(1).replace("\\'", "'").replace("\\n", "\n").replace("\\\\", "\\")


def citation_notice(racine):
    """Le bloc cité en § 8 de PRIVACY.md, reassemblé en une seule phrase."""
    priv = lire(os.path.join(racine, "PRIVACY.md"))
    m = re.search(r"##\s*8\..*?\n\n(> .*?)\n\n", priv, re.S)
    if not m:
        return None
    lignes = [l[2:].strip() for l in m.group(1).split("\n")]
    return " ".join(lignes)


def urls(texte):
    # On exclut les caractères de ponctuation Markdown (`**`, `` ` ``) qui
    # entourent parfois l'URL dans le texte.
    return sorted(set(re.findall(r"https?://[^\s)\"'>`*]+", texte)))


def main(argv):
    racine = argv[1] if len(argv) > 1 else RACINE

    print("== Cohérence de la notice de confidentialité et du code ==")
    print("")

    # --- 1. la citation § 8 est-elle la phrase du code ? -------------------
    pv = phrase_pv(racine)
    cite = citation_notice(racine)
    controle("NOTICE-01 la constante PHRASE_PV est trouvée dans src/index.js", pv is not None)
    controle("NOTICE-02 le § 8 de PRIVACY.md cite bien une phrase", cite is not None)
    if pv and cite:
        identique = pv == cite
        controle(
            "NOTICE-03 le § 8 de PRIVACY.md cite PHRASE_PV mot pour mot",
            identique,
            "identique" if identique else "le code dit : " + pv[:90] + "… / la notice dit : " + cite[:90] + "…",
        )

    # --- 2. une seule copie de la notice, et aucune URL non listée ---------
    for nom in ("README.md", "PRIVACY.md"):
        chemin = os.path.join(racine, nom)
        if not os.path.exists(chemin):
            controle("NOTICE-04 %s existe" % nom, False)
            continue
        trouvees = urls(lire(chemin))
        # (a) les copies de la notice : il doit y en avoir exactement une,
        #     celle qui est publiée ;
        copies = [u for u in trouvees if "privacy" in u.lower() or "policy" in u.lower()]
        controle(
            "NOTICE-04 %s ne cite qu'une seule copie de la notice, la page publiée" % nom,
            copies == [URL_PUBLIEE],
            "URL trouvées : " + (", ".join(trouvees) if trouvees else "aucune"),
        )
        # (b) les autres URL citées doivent être explicitement autorisées ;
        autres = [u for u in trouvees if u != URL_PUBLIEE and u not in AUTORISEES_AUTRES]
        controle(
            "NOTICE-04 %s ne cite aucune URL hors liste blanche" % nom,
            not autres,
            ("URL non autorisées : " + ", ".join(autres)) if autres else "aucune",
        )

    print("")
    if echecs:
        print("== %d ÉCHEC(S) ==" % len(echecs))
        return 1
    print("== TOUT PASS : la notice et le code disent la même chose ==")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
