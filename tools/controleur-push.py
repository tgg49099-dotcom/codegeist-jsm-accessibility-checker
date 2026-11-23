#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
controleur-push.py — le contrôleur du push.

Il vérifie, sur les FICHIERS SERVIS (l'état public du dépôt), que :

  1. chaque phrase RETIRÉE par le push a disparu du public — sauf si elle
     est explicitement justifiée dans EXCEPTIONS ci-dessous (et, dans ce
     cas, elle ne doit pas être PLUS présente qu'avant) ;
  2. chaque phrase AJOUTÉE par le push est PRÉSENTE dans le public.

Les deux listes sont EXTRAITES DU DIFF LUI-MÊME (`git diff --unified=0`),
jamais écrites à la main : on ne peut pas vérifier une liste que quelqu'un
a pu choisir.

Ce qu'il ne fait PAS : il ne juge pas la correction elle-même, il vérifie
que le public porte exactement ce que le push a annoncé, et rien de plus.

Usage :
    python3 tools/controleur-push.py ANCIEN NOUVEAU [DOSSIER_NEUF] [DOSSIER_GIT]

    ANCIEN       ref git de l'état d'AVANT le push   (ex. edabff9)
    NOUVEAU      ref git de l'ÉTAT SERVI (le push)   (ex. aaad5d8)
    DOSSIER_NEUF dossier à vérifier (défaut : le dépôt courant)
    DOSSIER_GIT dépôt où lire le diff (défaut : le dépôt qui contient ce
                 script). Les deux peuvent être différents : le dossier
                 vérifié peut être une COPIE FALSIFIÉE, qui n'est pas un
                 dépôt git (c'est ce que fait la contre-épreuve).

Exit 0 = tout est conforme ; 1 = au moins une contradiction ;
2 = usage erroné ou diff illisible (le script ne Crashe pas : il le dit).
"""
import io
import os
import subprocess
import sys
import tempfile

# --- les exceptions, une par une, avec la raison --------------------------
# Une phrase retirée qui SURVIT dans le public a deux causes possibles :
# la MÊME ligne de code existe ailleurs (elle a été DÉPLACÉE, pas
# supprimée), ou une seule de ses occurrences a été corrigée. Chaque
# exception est notée et justifiée, et le contrôle exige qu'elle ne soit
# pas PLUS présente qu'avant le push.
EXCEPTIONS = {
    "const res = await client().requestJira(path, { headers: headers || {} });":
        "M8 : la ligne vit toujours dans jsearch() ; seule la LECTURE de "
        "jget a ete encadree, la ligne n'a pas ete retiree du fichier",
    "headers: { 'Content-Type': 'application/json', Accept: 'application/json' },":
        "M8 : idem, la ligne vit toujours dans jsearch()",
    "const res = await client().requestJira(path, {":
        "M8 : idem, la ligne vit toujours dans jsearch()",
    "for (const rt of values) {":
        "M1 : la boucle a ete deplacee (elle parcourt maintenant les types "
        "AFFICHES, pas le tableau filtre) ; la ligne est la meme, elle vit "
        "ailleurs dans la meme fonction",
    "const flds = await jget(":
        "M1 : idem, la lecture des champs a ete deplacee dans la nouvelle "
        "boucle",
    "const requestTypeFields = (flds.body.requestTypeFields || []).slice(0, 20);":
        "M1 : idem, la ligne a suivi la boucle",
    "sources[`GET /rest/servicedeskapi/servicedesk/${desk.id}/requesttype/${rt.id}/field`] = {":
        "M1 : idem, la ligne a suivi la boucle",
    "excerpt: requestTypeFields.map((f) => ({":
        "M1 : idem, la ligne a suivi la boucle",
    "description: f.description || '',":
        "M1 : idem, la ligne a suivi la boucle",
    "endpoint: 'GET /rest/servicedeskapi/info',":
        "M9 : sur les DEUX occurrences, une seule a ete corrigee — celle du "
        "refus nomme desormais la lecture qui a echoue (endpointRefuse) ; "
        "celle de la SONDE JSM doit toujours nommer l'URL reellement "
        "interrogee. Occurrences : 2 avant, 1 apres",
}


def garde(t):
    """On ne garde que les phrases porteuses de sens (>= 12 caracteres, avec
    au moins trois mots) : les "(", "}", ");" ne sont pas des phrases."""
    mots = t.split()
    return len(t) >= 12 and len(mots) >= 3


def phrases_du_diff(dossier_git, ancien, nouveau):
    """Les phrases RETIREES et AJOUTEES, extraites du diff lui-même."""
    diff = subprocess.run(
        ["git", "-C", dossier_git, "diff", "--unified=0", ancien, nouveau],
        capture_output=True, text=True, check=True).stdout
    retirees, ajoutees = [], []
    fichier = None
    for ligne in diff.split("\n"):
        if ligne.startswith("+++ b/"):
            fichier = ligne[6:]
            continue
        if ligne.startswith("--- ") or ligne.startswith("@@"):
            continue
        if ligne.startswith("-"):
            retirees.append((fichier, ligne[1:].strip()))
        elif ligne.startswith("+"):
            ajoutees.append((fichier, ligne[1:].strip()))
    retirees = [(f, t) for f, t in retirees if garde(t)]
    ajoutees = [(f, t) for f, t in ajoutees if garde(t)]
    return retirees, ajoutees


def lignes(fichier):
    try:
        with io.open(os.path.join(fichier), "r", encoding="utf-8") as f:
            return f.read().split("\n")
    except (IOError, OSError):
        return None


def compte(dossier, fichier, phrase):
    ls = lignes(os.path.join(dossier, fichier))
    if ls is None:
        return 0
    return sum(1 for l in ls if l.strip() == phrase.strip())


def extraire_ref(dossier_git, ref):
    """Le contenu de `ref` dans un dossier temporaire (git archive)."""
    cible = tempfile.mkdtemp(prefix="controleur-push-avant-")
    archive = subprocess.run(["git", "-C", dossier_git, "archive", ref],
                              capture_output=True, check=True)
    tar = subprocess.run(["tar", "-x", "-C", cible], input=archive.stdout,
                         capture_output=True, check=True)
    if tar.returncode != 0:
        raise SystemExit("extraction impossible : "
                         + tar.stderr.decode("utf-8", "replace"))
    return cible


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    ancien = sys.argv[1]
    nouveau = sys.argv[2]
    neuf = sys.argv[3] if len(sys.argv) > 3 else os.getcwd()
    # Le dépôt où lire le diff : par défaut celui qui CONTIENT ce script.
    # Il n'est pas forcément celui qu'on vérifie (contre-épreuve : copie
    # falsifiée hors de tout dépôt git).
    if len(sys.argv) > 4:
        dossier_git = sys.argv[4]
    else:
        racine = subprocess.run(
            ["git", "-C", os.path.dirname(os.path.abspath(__file__)),
             "rev-parse", "--show-toplevel"], capture_output=True, text=True)
        dossier_git = racine.stdout.strip() if racine.returncode == 0 else os.getcwd()

    try:
        retirees, ajoutees = phrases_du_diff(dossier_git, ancien, nouveau)
        avant_dir = extraire_ref(dossier_git, ancien)
    except subprocess.CalledProcessError as e:
        print("ERREUR  le diff %s..%s est illisible dans %s (%s)"
              % (ancien, nouveau, dossier_git, e))
        print("        rien n'est verifie : ce n'est pas un controle VERT.")
        return 2

    echecs = []
    verif = 0
    exceptions = 0

    # --- 1. les phrases retirees ont disparu du public -------------------
    for fichier, phrase in retirees:
        verif += 1
        if phrase in EXCEPTIONS:
            exceptions += 1
            avant = compte(avant_dir, fichier, phrase)
            apres = compte(neuf, fichier, phrase)
            if apres > avant:
                echecs.append(
                    "RETIREE mais revenue : %s | %s (%d -> %d) | %s"
                    % (fichier, phrase[:90], avant, apres, EXCEPTIONS[phrase])
                )
            continue
        apres = compte(neuf, fichier, phrase)
        if apres != 0:
            echecs.append(
                "RETIREE mais encore presente (%d fois) : %s | %s"
                % (apres, fichier, phrase[:120])
            )

    # --- 2. les phrases ajoutees sont dans le public ----------------------
    for fichier, phrase in ajoutees:
        verif += 1
        if compte(neuf, fichier, phrase) == 0:
            echecs.append(
                "AJOUTEE mais absente du public : %s | %s" % (fichier, phrase[:120])
            )

    print("== Controleur de push ==")
    print("ancien : %s (%s)" % (ancien, avant_dir))
    print("neuf   : %s (%s)" % (nouveau, neuf))
    print("phrases retirees : %d (dont %d exceptions justifiees) | "
          "phrases ajoutees : %d | controles : %d"
          % (len(retirees), exceptions, len(ajoutees), verif))
    print("")
    for e in echecs:
        print("FAIL  " + e)
    print("")
    if echecs:
        print("== %d CONTRADICTION(S) ==" % len(echecs))
        return 1
    print("== ALL PASS : le public porte exactement les corrections annoncees ==")
    return 0


if __name__ == "__main__":
    sys.exit(main())
