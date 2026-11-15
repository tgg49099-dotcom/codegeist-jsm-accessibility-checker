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

Usage: python3 tools/verifier-notice-pv.py [racine-du-depot]
Exit code: 0 = every check passed, 1 = at least one check failed.
"""

import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

URL_PUBLIEE = "https://labs.chiffreo.ch/privacy.html"

# The URLs other than the published page, cited on purpose, one by one.
# Adding a URL here is a choice visible in the diff; its absence from this
# list makes the check fail (counter-proof: tools/contre-epreuve-notice.py).
AUTORISEES_AUTRES = {
    # The official Atlassian source for the Rovo restriction (Standard /
    # Premium / Enterprise) plans. It is not a copy of the notice:
    # it is the quoted rule. (Added on 09/11/2026.)
    "https://www.atlassian.com/licensing/rovo",
    # The official pages cited for the administrator check and for the
    # CSV export. They are quoted rules, not copies of the notice.
    # (Added on 09/11/2026.)
    # "Get my permissions", Jira Cloud REST API v3: the endpoint of the check.
    "https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-permissions/",
    # The Jira display conditions: `hasGlobalPermission` (ADMINISTER,
    # SYSTEM_ADMIN) and `canAdministerJira`.
    "https://developer.atlassian.com/platform/forge/manifest-reference/display-conditions/jira.md",
    # The `jira:adminPage` module: the page and its URL, with no named role.
    "https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-admin-page.md",
    # UI Kit 2: no access to the DOM of the page.
    "https://developer.atlassian.com/platform/forge/ui-kit.md",
    # UI Kit 2: `FileCard`, the only documented download path.
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
    """The PHRASE_PV constant of the engine, as it is written in the code."""
    src = lire(os.path.join(racine, "src", "index.js"))
    m = re.search(r"const\s+PHRASE_PV\s*=\s*\n?\s*'((?:[^'\\]|\\.)*)'", src)
    if not m:
        return None
    return m.group(1).replace("\\'", "'").replace("\\n", "\n").replace("\\\\", "\\")


def citation_notice(racine):
    """The block quoted in § 8 of PRIVACY.md, reassembled into a single sentence."""
    priv = lire(os.path.join(racine, "PRIVACY.md"))
    m = re.search(r"##\s*8\..*?\n\n(> .*?)\n\n", priv, re.S)
    if not m:
        return None
    lignes = [l[2:].strip() for l in m.group(1).split("\n")]
    return " ".join(lignes)


def urls(texte):
    # We exclude the Markdown punctuation characters (`**`, `` ` ``) that
    # sometimes surround the URL in the text.
    return sorted(set(re.findall(r"https?://[^\s)\"'>`*]+", texte)))


def main(argv):
    racine = argv[1] if len(argv) > 1 else RACINE

    print("== Consistency between the privacy notice and the code ==")
    print("")

    # --- 1. is the § 8 quote the sentence from the code? -------------------
    pv = phrase_pv(racine)
    cite = citation_notice(racine)
    controle("NOTICE-01 the PHRASE_PV constant is found in src/index.js", pv is not None)
    controle("NOTICE-02 § 8 of PRIVACY.md does quote a sentence", cite is not None)
    if pv and cite:
        identique = pv == cite
        controle(
            "NOTICE-03 § 8 of PRIVACY.md quotes PHRASE_PV word for word",
            identique,
            "identical" if identique else "the code says: " + pv[:90] + "… / the notice says: " + cite[:90] + "…",
        )

    # --- 2. a single copy of the notice, and no unlisted URL ---------
    for nom in ("README.md", "PRIVACY.md"):
        chemin = os.path.join(racine, nom)
        if not os.path.exists(chemin):
            controle("NOTICE-04 %s exists" % nom, False)
            continue
        trouvees = urls(lire(chemin))
        # (a) the copies of the notice: there must be exactly one,
        #     the published one;
        copies = [u for u in trouvees if "privacy" in u.lower() or "policy" in u.lower()]
        controle(
            "NOTICE-04 %s cites only one copy of the notice, the published page" % nom,
            copies == [URL_PUBLIEE],
            "URLs found: " + (", ".join(trouvees) if trouvees else "none"),
        )
        # (b) the other URLs must be explicitly allowed;
        autres = [u for u in trouvees if u != URL_PUBLIEE and u not in AUTORISEES_AUTRES]
        controle(
            "NOTICE-04 %s cites no URL outside the allowlist" % nom,
            not autres,
            ("Unauthorized URLs: " + ", ".join(autres)) if autres else "none",
        )

    print("")
    if echecs:
        print("== %d FAILURE(S) ==" % len(echecs))
        return 1
    print("== ALL PASS: the notice and the code say the same thing ==")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
