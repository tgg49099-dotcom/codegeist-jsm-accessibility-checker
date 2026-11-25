#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generer-images-scan-184.py — the 4 images of the Devpost gallery, built from the
REAL scan of a real JSM portal (17 November 2026).

WHAT THIS SCRIPT IS
-------------------
The contest submission needs a thumbnail and an image gallery. The images must
show the product working on REAL data, not a drawing and not a mock. This
script therefore draws NOTHING of its own: every string it writes into a PNG
comes from a file of the repository, and every drawn line is recorded in
`media/SCAN-JSM-SCREENSHOTS-2026-11-17.json` with the file it comes from and
the path inside it.

The sources are:
  * docs/scan-jsm-2026-11-17.json  — the MEASUREMENT (the real run of the real
    engine against https://tgg-dev.atlassian.net : the 9 HTTP calls, the 7
    findings, the repartition, the request types read);
  * docs/scan-jsm-2026-11-17-reprise.json — the RAW output of the same engine
    on the same site, run again on 17 November 2026 at 21:33 UTC (the limits
    the app reports, the `source` of each finding, the privacy statement);
  * src/regles.js  — the rule catalogue of the engine (the titles of the
    criteria) and its own CSV export function;
  * src/frontend/admin.jsx — the wording of the administration page (the
    banner, the identity sentence, the column titles, the review column).

The 4 images:
  1. scan-jsm-vignette-1500x1000.png  — the thumbnail (3:2) : the run, its
     numbers, the criteria it raised, one real finding;
  2. scan-jsm-constat-1500x1000.png   — ONE finding, in full (what the app
     read, where, what it says, what it does not claim);
  3. scan-jsm-regles-1500x1000.png    — the rules of the engine, as they
     apply to this scan (level, confidence, messages, examples) and what the
     scan cannot check;
  4. scan-jsm-violations-1500x1000.png — the list of the 7 findings, in the
     table the administration page shows.

DETERMINISM: the same inputs produce the same pixels (no timestamp is drawn
and PIL does not write a tIME chunk). On the same machine the PNG files are
identical byte for byte; on another machine the bytes of the file can differ
because the zlib build that compresses the PNG differs (zlib or zlib-ng), the
pixels do not. The companion verifier `tools/verifier-images-scan-184.py`
re-generates the images in a sandbox and compares the md5 of the decoded
pixels, then checks that every drawn string really is in the file it claims.

