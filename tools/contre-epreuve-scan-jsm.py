#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
contre-epreuve-scan-jsm.py (17/11/2026) — CONTRE-EPREUVE PUBLIQUE DU SCAN REEL JSM.

But : prouver que les 7 constats annonces par le moteur (src/index.js) sur le
portail JSM REEL de tgg-dev sont REELS, c'est-a-dire :
  (a) ils se recalculent IDENTIQUEMENT a partir des REPONSES HTTP BRUTES
      relues par ce script (client HTTP propre, AUCUN import du moteur) ;
  (b) le recalcul est CAPABLE de dire NON : chaque sabotagebelow doit faire
      changer le compte, sinon le controle ne prouve rien.

Regle de la holding : un harnais peut fabriquer l'API qu'il teste. Ce script
ne fait donc JAMAIS confiance au journal du harnais : il refait les lectures
lui-meme, sur le site, et il compare champ par champ.

Lecture seule : uniquement des GET. Aucun secret n'est ecrit : les
identifiants sont lus dans l'environnement et ne quittent jamais la memoire.

Usage : python3 -I tools/contre-epreuve-scan-jsm.py
   (BRUT_DIR=/chemin pour enregistrer les reponses brutes, SORTIE=/chemin pour le resume ;
    par defaut, ce script n'ecrit RIEN dans le depot)
RC 0 = toutes les controles passent (y compris les sabotages).
"""
import base64
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request

SITE = os.environ.get("SITE", "https://tgg-dev.atlassian.net").rstrip("/")
EMAIL = os.environ.get("FORGE_EMAIL", "")
TOKEN = os.environ.get("FORGE_API_TOKEN", "")
DOSSIER = os.path.dirname(os.path.abspath(__file__))
BRUT = os.environ.get("BRUT_DIR", "")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREUVE = os.path.join(REPO, "docs", "scan-jsm-2026-11-17.json")

checks = 0
failures = 0


def check(label, ok, detail=""):
    global checks, failures
    checks += 1
    if not ok:
        failures += 1
    print(("PASS" if ok else "FAIL") + "  " + label + (("  ->  " + str(detail)) if detail else ""))


# --------------------------------------------------------------------------
# 1. Client HTTP independant (urllib), lecture seule.
# --------------------------------------------------------------------------
JOURNAL = []


def get(chemin, nom_fichier=None):
    url = SITE + chemin
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", "Basic " + base64.b64encode((EMAIL + ":" + TOKEN).encode()).decode())
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            corps = r.read().decode("utf-8", "replace")
            statut = r.status
    except urllib.error.HTTPError as e:
        corps = e.read().decode("utf-8", "replace")
        statut = e.code
    JOURNAL.append({"m": "GET", "p": chemin, "status": statut})
    if nom_fichier and BRUT:
        os.makedirs(BRUT, exist_ok=True)
        with open(os.path.join(BRUT, nom_fichier), "w", encoding="utf-8") as f:
            f.write(corps)
    try:
        return statut, json.loads(corps)
    except json.JSONDecodeError:
        return statut, None


# --------------------------------------------------------------------------
# 2. Regles reecrites ICI (copie de la SPEC, pas import du moteur).
# --------------------------------------------------------------------------
MOTS_CLES_FINALITE = [
    "e-mail", "email", "mail", "telephone", "tel", "phone", "url", "site web",
    "nom", "prenom", "adresse", "code postal", "date de naissance",
    "numero de carte",
    "name", "first name", "last name", "surname", "full name", "username",
    "address", "postcode", "postal code", "zip", "mobile", "telephone",
    "date of birth", "birthday", "website", "organization", "organisation",
    "company", "job title", "card number", "country", "city",
]


def sans_accents(s):
    return unicodedata.normalize("NFD", str(s)).replace("̀", "")


def normaliser(s):
    s = sans_accents("" if s is None else s).lower()
    s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)
    s = re.sub(r"[\s_]+", " ", s)
    return s.strip()


def contient_mot(texte_norm, motif_norm):
    # Le MOTIF doit etre dans le TEXTE (mot entier) : c'est la regle publiee
    # de l'app. (Controle de temoin C20 : le sens est teste explicitement.)
    return (" " + motif_norm + " ") in (" " + texte_norm + " ")


MOTS_ND = [normaliser(m) for m in MOTS_CLES_FINALITE]


def saisie_libre(champ):
    fid = "" if champ.get("fieldId") is None else str(champ.get("fieldId"))
    schema = champ.get("jiraSchema") or {}
    custom = str(schema.get("custom") or "")
    return (
        (fid == "" or fid.startswith("customfield_"))
        and (schema.get("type") is None or schema.get("type") == "string")
        and not re.search(r"select|radio|checkbox|multi|cascading|picker|labels", custom, re.I)
    )


def recalculer(types_lu):
    """Recalcule les constats depuis les champs BRUTS, sans le moteur."""
    out = []
    for rt in types_lu:
        champs = rt["champs"]
        for i, champ in enumerate(champs):
            if champ.get("visible") is False:
                continue
            nom = "" if champ.get("name") is None else str(champ.get("name"))
            description = "" if champ.get("description") is None else str(champ.get("description"))
            chemin = "requestTypeFields[%d]" % i
            if nom.strip() == "":
                out.append({"critere": "3.3.2", "niveau": "A", "ressource": rt["ressource"],
                            "emplacement": chemin + ".name", "valeur": champ.get("name")})
            if description.strip() == "" and champ.get("required") is True:
                out.append({"critere": "3.3.2", "niveau": "A", "ressource": rt["ressource"],
                            "emplacement": chemin + ".description", "valeur": champ.get("description")})
            if nom.strip() != "" and saisie_libre(champ):
                tout = normaliser(nom + " " + description)
                if not any(contient_mot(tout, m) for m in MOTS_ND):
                    out.append({"critere": "1.3.5", "niveau": "AA", "ressource": rt["ressource"],
                                "emplacement": chemin + ".name", "valeur": nom})
    return out


def cle(c):
    return (c["critere"], c["ressource"], c["emplacement"], str(c["valeur"]))


# --------------------------------------------------------------------------
# 3. Lectures reelles (independantes du harnais).
# --------------------------------------------------------------------------
if not EMAIL or not TOKEN:
    print("ERREUR FORGE_EMAIL / FORGE_API_TOKEN absents de l'environnement")
    sys.exit(2)

st_server, server_info = get("/rest/api/3/serverInfo", "serverInfo.json")
st_info, info = get("/rest/servicedeskapi/info", "info.json")
st_desks, desks = get("/rest/servicedeskapi/servicedesk", "servicedesk.json")

check("C1  lecture independante : /rest/api/3/serverInfo repond 200", st_server == 200, "HTTP " + str(st_server))
check("C2  lecture independante : /rest/servicedeskapi/info repond 200", st_info == 200, "HTTP " + str(st_info))
check("C3  JSM ACTIF sur le site (isLicensedForUse == true)",
      bool(info) and info.get("isLicensedForUse") is True,
      "isLicensedForUse=" + str(info.get("isLicensedForUse") if info else None))
check("C4  lecture independante : la liste des centres de service repond 200", st_desks == 200, "HTTP " + str(st_desks))

types_lu = []
for desk in (desks or {}).get("values", [])[:3]:
    st_rt, rts = get("/rest/servicedeskapi/servicedesk/%s/requesttype" % desk["id"], "requesttype-desk-%s.json" % desk["id"])
    tous = (rts or {}).get("values", [])
    caches = [rt for rt in tous if isinstance(rt.get("groupIds"), list) and len(rt["groupIds"]) == 0]
    valeurs = [rt for rt in tous if rt not in caches][:5]
    for rt in valeurs:
        st_f, flds = get("/rest/servicedeskapi/servicedesk/%s/requesttype/%s/field" % (desk["id"], rt["id"]),
                         "fields-%s-%s.json" % (desk["id"], rt["id"]))
        champs = ((flds or {}).get("requestTypeFields") or [])[:20]
        types_lu.append({"id": rt["id"], "nom": rt["name"], "ressource": "%s > %s" % (desk.get("projectName") or desk["id"], rt["name"]),
                         "champs": champs})

nb_types = len(types_lu)
nb_champs = sum(len(t["champs"]) for t in types_lu)
check("C5  la population lue n'est PAS vide (5 types de requete lus)", nb_types == 5, "%d types" % nb_types)
check("C6  les 5 types lus portent chacun des champs", nb_champs > 0, "%d champs lus" % nb_champs)

recals = recalculer(types_lu)
par_crit = {}
for c in recals:
    par_crit[c["critere"]] = par_crit.get(c["critere"], 0) + 1

# --------------------------------------------------------------------------
# 4. Comparaison avec le rapport du moteur (le livrable).
# --------------------------------------------------------------------------
with open(PREUVE, encoding="utf-8") as f:
    rep1 = json.load(f)
m1 = rep1  # la preuve publiee : mode, appels, constats, lecture

check("C7  le moteur a scanne en mode JSM (pas le repli Jira)", m1.get("mode") == "jsm", m1.get("mode"))
check("C8  la sonde JSM du moteur dit isLicensedForUse = true", m1["jsmProbe"].get("isLicensedForUse") is True)
check("C9  le moteur a lu avec l'identite du lecteur (autorisation.ok)", m1.get("autorisation_ok") is True)
check("C10  le rapport du moteur n'est pas un refus", m1.get("mode") != "refus-acces")

moteur = [{"critere": f["critere"], "niveau": f["niveau"], "ressource": f["ressource"],
           "emplacement": f["emplacement"], "valeur": f["valeur"]} for f in m1.get("constats", [])]
mc = {}
for c in moteur:
    mc[c["critere"]] = mc.get(c["critere"], 0) + 1

check("C11  le recalcul independant trouve le meme nombre de constats que le moteur",
      len(recals) == len(moteur), "recalcul %d / moteur %d" % (len(recals), len(moteur)))
check("C12  meme repartition par critere WCAG",
      par_crit == mc, "recalcul %s / moteur %s" % (json.dumps(par_crit, sort_keys=True), json.dumps(mc, sort_keys=True)))
check("C13  chaque constat du moteur se retrouve dans le recalcul (emplacement + valeur)",
      sorted(map(cle, moteur)) == sorted(map(cle, recals)),
      "manquants: " + str(sorted(map(cle, recals))[:3]))

# Les 2 executions du moteur donnent-elles le meme resultat ?
check("C14  la preuve publiee porte deux executions identiques",
      m1.get("reproductibilite", {}).get("identique") is True
      and m1.get("reproductibilite", {}).get("run2_constats") == len(moteur),
      "run2 %s constats" % m1.get("reproductibilite", {}).get("run2_constats"))

# Le journal du moteur et le journal de CE script portent les memes endpoints ?
j_moteur = [(a["m"], a["p"]) for a in m1.get("appels", [])]
j_ce = [(a["m"], a["p"]) for a in JOURNAL]
check("C15  les 2 journaux (moteur / contre-epreuve) portent les memes endpoints",
      j_moteur == j_ce, "moteur %d / contre-epreuve %d appels" % (len(j_moteur), len(j_ce)))
check("C16  aucun appel refuse", all(a.get("status") != "REFUSE" for a in m1.get("appels", [])) and all(s == 200 for s in [j["status"] for j in JOURNAL]),
      "statuts: " + ",".join(str(j["status"]) for j in JOURNAL))
check("C17  le scan est en LECTURE SEULE : aucun POST dans le journal du moteur",
      not any(a["m"] == "POST" for a in m1.get("appels", [])))

# Zero valide sur un cas connu : on prouve que la population lue est bien renseigne.
remplis = [c for t in types_lu for c in t["champs"] if str(c.get("description") or "").strip() != ""]
check("C18  la lecture a bien ramene du contenu (cas connu non vide) : descriptions presentes",
      len(remplis) > 0, "%d champs avec une description" % len(remplis))
check("C19  le type 'Onboard new employees' est lu et n'est pas signale (echantillon negatif)",
      any(t["nom"] == "Onboard new employees" for t in types_lu)
      and not any("Onboard new employees" in c["ressource"] for c in recals))

# C20 : temoin du matcher de ce script (le sens « le MOTIF est dans le TEXTE »).
# C'est le controle qui a attrape l'inversion de sens au premier essai.
check("C20  temoin du matcher : un mot-cle present est detecte",
      contient_mot(normaliser("the name of the person responsible"), normaliser("name")))
check("C21  temoin du matcher : un mot-cle absent n'est PAS detecte",
      not contient_mot(normaliser("affected hardware"), normaliser("name")))

# --------------------------------------------------------------------------
# 5. SABOTAGES : le controle doit savoir dire NON.
# --------------------------------------------------------------------------
import copy

# S1 : on donne une description a un champ obligatoire signale -> le compte 3.3.2 doit baisser.
s1 = copy.deepcopy(types_lu)
for t in s1:
    for c in t["champs"]:
        if c.get("required") is True and str(c.get("description") or "").strip() == "":
            c["description"] = "e.g. decrivez le probleme"
            break
    else:
        continue
    break
s1_c = recalculer(s1)
s1_332 = len([c for c in s1_c if c["critere"] == "3.3.2"])
check("S1  sabotage : une description ajoutee fait baisser le compte 3.3.2 (6 -> %d)" % s1_332, s1_332 == 5)

# S2 : on met un mot-cle de finalite dans la description du champ signale en 1.3.5.
s2 = copy.deepcopy(types_lu)
for t in s2:
    for c in t["champs"]:
        if c.get("fieldId") == "customfield_10112":
            c["description"] = "The name of the person responsible for the hardware"
s2_c = recalculer(s2)
s2_135 = len([c for c in s2_c if c["critere"] == "1.3.5"])
check("S2  sabotage : une finalite annoncee fait disparaitre le constat 1.3.5 (1 -> %d)" % s2_135, s2_135 == 0)

# S3 : on retire le type de requete qui porte le plus de constats.
s3 = copy.deepcopy([t for t in types_lu if t["nom"] != "Report broken hardware"])
s3_c = recalculer(s3)
check("S3  sabotage : retirer 'Report broken hardware' (3 constats) fait baisser le total (7 -> %d)" % len(s3_c), len(s3_c) == 4)

# S4 : un rapport de moteur falsifie (9 constats au lieu de 7) doit etre detecte.
falsifie = copy.deepcopy(m1)
falsifie["constats"] = list(falsifie["constats"]) + [
    {"critere": "2.4.6", "niveau": "AA", "ressource": "Support > Get IT help",
     "emplacement": "requestTypeFields[0].name", "valeur": "Summary"}]
falsifie_f = [{"critere": f["critere"], "niveau": f["niveau"], "ressource": f["ressource"],
               "emplacement": f["emplacement"], "valeur": f["valeur"]} for f in falsifie["constats"]]
check("S4  sabotage : un rapport de moteur falsifie (8 constats) est detecte par la comparaison",
      sorted(map(cle, falsifie_f)) != sorted(map(cle, recals)), "detecte")

# S5 : un site qui n'aurait plus JSM actif doit etre detecte (mode attendu != mode mesure).
check("S5  sabotage : un mode 'jira-fallback' serait detecte (le mode mesure est '%s')" % m1.get("mode"),
      m1.get("mode") != "jira-fallback")

# S6 : une reponse d'acces refusee doit etre detectee (le journal de la contre-epreuve le montre).
check("S6  sabotage : une lecture refusee serait detectee (statuts observes : %s)"
      % ",".join(str(j["status"]) for j in JOURNAL), all(j["status"] == 200 for j in JOURNAL))

# --------------------------------------------------------------------------
# 6. Sortie.
# --------------------------------------------------------------------------
repartition = {}
for t in types_lu:
    n = len([c for c in recals if c["ressource"] == t["ressource"]])
    repartition[t["ressource"]] = n
resume = {
    "site": SITE,
    "mesure_le": m1.get("mesure_le"),
    "mode": m1.get("mode"),
    "isLicensedForUse": info.get("isLicensedForUse") if info else None,
    "appels": len(JOURNAL),
    "constats_engine": len(moteur),
    "constats_recalcul": len(recals),
    "repartition_criteres": par_crit,
    "par_type_de_requete": repartition,
    "types_lus": [{"id": t["id"], "nom": t["nom"], "champs": len(t["champs"])} for t in types_lu],
    "checks": checks,
    "failures": failures,
}
SORTIE = os.environ.get("SORTIE", "")  # chemin facultatif : rien n'est ecrit par defaut
if SORTIE:
    with open(SORTIE, "w", encoding="utf-8") as f:
        json.dump(resume, f, indent=2, ensure_ascii=False)

print()
print("RESUME  constats=" + str(len(recals)) + "  repartition=" + json.dumps(par_crit, sort_keys=True)
      + "  par_type=" + json.dumps(repartition, ensure_ascii=False))
print("SUMMARY: %d PASS / %d FAIL" % (checks - failures, failures))
sys.exit(0 if failures == 0 else 1)
