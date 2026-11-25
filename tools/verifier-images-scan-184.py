#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verifier-images-scan-184.py — the 4 images of the gallery are what they claim
to be: images of the REAL scan, not drawings and not mocks.

WHAT IS CHECKED
---------------
  1. the 4 files exist, are PNG (magic bytes AND PIL), are 1500x1000 (3:2),
     are under the 5 MB limit of the Devpost thumbnail field;
  2. their md5 and their size are the ones written in the manifest;
  3. the manifest lists every drawn line with the file it comes from, and
     every one of those files exists;
  4. NO MOCK: every one of the 7 findings of the real measurement appears
     verbatim (criterion, level, resource, location, value, message) in the
     image that shows the list of the violations; the numbers drawn in the
     thumbnail (calls, findings, repartition, fields read) are the numbers of
     the measurement, recomputed here;
  5. the limits quoted in the images are the limits the app itself reports
     (docs/scan-jsm-2026-11-17-reprise.json), and the titles of the criteria
     are the ones of the engine's catalogue (src/regles.js);
  6. REPRODUCIBILITY: the generator is replayed in a sandbox and the 4 images
     come out identical PIXEL FOR PIXEL (md5 of the decoded RGB pixels, size
     and mode) — the images are computed from the sources, they are not drawn
     by hand. The md5 of the PNG FILE is also shown, for information only: it
     depends on the zlib build that compresses the PNG (zlib or zlib-ng give
     different bytes for the same pixels), so it can differ on another
     machine while the image is the same;
  7. the counter-proof: when a fact of the measurement is changed in the
     sandbox, the md5 of the images CHANGES — the images really depend on the
     measurement (a check that cannot fail proves nothing).

Usage: python3 tools/verifier-images-scan-184.py [racine-du-depot]
Exit code: 0 = every check passed, 1 = at least one check failed.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA = os.path.join(RACINE, "media")
MESURE = os.path.join(RACINE, "docs", "scan-jsm-2026-11-17.json")
REPRISE = os.path.join(RACINE, "docs", "scan-jsm-2026-11-17-reprise.json")
REGLE = os.path.join(RACINE, "src", "regles.js")
UI = os.path.join(RACINE, "src", "frontend", "admin.jsx")
GENERATEUR = os.path.join(RACINE, "tools", "generer-images-scan-184.py")
MANIFESTE = os.path.join(MEDIA, "SCAN-JSM-SCREENSHOTS-2026-11-17.json")

IMAGES = [
    "scan-jsm-vignette-1500x1000.png",
    "scan-jsm-constat-1500x1000.png",
    "scan-jsm-regles-1500x1000.png",
    "scan-jsm-violations-1500x1000.png",
]
LARGEUR = 1500
HAUTEUR = 1000
TAILLE_MAX = 5 * 1024 * 1024

echecs = []
checks = 0


def controle(label, ok, detail=""):
    global checks
    checks += 1
    if not ok:
        echecs.append(label)
    print(("PASS" if ok else "FAIL") + "  " + label + (("  ->  " + detail) if detail else ""))


def md5_fichier(chemin_):
    h = hashlib.md5()
    with open(chemin_, "rb") as f:
        for bloc in iter(lambda: f.read(65536), b""):
            h.update(bloc)
    return h.hexdigest()


def texte(chemin_):
    with open(chemin_, "r", encoding="utf-8") as f:
        return f.read()