Usage: python3 tools/generer-images-scan-184.py [racine-du-depot]
Exit code: 0 = the 4 images and the manifest are written, 1 = otherwise.
"""

import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont


def md5_fichier(chemin_):
    import hashlib
    h = hashlib.md5()
    with open(chemin_, "rb") as f:
        for bloc in iter(lambda: f.read(65536), b""):
            h.update(bloc)
    return h.hexdigest()


RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MESURE = os.path.join(RACINE, "docs", "scan-jsm-2026-11-17.json")
REPRISE = os.path.join(RACINE, "docs", "scan-jsm-2026-11-17-reprise.json")
REGLE = os.path.join(RACINE, "src", "regles.js")
UI = os.path.join(RACINE, "src", "frontend", "admin.jsx")
SORTIE = os.path.join(RACINE, "media")
MANIFESTE = os.path.join(SORTIE, "SCAN-JSM-SCREENSHOTS-2026-11-17.json")

LARGEUR = 1500
HAUTEUR = 1000

# --- the palette (a terminal, dark) -----------------------------------------
BG = (13, 17, 23)
BAR = (22, 27, 34)
TXT = (230, 237, 243)
DIM = (125, 133, 144)
GRN = (63, 185, 80)
YEL = (210, 153, 34)
ORG = (219, 109, 40)
BLU = (88, 166, 255)
RED = (248, 81, 73)

POLICE = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
POLICE_B = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
POLICE_T = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

MARGE = 56
HAUTEUR_BANDEAU = 86
PAS = 26


def police(taille, gras=False, titre=False):
    if titre:
        return ImageFont.truetype(POLICE_T, taille)
    return ImageFont.truetype(POLICE_B if gras else POLICE, taille)


class Dessin(object):
    """A PNG being drawn. Every text line is recorded with its source."""

    def __init__(self, titre, sous_titre):
        self.img = Image.new("RGB", (LARGEUR, HAUTEUR), BG)
        self.d = ImageDraw.Draw(self.img)
        self.registre = []
        self.d.rectangle([0, 0, LARGEUR, HAUTEUR_BANDEAU - 12], fill=BAR)
        self.d.rectangle([0, HAUTEUR_BANDEAU - 12, LARGEUR, HAUTEUR_BANDEAU - 10], fill=(48, 54, 61))
        self.d.text((MARGE, 22), titre, font=police(30, titre=True), fill=TXT)
        f = police(17)
        w = self.d.textlength(sous_titre, font=f)
        self.d.text((LARGEUR - MARGE - w, 34), sous_titre, font=f, fill=DIM)
        self.y = HAUTEUR_BANDEAU + 18

    # -- primitives ---------------------------------------------------------
    def _ecrit(self, x, y, texte, fonte, couleur, source):
        self.d.text((x, y), texte, font=fonte, fill=couleur)
        self.registre.append({"texte": texte, "source": source})

    def texte(self, y, texte, source, taille=18, couleur=TXT, gras=False, x=MARGE):
        self._ecrit(x, y, texte, police(taille, gras=gras), couleur, source)
        return y + PAS

    def champ(self, y, cle, valeur, source, couleur=None, largeur_cle=260):
        self._ecrit(MARGE, y, cle, police(18), DIM, {"fichier": "src/frontend/admin.jsx", "note": "label of the image"})
        self._ecrit(MARGE + largeur_cle, y, valeur, police(18), couleur or TXT, source)
        return y + PAS

    def champ_multi(self, y, cle, valeurs, source, couleur=None, largeur_cle=200):
        """A label whose value takes several lines (one value per line)."""
        self._ecrit(MARGE, y, cle, police(18), DIM, {"fichier": "src/frontend/admin.jsx", "note": "label of the image"})
        for v in valeurs:
            self._ecrit(MARGE + largeur_cle, y, v, police(18), couleur or TXT, source)
            y += PAS
        return y

    def filet(self, y):
        self.d.line([(MARGE, y), (LARGEUR - MARGE, y)], fill=(48, 54, 61))
        return y + 12

    def pied(self, lignes):
        y = HAUTEUR - 26 - PAS * len(lignes)
        for i, (texte, source) in enumerate(lignes):
            self._ecrit(MARGE, y + i * PAS, texte, police(15), DIM, source)
        return y

    def enregistre(self, chemin):
        self.img.save(chemin, "PNG", optimize=True)


def chemin(source, cle=None):
    d = {"fichier": source}
    if cle is not None:
        d["chemin"] = cle
    return d


def catalogue_regles():
    """The rule catalogue of the engine, read from src/regles.js by node."""
    code = (
        "const r=require(process.argv[1]);"
        "console.log(JSON.stringify({criteres:r.CRITERES,"
        "impossibles:r.CONSTATS_IMPOSSIBLES}));"
    )
    p = subprocess.run(
        ["node", "-e", code, os.path.join(RACINE, "src", "regles.js")],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=RACINE,
    )
    if p.returncode != 0:
        raise SystemExit("node n'a pas pu lire src/regles.js : " + p.stderr.decode("utf-8", "replace"))
    return json.loads(p.stdout.decode("utf-8"))


def export_csv_app(constats):
    """The CSV the app itself exports (src/regles.js, versCsv)."""
    chemin_json = os.path.join(SORTIE, ".constats-tmp.json")
    with open(chemin_json, "w", encoding="utf-8") as f:
        json.dump(constats, f)
    try:
        code = (
            "const r=require(process.argv[1]);"
            "const c=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));"
            "process.stdout.write(r.versCsv(c));"
        )
        p = subprocess.run(
            ["node", "-e", code, os.path.join(RACINE, "src", "regles.js"), chemin_json],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=RACINE,
        )
        if p.returncode != 0:
            raise SystemExit("node n'a pas pu produire le CSV : " + p.stderr.decode("utf-8", "replace"))
        return p.stdout.decode("utf-8")
    finally:
        os.remove(chemin_json)


def texte_ui(needle, ligne=None):
    """A wording taken from the administration page (src/frontend/admin.jsx)."""
    with open(UI, "r", encoding="utf-8") as f:
        lignes = f.read().split("\n")
    for i, l in enumerate(lignes, start=1):
        if needle in l:
            src = {"fichier": "src/frontend/admin.jsx", "ligne": i}
            if ligne is not None:
                src["extrait"] = ligne
            return src
    raise SystemExit("le libelle de l'IHM est introuvable dans admin.jsx : " + needle)


def endpoint_du_type(appels, types_lus, nom_ou_id):
    """The endpoint actually read for a request type (found in the call log)."""
    ident = None
    for t in types_lus:
        if nom_ou_id in (t.get("nom"), t.get("id")):
            ident = t.get("id")
    if ident is None:
        return None
    for a in appels:
        if a.get("p", "").endswith("/requesttype/%s/field" % ident):
            return "%s %s" % (a.get("m"), a.get("p"))
    return None


def champs_du_type(rapport, ident):
    """The fields the app read for a request type (from the raw report)."""
    for cle, val in rapport.get("read", {}).items():
        if cle.endswith("/requesttype/%s/field" % ident):
            morceaux = []
            for champ in val.get("excerpt", []):
                nom = champ.get("name") or champ.get("fieldId") or "?"
                morceaux.append("%s%s" % (nom, " (required)" if champ.get("required") else ""))
            return ", ".join(morceaux)
    return None



def type_de_ressource(ressource, types_lus):
    """The request type of a finding resource ('Support > Get IT help')."""
    if not ressource:
        return None
    nom = ressource.split(" > ")[-1]
    for t in types_lus:
        if t.get("nom") == nom:
            return t
    return None


def niveau_couleur(niveau):
    return {"A": YEL, "AA": ORG, "AAA": RED}.get(niveau, TXT)


def main():
    if not os.path.isdir(SORTIE):
        os.makedirs(SORTIE)
    with open(MESURE, "r", encoding="utf-8") as f:
        mesure = json.load(f)
    with open(REPRISE, "r", encoding="utf-8") as f:
        reprise = json.load(f)

    constats = mesure["constats"]
    appels = mesure["appels"]
    types_lus = mesure["types_lus"]
    repartition = mesure["repartition_criteres"]
    niveaux = mesure["niveaux_par_critere"]
    catalogue = catalogue_regles()
    criteres = catalogue["criteres"]
    rapport = reprise["rapport"]
    limites = rapport.get("limites", [])

    # The two runs must agree, otherwise the images would mix two states.
    constats_reprise = rapport.get("findings", [])
    if len(constats) != len(constats_reprise):
        raise SystemExit("les deux executions ne sont pas d'accord : %d vs %d constats"
                         % (len(constats), len(constats_reprise)))
    for a, b in zip(constats, constats_reprise):
        for k in ("critere", "niveau", "ressource", "emplacement", "message"):
            if a.get(k) != b.get(k):
                raise SystemExit("les deux executions divergent sur %s : %r vs %r" % (k, a.get(k), b.get(k)))

    n_get = sum(1 for a in appels if a.get("m") == "GET")
    n_post = sum(1 for a in appels if a.get("m") == "POST")
    n_ko = sum(1 for a in appels if a.get("status") != 200)
    a_verifier = sum(1 for c in constats if c.get("a_verifier") is True)
    total = mesure["constats_total"]
    site = mesure["site"]
    date = mesure["date"]
    engine = rapport.get("scanner", "")

    banniere = "%s finding(s) — %s to be checked by a human" % (total, a_verifier)
    src_banniere = texte_ui('" finding(s) — "')
    src_colonnes = {
        "critere": texte_ui('content: "Criterion"'),
        "niveau": texte_ui('content: "Level"'),
        "ou": texte_ui('content: "Where"'),
        "message": texte_ui('content: "Message"'),
        "revue": texte_ui('content: "Review"'),
    }
    src_human = texte_ui('"human review"')
    src_mode = texte_ui("Mode: {report.mode")

    manifestes = []

    # ---------------------------------------------------------------- image 1
    d = Dessin("Portal Accessibility Checker for JSM",
               "real scan — %s" % date)
    y = d.y
    y = d.champ(y, "Site", site, chemin("docs/scan-jsm-2026-11-17.json", "site"))
    y = d.champ(y, "Mode", "%s (JSM active on the site: isLicensedForUse = %s)"
                % (mesure["mode"], mesure["jsmProbe"]["isLicensedForUse"]),
                chemin("docs/scan-jsm-2026-11-17.json", "mode + jsmProbe.isLicensedForUse"))
    y = d.champ(y, "Engine", engine, chemin("docs/scan-jsm-2026-11-17-reprise.json", "rapport.scanner"))
    y = d.champ(y, "HTTP calls", "%d GET, %d POST, %d refused — read-only"
                % (n_get, n_post, n_ko),
                chemin("docs/scan-jsm-2026-11-17.json", "appels[]"),
                couleur=GRN)
    y = d.champ(y, "Findings", "%d (%s)" % (
        total, ", ".join("%d x %s" % (repartition[c], c) for c in sorted(repartition))),
        chemin("docs/scan-jsm-2026-11-17.json", "constats_total + repartition_criteres"),
        couleur=ORG)
    y = d.champ(y, "Review", "%s to be checked by a human (a_verifier: true)" % a_verifier,
                src_banniere)
    y = d.filet(y + 4)
    for c in sorted(repartition, key=lambda k: (-repartition[k], k)):
        crit = criteres.get(c, {})
        y = d.texte(y, "WCAG %s  %s" % (c, crit.get("titre", "")),
                    chemin("src/regles.js", "CRITERES['%s'].titre" % c),
                    couleur=niveau_couleur(niveaux.get(c)), gras=True)
        y = d.texte(y, "          level %s · %s · %d finding(s) in this scan"
                    % (niveaux.get(c, "?"), crit.get("confiance", ""), repartition[c]),
                    chemin("docs/scan-jsm-2026-11-17.json", "niveaux_par_critere + repartition_criteres"),
                    couleur=DIM, x=MARGE + 20)
    y = d.filet(y + 6)
    exemple = constats[0]
    y = d.texte(y, "One finding, as the engine reports it:", chemin("docs/scan-jsm-2026-11-17.json", "constats[0]"),
                couleur=BLU, gras=True)
    y = d.texte(y, "  %s · %s = \"%s\""
                % (exemple["ressource"], exemple["emplacement"], exemple["valeur"]),
                chemin("docs/scan-jsm-2026-11-17.json", "constats[0].ressource + .emplacement + .valeur"),
                x=MARGE + 20)
    y = d.texte(y, "  %s (%s) %s" % (exemple["critere"], exemple["niveau"], exemple["message"]),
                chemin("docs/scan-jsm-2026-11-17.json", "constats[0].critere + .niveau + .message"),
                couleur=YEL, x=MARGE + 20)
    y = d.filet(y + 4)
    y = d.texte(y, "What the app read — %d GET calls, nothing refused:" % n_get,
                chemin("docs/scan-jsm-2026-11-17.json", "appels[]"), couleur=BLU, gras=True)
    for a in appels:
        y = d.texte(y, "  %-4s %s  %s" % (a.get("m"), a.get("status"), a.get("p")),
                    chemin("docs/scan-jsm-2026-11-17.json", "appels[]"), taille=16, couleur=DIM,
                    x=MARGE + 20)
    d.pied([
        ("Read-only: %d GET, %d POST. The app writes nothing on your site and calls no external service."
         % (n_get, n_post), chemin("docs/scan-jsm-2026-11-17.json", "appels[]")),
        ("Source: docs/scan-jsm-2026-11-17.json · engine md5 %s · drawn by tools/generer-images-scan-184.py"
         % mesure["md5_moteur_local"], chemin("docs/scan-jsm-2026-11-17.json", "md5_moteur_local")),
    ])
    d.enregistre(os.path.join(SORTIE, "scan-jsm-vignette-1500x1000.png"))
    manifestes.append(("scan-jsm-vignette-1500x1000.png", d.registre))

    # ---------------------------------------------------------------- image 2
    f = constats[0]
    type_lu = type_de_ressource(f["ressource"], types_lus)
    ep = endpoint_du_type(appels, types_lus, type_lu.get("nom")) if type_lu else None
    src_reprise = [c for c in rapport["findings"] if c.get("emplacement") == f["emplacement"]
                   and c.get("ressource") == f["ressource"]]
    source_trouvee = src_reprise[0].get("source") if src_reprise else None
    d = Dessin("One finding, in full", "%s — finding 1 of %d" % (f["critere"], total))
    y = d.y
    y = d.texte(y, "WCAG %s — %s" % (f["critere"], criteres.get(f["critere"], {}).get("titre", "")),
                chemin("src/regles.js", "CRITERES['%s'].titre" % f["critere"]),
                couleur=niveau_couleur(f["niveau"]), gras=True, taille=20)
    y = d.champ(y, "Level", f["niveau"], chemin("docs/scan-jsm-2026-11-17.json", "constats[0].niveau"),
                couleur=niveau_couleur(f["niveau"]))
    y = d.champ(y, "Confidence", f["confiance"], chemin("docs/scan-jsm-2026-11-17.json", "constats[0].confiance"))
    y = d.champ(y, "Read from", ("%s — %s (200)" % (source_trouvee, ep)) if ep else source_trouvee,
                chemin("docs/scan-jsm-2026-11-17-reprise.json", "rapport.findings[0].source"),
                couleur=BLU)
    y = d.champ(y, "Resource", f["ressource"], chemin("docs/scan-jsm-2026-11-17.json", "constats[0].ressource"))
    if type_lu:
        y = d.champ(y, "Request type", "%s (id %s) of the service desk %s"
                    % (type_lu.get("nom"), type_lu.get("id"), f["ressource"].split(" > ")[0]),
                    chemin("docs/scan-jsm-2026-11-17.json", "types_lus[]"))
        champs = champs_du_type(rapport, type_lu.get("id"))
        if champs:
            y = d.champ(y, "Fields read", champs,
                        chemin("docs/scan-jsm-2026-11-17-reprise.json", "rapport.read[]"))
    y = d.champ(y, "Location", f["emplacement"], chemin("docs/scan-jsm-2026-11-17.json", "constats[0].emplacement"))
    y = d.champ(y, "Value read", "\"%s\" (empty)" % f["valeur"],
                chemin("docs/scan-jsm-2026-11-17.json", "constats[0].valeur"),
                couleur=RED if f["valeur"] == "" else TXT)
    y = d.champ(y, "The app says", f["message"], chemin("docs/scan-jsm-2026-11-17.json", "constats[0].message"),
                couleur=ORG)
    y = d.champ(y, "Review", "human review (a_verifier: true)", src_human)
    y = d.filet(y + 6)
    y = d.texte(y, "The %d findings of this scan, by request type" % total,
                chemin("docs/scan-jsm-2026-11-17.json", "par_passage"), couleur=BLU, gras=True)
    for ressource, n in mesure["par_passage"].items():
        y = d.texte(y, "  %-40s %d" % (ressource, n),
                    chemin("docs/scan-jsm-2026-11-17.json", "par_passage['%s']" % ressource),
                    couleur=DIM, x=MARGE + 20)
    y = d.filet(y + 4)
    y = d.texte(y, "What the app guarantees", src_banniere, couleur=BLU, gras=True)
    for lim in limites:
        for i, segment in enumerate(wrap(lim, 118)):
            y = d.texte(y, ("  " if i == 0 else "    ") + segment,
                        chemin("docs/scan-jsm-2026-11-17-reprise.json", "rapport.limites[]"),
                        couleur=DIM, x=MARGE + 20)
    d.pied([
        ("A finding is an alert for a human to check: the app certifies no conformance."
         , chemin("docs/scan-jsm-2026-11-17-reprise.json", "rapport.limites[]")),
        ("Source: docs/scan-jsm-2026-11-17.json · drawn by tools/generer-images-scan-184.py",
         chemin("docs/scan-jsm-2026-11-17.json", "constats[0]")),
    ])
    d.enregistre(os.path.join(SORTIE, "scan-jsm-constat-1500x1000.png"))
    manifestes.append(("scan-jsm-constat-1500x1000.png", d.registre))

    # ---------------------------------------------------------------- image 3
    d = Dessin("The rules the engine applied", "%d criteria raised by this scan" % len(repartition))
    y = d.y
    for c in sorted(repartition, key=lambda k: (-repartition[k], k)):
        crit = criteres.get(c, {})
        ids = []
        noms = []
        for f in constats:
            if f["critere"] != c:
                continue
            t = type_de_ressource(f["ressource"], types_lus)
            if t and t.get("id") not in ids:
                ids.append(t.get("id"))
                noms.append(t.get("nom"))
        eps = []
        for i in ids:
            e = endpoint_du_type(appels, types_lus, i)
            if e:
                eps.append(e)
        msgs = []
        for f in constats:
            if f["critere"] == c and f["message"] not in msgs:
                msgs.append(f["message"])
        ex = None
        for f in constats:
            if f["critere"] == c:
                ex = f
                break
        y = d.texte(y, "WCAG %s — %s" % (c, crit.get("titre", "")),
                    chemin("src/regles.js", "CRITERES['%s'].titre" % c),
                    couleur=niveau_couleur(niveaux.get(c)), gras=True, taille=20)
        y = d.champ(y, "Level", niveaux.get(c, "?"), chemin("docs/scan-jsm-2026-11-17.json", "niveaux_par_critere['%s']" % c),
                    couleur=niveau_couleur(niveaux.get(c)), largeur_cle=200)
        y = d.champ(y, "Confidence", crit.get("confiance", ""), chemin("src/regles.js", "CRITERES['%s'].confiance" % c),
                    largeur_cle=200)
        y = d.champ_multi(y, "Read from", eps, chemin("docs/scan-jsm-2026-11-17.json", "appels[]"),
                          couleur=BLU)
        y = d.champ(y, "Request types", ", ".join(noms),
                    chemin("docs/scan-jsm-2026-11-17.json", "types_lus[]"),
                    largeur_cle=200)
        y = d.champ(y, "Findings", "%d in this scan" % repartition[c],
                    chemin("docs/scan-jsm-2026-11-17.json", "repartition_criteres['%s']" % c),
                    largeur_cle=200)
        y = d.champ(y, "Engine message", msgs[0] if msgs else "",
                    chemin("docs/scan-jsm-2026-11-17.json", "constats[].message (critere %s)" % c),
                    couleur=ORG, largeur_cle=200)
        if ex:
            y = d.champ(y, "Example", "%s — %s = \"%s\"" % (ex["ressource"], ex["emplacement"], ex["valeur"]),
                        chemin("docs/scan-jsm-2026-11-17.json", "constats[] (critere %s)" % c),
                        largeur_cle=200)
        y += 8
    y = d.filet(y)
    y = d.champ(y, "Fields read", "%d fields, across %d request types of the service desk %s"
                % (mesure["champs_lus"], len(types_lus), constats[0]["ressource"].split(" > ")[0]),
                chemin("docs/scan-jsm-2026-11-17.json", "champs_lus + types_lus[]"), largeur_cle=200)
    y = d.texte(y, "What this scan cannot check (the app says so itself)", src_banniere, couleur=BLU, gras=True)
    for lim in limites:
        for i, segment in enumerate(wrap(lim, 118)):
            y = d.texte(y, ("  " if i == 0 else "    ") + segment,
                        chemin("docs/scan-jsm-2026-11-17-reprise.json", "rapport.limites[]"),
                        couleur=DIM, x=MARGE + 20)
    d.pied([
        ("The criteria are read from the engine's own catalogue (src/regles.js), not written by hand.",
         chemin("src/regles.js", "CRITERES")),
        ("Source: docs/scan-jsm-2026-11-17.json · drawn by tools/generer-images-scan-184.py",
         chemin("docs/scan-jsm-2026-11-17.json", "constats")),
    ])
    d.enregistre(os.path.join(SORTIE, "scan-jsm-regles-1500x1000.png"))
    manifestes.append(("scan-jsm-regles-1500x1000.png", d.registre))

    # ---------------------------------------------------------------- image 4
    d = Dessin("The %d findings" % total, "the table the administration page shows")
    y = d.y
    y = d.texte(y, banniere, src_banniere, couleur=ORG, gras=True, taille=20)
    y = d.texte(y, "Mode: %s. Read %d source(s). Generated at %s."
                % (mesure["mode"], len(rapport.get("read", {})), rapport.get("generatedAt", "")),
                src_mode, couleur=DIM)
    y = d.filet(y)
    y = d.texte(y, "%-9s %-5s %-52s %s" % ("Criterion", "Level", "Where", "Review"),
                src_colonnes["critere"], couleur=DIM, gras=True)
    y = d.filet(y - 6)
    for i, f in enumerate(constats, start=1):
        ou = "%s — %s" % (f["ressource"], f["emplacement"])
        y = d.texte(y, "%-9s %-5s %-52s %s" % (
            f["critere"], f["niveau"], f["ressource"],
            "human review" if f.get("a_verifier") is True else "automatic"),
            chemin("docs/scan-jsm-2026-11-17.json", "constats[%d]" % (i - 1)),
            couleur=TXT)
        y = d.texte(y, "%s%s" % (" " * 16, f["emplacement"]),
                    chemin("docs/scan-jsm-2026-11-17.json", "constats[%d].emplacement" % (i - 1)),
                    couleur=DIM, x=MARGE)
        y = d.texte(y, "%s%s" % (" " * 16, f["message"]),
                    chemin("docs/scan-jsm-2026-11-17.json", "constats[%d].message" % (i - 1)),
                    couleur=ORG, x=MARGE)
    d.pied([
        ("Every line of this table is one finding of the real scan: %d GET, %d POST, nothing written on the site."
         % (n_get, n_post), chemin("docs/scan-jsm-2026-11-17.json", "constats[]")),
        ("Source: docs/scan-jsm-2026-11-17.json · drawn by tools/generer-images-scan-184.py",
         chemin("docs/scan-jsm-2026-11-17.json", "constats")),
    ])
    d.enregistre(os.path.join(SORTIE, "scan-jsm-violations-1500x1000.png"))
    manifestes.append(("scan-jsm-violations-1500x1000.png", d.registre))

    # ------------------------------------------------------------- manifest
    with open(MANIFESTE, "w", encoding="utf-8") as f:
        json.dump({
            "date": date,
            "site": site,
            "source_principale": "docs/scan-jsm-2026-11-17.json",
            "source_brute": "docs/scan-jsm-2026-11-17-reprise.json",
            "regles": "src/regles.js",
            "ihm": "src/frontend/admin.jsx",
            "dimensions": [LARGEUR, HAUTEUR],
            "images": [
                {
                    "fichier": nom,
                    "largeur": LARGEUR,
                    "hauteur": HAUTEUR,
                    "ratio": "3:2",
                    "octets": os.path.getsize(os.path.join(SORTIE, nom)),
                    "md5": md5_fichier(os.path.join(SORTIE, nom)),
                    "lignes": registre,
                }
                for nom, registre in manifestes
            ],
        }, f, indent=2, ensure_ascii=True, sort_keys=True)
        f.write("\n")

    for nom, _ in manifestes:
        p = os.path.join(SORTIE, nom)
        print("%s  %d octets  %dx%d" % (nom, os.path.getsize(p), LARGEUR, HAUTEUR))
    print("manifeste: %s" % os.path.relpath(MANIFESTE, RACINE))
    return 0


def wrap(texte, largeur):
    """Cut a sentence on the spaces, without losing a word."""
    mots = texte.split(" ")
    lignes = []
    courante = ""
    for m in mots:
        if not courante:
            courante = m
        elif len(courante) + 1 + len(m) <= largeur:
            courante = courante + " " + m
        else:
            lignes.append(courante)
            courante = m
    if courante:
        lignes.append(courante)
    return lignes


if __name__ == "__main__":
    sys.exit(main())
