#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
contre-epreuve-verificateur.py — the counter-proof of the manifest checker.

WHY THIS FILE
----------------
A checker that says "10 checks PASS" proves nothing until we have shown
that it KNOWS how to say no. This script sabotages the manifest in four ways
and requires that the checker:

  1. exits with the code 1 (failure);
  2. names the broken check on a "FAIL" line (a plain crash would not count:
     a harness that crashes at the end also reports a failure, and it would
     therefore validate a broken product);
  3. does not crash (no Python traceback in the output).

It also checks the opposite case: on the REAL manifest, the checker
must exit with 0.

Usage: python3 tools/contre-epreuve-verificateur.py
Exit code: 0 = the counter-proof is good, 1 = it failed.
"""

import os
import re
import subprocess
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERIF = os.path.join(RACINE, "tools", "verifier-manifest-cycle134.py")
MANIFESTE = os.path.join(RACINE, "manifest.yml")

PY = sys.executable or "python3"

# Each sabotage: (name, manifest transformation, check that must turn red)
SABOTAGES = [
    (
        "a public module (webtrigger) is reintroduced",
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
        "a network egress (external) is reintroduced",
        lambda s: s.replace(
            "\npermissions:\n",
            "\nexternal:\n  fetch:\n    - host: \"*.atlassian.net\"\npermissions:\n",
            1,
        ),
        "VERIF-02",
    ),
    (
        "a write scope is reintroduced",
        lambda s: s.replace("    - read:jira-work\n", "    - write:jira-work\n", 1),
        "VERIF-08",
    ),
    (
        "the interface module is removed",
        lambda s: re.sub(r"\n  jira:adminPage:\n(?:    .*\n)+", "\n", s, count=1),
        "VERIF-03",
    ),
    # --- sabotages of the rovo:mcp module: the rovo:mcp module and its two tools ------
    (
        "an MCP tool no longer points to a declared action",
        lambda s: s.replace("\n        - scan_accessibility\n", "\n        - scan_qui_nexiste_pas\n", 1),
        "VERIF-14",
    ),
    (
        "the rovo:mcp module now exposes only one tool",
        lambda s: s.replace("\n        - list_last_findings\n", "\n", 1),
        "VERIF-13",
    ),
    (
        "a second MCP server is declared",
        lambda s: s.replace(
            "\n  rovo:mcp:\n",
            "\n  rovo:mcp:\n    - key: pac-jsm-mcp-bis\n      name: Second MCP\n      tools:\n        - scan_accessibility\n",
            1,
        ),
        "VERIF-12",
    ),
    (
        "an action description exceeds 255 characters",
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
        "the action module is removed",
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
    # --- 1. the real manifest: the checker must be green --------------
    rc, out, err = lancer(MANIFESTE)
    dire(rc == 0, "the verifier accepts the real manifest (RC 0)", "RC=%d" % rc)
    dire("Traceback" not in err, "the verifier does not crash on the real manifest")
    if rc != 0:
        print(out)

    # --- 2. the sabotages: the checker must turn red --------------
    sabotage_dir = os.path.join(RACINE, "tools", ".contre-epreuve")
    os.makedirs(sabotage_dir, exist_ok=True)
    with open(MANIFESTE, "r", encoding="utf-8") as f:
        original = f.read()

    for i, (nom, mutation, attendu) in enumerate(SABOTAGES):
        sabotage = mutation(original)
        if sabotage == original:
            dire(False, "sabotage [%s]: the mutation changed nothing" % nom)
            continue
        chemin = os.path.join(RACINE, "manifest.sabotage-%d.yml" % i)
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(sabotage)
        try:
            rc, out, err = lancer(chemin)
            rouge = re.search(r"^FAIL\s+" + re.escape(attendu) + r"\b", out, re.M) is not None
            plante = "Traceback" in err or "Traceback" in out
            dire(rc == 1, "sabotage [%s]: the verifier exits with RC 1" % nom, "RC=%d" % rc)
            dire(rouge, "sabotage [%s]: the check %s is named on a FAIL line" % (nom, attendu))
            dire(not plante, "sabotage [%s]: the verifier did not crash" % nom)
            if not rouge:
                print("--- verifier output ---")
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
        print("== %d FAILURE(S) ==" % len(echecs))
        return 1
    print("== ALL PASS: the verifier is GREEN on the real manifest and RED on every sabotage ==")
    return 0


if __name__ == "__main__":
    sys.exit(main())