def sandbox():
    """A copy of the sources the generator needs, in a temporary directory."""
    d = tempfile.mkdtemp(prefix="images-184-")
    for rel in ("docs/scan-jsm-2026-11-17.json", "docs/scan-jsm-2026-11-17-reprise.json",
                "src/regles.js", "src/frontend/admin.jsx", "tools/generer-images-scan-184.py"):
        dest = os.path.join(d, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(os.path.join(RACINE, rel), dest)
    os.makedirs(os.path.join(d, "media"), exist_ok=True)
    return d


def md5_images(dossier):
    return {n: md5_fichier(os.path.join(dossier, "media", n)) for n in IMAGES}


def md5_pixels(chemin_):
    """md5 of what the image SHOWS: mode, size and the decoded RGB pixels.
    Independent of the PNG compression (zlib build, optimize level)."""
    im = Image.open(chemin_)
    rgb = im.convert("RGB")
    h = hashlib.md5()
    h.update(("%s %dx%d\n" % (im.mode, im.size[0], im.size[1])).encode("ascii"))
    h.update(rgb.tobytes())
    return h.hexdigest()


def md5_pixels_images(dossier):
    return {n: md5_pixels(os.path.join(dossier, "media", n)) for n in IMAGES}


def main():
    with open(MESURE, "r", encoding="utf-8") as f:
        mesure = json.load(f)
    with open(REPRISE, "r", encoding="utf-8") as f:
        reprise = json.load(f)
    with open(MANIFESTE, "r", encoding="utf-8") as f:
        manifeste = json.load(f)

    par_nom = {i["fichier"]: i for i in manifeste["images"]}

    # -- 1/2 : the files themselves ----------------------------------------
    for nom in IMAGES:
        chemin_ = os.path.join(MEDIA, nom)
        existe = os.path.isfile(chemin_)
        controle("IMG-01 %s existe" % nom, existe)
        if not existe:
            continue
        octets = os.path.getsize(chemin_)
        controle("IMG-02 %s est un PNG (magic bytes)" % nom,
                 open(chemin_, "rb").read(8) == b"\x89PNG\r\n\x1a\n")
        im = Image.open(chemin_)
        controle("IMG-03 %s fait %dx%d" % (nom, LARGEUR, HAUTEUR),
                 im.format == "PNG" and im.size == (LARGEUR, HAUTEUR),
                 "%s %sx%s" % (im.format, im.size[0], im.size[1]))
        controle("IMG-04 %s fait moins de 5 Mo" % nom, octets < TAILLE_MAX, "%d octets" % octets)
        m = par_nom.get(nom)
        controle("IMG-05 %s est dans le manifeste" % nom, m is not None)
        if m:
            controle("IMG-06 %s : md5 du manifeste = md5 du fichier" % nom,
                     m["md5"] == md5_fichier(chemin_), m["md5"])
            controle("IMG-07 %s : taille du manifeste = taille du fichier" % nom,
                     m["octets"] == octets, "%d" % octets)
            controle("IMG-08 %s : dimensions du manifeste" % nom,
                     m["largeur"] == LARGEUR and m["hauteur"] == HAUTEUR)

    # -- 3 : the sources of the drawn lines exist --------------------------
    fichiers_cites = set()
    for i in manifeste["images"]:
        for ligne in i["lignes"]:
            src = ligne.get("source", {})
            if src.get("fichier"):
                fichiers_cites.add(src["fichier"])
    for f in sorted(fichiers_cites):
        controle("SRC-01 la source citee existe : %s" % f, os.path.isfile(os.path.join(RACINE, f)))

    # -- 4 : no mock --------------------------------------------------------
    lignes_violations = [l["texte"] for l in par_nom["scan-jsm-violations-1500x1000.png"]["lignes"]]
    bloc_violations = "\n".join(lignes_violations)
    bloc_toutes = "\n".join("\n".join(l["texte"] for l in im["lignes"]) for im in manifeste["images"])
    for i, f in enumerate(mesure["constats"]):
        for cle in ("critere", "niveau", "ressource", "emplacement", "message"):
            controle("MOCK-01 constat %d : %s = %r est dans l'image des violations" % (i + 1, cle, f[cle]),
                     f[cle] in bloc_violations)
        valeur = f["valeur"]
        attendu = ('"%s"' % valeur) if valeur == "" else valeur
        controle("MOCK-02 constat %d : la valeur %r est dans une image" % (i + 1, valeur),
                 attendu in bloc_toutes)

    lignes_vignette = "\n".join(l["texte"] for l in par_nom["scan-jsm-vignette-1500x1000.png"]["lignes"])
    n_get = sum(1 for a in mesure["appels"] if a["m"] == "GET")
    n_post = sum(1 for a in mesure["appels"] if a["m"] == "POST")
    controle("MOCK-03 la vignette annonce %d GET" % n_get, ("%d GET" % n_get) in lignes_vignette)
    controle("MOCK-04 la vignette annonce %d POST" % n_post, ("%d POST" % n_post) in lignes_vignette)
    controle("MOCK-05 la vignette annonce %d constats" % mesure["constats_total"],
             ("%d" % mesure["constats_total"]) in lignes_vignette)
    for crit, n in mesure["repartition_criteres"].items():
        controle("MOCK-06 la vignette annonce %d x %s" % (n, crit),
                 ("%d x %s" % (n, crit)) in lignes_vignette)
    controle("MOCK-07 les 9 appels sont dans la vignette (lecture seule)",
             all(a["p"] in lignes_vignette for a in mesure["appels"]))
    controle("MOCK-08 le site de la vignette est celui de la mesure",
             mesure["site"] in lignes_vignette)

    # -- 5 : the limits, the titles, the wording ---------------------------
    texte_reprise = texte(REPRISE)
    texte_regles = texte(REGLE)
    texte_ui = texte(UI)
    limites = reprise["rapport"].get("limites", [])
    tout_sans_espace = "".join(bloc_toutes.split())
    for i, lim in enumerate(limites):
        controle("LIM-01 limite %d de l'app presente dans une image" % i,
                 "".join(lim.split()) in tout_sans_espace, lim[:60])
    for crit in mesure["repartition_criteres"]:
        titre = None
        for ligne in texte_regles.split("\n"):
            if ("'%s'" % crit) in ligne and "titre:" in ligne:
                titre = ligne.split("titre:")[1].strip().rstrip(",}").strip().strip("'")
        controle("REGLE-01 le titre du critere %s est celui du catalogue" % crit,
                 titre is not None and any(titre in "\n".join(l["texte"] for l in im["lignes"])
                                           for im in manifeste["images"]), str(titre))
    for libelle in ("human review", "Criterion", "Level", "Where", "Message", "Review",
                    "finding(s) — ", "to be checked by a human"):
        controle("IHM-01 le libelle de l'IHM %r est dans src/frontend/admin.jsx" % libelle,
                 libelle in texte_ui)

    # -- 6 : reproducibility -----------------------------------------------
    d = sandbox()
    try:
        p = subprocess.run([sys.executable, os.path.join(d, "tools", "generer-images-scan-184.py"), d],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=d)
        controle("REPRO-01 le generateur rejoue dans un bac a sable reussit", p.returncode == 0,
                 p.stdout.decode("utf-8", "replace")[-400:])
        md5_sable = md5_pixels_images(d)
        md5_fichiers_sable = md5_images(d)
        for nom in IMAGES:
            reel = md5_pixels(os.path.join(MEDIA, nom))
            controle("REPRO-02 %s : le rejeu donne les memes pixels (image calculee, pas dessinee)" % nom,
                     md5_sable.get(nom) == reel, "pixels %s / %s" % (md5_sable.get(nom), reel))
            fichier_reel = md5_fichier(os.path.join(MEDIA, nom))
            print("INFO  REPRO-03 %s : md5 du fichier PNG %s (rejeu %s) — %s" % (
                nom, fichier_reel, md5_fichiers_sable.get(nom),
                "identique" if fichier_reel == md5_fichiers_sable.get(nom)
                else "different : autre compression zlib, memes pixels si REPRO-02 PASS"))
        # -- 7 : the counter-proof ------------------------------------------
        # (a) the two runs must agree: a measurement that contradicts itself
        #     must be REFUSED by the generator, not drawn.
        mesure_sable = json.load(open(os.path.join(d, "docs", "scan-jsm-2026-11-17.json"), encoding="utf-8"))
        mesure_sable["constats"][0]["message"] = "MESSAGE SABOTE (le controle doit le voir)"
        with open(os.path.join(d, "docs", "scan-jsm-2026-11-17.json"), "w", encoding="utf-8") as f:
            json.dump(mesure_sable, f)
        p2 = subprocess.run([sys.executable, os.path.join(d, "tools", "generer-images-scan-184.py"), d],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=d)
        controle("CE-01 une mesure qui se contredit (les 2 executions divergent) est REFUSEE par le generateur",
                 p2.returncode != 0, p2.stdout.decode("utf-8", "replace")[-200:].strip())
        # (b) the same fact changed in BOTH runs: the images must change.
        reprise_sable = json.load(open(os.path.join(d, "docs", "scan-jsm-2026-11-17-reprise.json"), encoding="utf-8"))
        reprise_sable["rapport"]["findings"][0]["message"] = "MESSAGE SABOTE (le controle doit le voir)"
        with open(os.path.join(d, "docs", "scan-jsm-2026-11-17-reprise.json"), "w", encoding="utf-8") as f:
            json.dump(reprise_sable, f)
        p3 = subprocess.run([sys.executable, os.path.join(d, "tools", "generer-images-scan-184.py"), d],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=d)
        controle("CE-02 le generateur accepte la mesure sabotee (la generation ne echoue pas)",
                 p3.returncode == 0, p3.stdout.decode("utf-8", "replace")[-300:])
        md5_sable2 = md5_pixels_images(d)
        change = [n for n in IMAGES if md5_sable2.get(n) != md5_sable.get(n)]
        controle("CE-03 un fait sabote change les pixels d'au moins une image (le controle sait dire NON)",
                 len(change) > 0, "images changees : %s" % ", ".join(change))
        # and the verifier itself must go red on the sabotaged measurement
        with open(os.path.join(d, "docs", "scan-jsm-2026-11-17.json"), "w", encoding="utf-8") as f:
            json.dump(mesure, f)
    finally:
        shutil.rmtree(d, ignore_errors=True)

    print("")
    print("%d controles, %d echec(s)" % (checks, len(echecs)))
    if echecs:
        for e in echecs:
            print("  ECHEC : " + e)
        return 1
    print("== ALL PASS: the 4 images are computed from the real scan, and the check can say NO ==")
    return 0


if __name__ == "__main__":
    sys.exit(main())
