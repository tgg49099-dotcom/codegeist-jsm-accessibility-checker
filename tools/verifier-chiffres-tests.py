#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verifier-chiffres-tests.py - every test count the README publishes is the real one.

WHY
---
A judge who runs the suites and finds "43 checks" where the README says 41, or
a suite the README never mentions, stops trusting every other number. This
checker RUNS each suite and each tool, counts the PASS lines, and compares:

  T1  every suite of `npm test` (package.json) is listed in "Run the tests";
  T2  every tool listed there exists, every suite listed there exists;
  T3  the count written next to each suite / tool = the PASS lines it prints,
      and the suite / tool exits with code 0;
  T4  the `npm test` line announces the real number of suites and checks;
  T5  the "test-*.js" line of the layout section announces the real totals.

Usage : python3 tools/verifier-chiffres-tests.py [README.md]
        python3 tools/verifier-chiffres-tests.py --counter-proof
Exit  : 0 = GREEN, 1 = RED (each failing check is named on a FAIL line).
No network, no Atlassian account; it only reads files and runs the local suites.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six",
         7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven",
         12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen",
         16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen",
         20: "twenty"}
PASS_RE = re.compile(r"^\s*PASS\b", re.M)


def npm_suites():
    with open(os.path.join(ROOT, "package.json"), encoding="utf-8") as f:
        script = json.load(f)["scripts"]["test"]
    return re.findall(r"node\s+(\S+\.js)", script)


def run(cmd):
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=300)
    out = p.stdout + p.stderr
    return p.returncode, len(PASS_RE.findall(out))


def readme_claims(text):
    """Lines of the 'Run the tests' block: (kind, file, count)."""
    m = re.search(r"## Run the tests[^\n]*\n+```\n(.*?)\n```", text, re.S)
    if not m:
        return None, []
    block = m.group(1)
    claims = []
    for line in block.splitlines():
        a = re.match(r"\s*node\s+(\S+\.js)\s+#\s*(\d+)\s+checks", line)
        b = re.match(r"\s*python3\s+(tools/\S+\.py)\s+#\s*(\d+)\s+checks", line)
        if a:
            claims.append(("suite", a.group(1), int(a.group(2))))
        elif b:
            claims.append(("tool", b.group(1), int(b.group(2))))
    return block, claims


def check(readme_path):
    with open(readme_path, encoding="utf-8") as f:
        text = f.read()
    fails, passes = [], []

    def ok(cond, name, detail=""):
        (passes if cond else fails).append((name, detail))
        print(("PASS  " if cond else "FAIL  ") + name + ("  ->  " + detail if detail else ""))

    suites = npm_suites()
    block, claims = readme_claims(text)
    ok(block is not None, "T0 the README has a 'Run the tests' code block")
    if block is None:
        return 1
    listed = {c[1] for c in claims if c[0] == "suite"}
    missing = [s for s in suites if s not in listed]
    ok(not missing, "T1 every suite of npm test is listed with its count",
       "missing: " + ", ".join(missing) if missing else "%d/%d" % (len(suites), len(suites)))

    real = {}
    for kind, name, claimed in claims:
        path = os.path.join(ROOT, name)
        if not os.path.isfile(path):
            ok(False, "T2 %s exists" % name)
            continue
        rc, n = run(["node", name] if kind == "suite" else [sys.executable, name])
        real[name] = n
        ok(rc == 0 and n == claimed, "T3 %s: README %d checks" % (name, claimed),
           "real %d PASS, exit %d" % (n, rc))
    for s in missing:
        if os.path.isfile(os.path.join(ROOT, s)):
            rc, n = run(["node", s])
            real[s] = n

    n_suites = len(suites)
    n_checks = sum(real.get(s, 0) for s in suites)
    tools = [c[1] for c in claims if c[0] == "tool"]
    n_tool_checks = sum(real.get(t, 0) for t in tools)

    m = re.search(r"npm test\s+#\s*(\d+)\s+suites,\s*(\d+)\s+checks", block)
    ok(bool(m) and (int(m.group(1)), int(m.group(2))) == (n_suites, n_checks),
       "T4 the npm test line announces the real totals",
       "README %s, real %d suites, %d checks" % (m.groups() if m else "absent", n_suites, n_checks))

    m = re.search(r"test-\*\.js\s+the offline harness \((\d+) checks in (\w+) suites,"
                  r"\s*plus (\d+) checks\s+in the (\w+) tools", text)
    want = (str(n_checks), WORDS.get(n_suites, str(n_suites)), str(n_tool_checks),
            WORDS.get(len(tools), str(len(tools))))
    ok(bool(m) and m.groups() == want, "T5 the layout line announces the real totals",
       "README %s, real %s" % (m.groups() if m else "absent", want))

    print("SUMMARY: %d PASS / %d FAIL (real: %d suites, %d checks; %d tools, %d checks)"
          % (len(passes), len(fails), n_suites, n_checks, len(tools), n_tool_checks))
    print("VERDICT: " + ("GREEN" if not fails else "RED"))
    return 0 if not fails else 1


def counter_proof():
    """Break the README five ways; each must turn the checker RED on the right check."""
    src = os.path.join(ROOT, "README.md")
    with open(src, encoding="utf-8") as f:
        good = f.read()
    sabotages = [
        ("a suite count off by one", "T3 test-ihm.js",
         lambda t: re.sub(r"(node test-ihm\.js\s+#\s*)(\d+)", lambda m: m.group(1) + str(int(m.group(2)) + 1), t, count=1)),
        ("a suite removed from the list", "T1",
         lambda t: re.sub(r"\n\s*node test-types-caches\.js[^\n]*", "", t, count=1)),
        ("a tool count off by one", "T3 tools/verifier-notice-pv.py",
         lambda t: re.sub(r"(tools/verifier-notice-pv\.py\s+#\s*)(\d+)", lambda m: m.group(1) + str(int(m.group(2)) - 1), t, count=1)),
        ("a wrong npm test total", "T4",
         lambda t: re.sub(r"(npm test\s+#\s*\d+\s+suites,\s*)(\d+)", lambda m: m.group(1) + str(int(m.group(2)) - 4), t, count=1)),
        ("a stale layout total", "T5",
         lambda t: re.sub(r"\((\d+) checks in (\w+) suites", "(314 checks in eleven suites", t, count=1)),
    ]
    bad = 0
    tmpdir = tempfile.mkdtemp()
    try:
        rc, _ = subprocess.run([sys.executable, __file__, src], capture_output=True).returncode, 0
        print(("PASS  " if rc == 0 else "FAIL  ") + "CP-0 the real README is GREEN  ->  exit %d" % rc)
        bad += rc != 0
        for i, (label, expect, f) in enumerate(sabotages, 1):
            sab = f(good)
            path = os.path.join(tmpdir, "README-%d.md" % i)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(sab)
            p = subprocess.run([sys.executable, __file__, path], capture_output=True, text=True)
            named = any(l.startswith("FAIL  " + expect) for l in p.stdout.splitlines())
            crashed = "Traceback" in p.stdout + p.stderr
            good_cp = sab != good and p.returncode == 1 and named and not crashed
            print(("PASS  " if good_cp else "FAIL  ") + "CP-%d %s: RED on %s" % (i, label, expect)
                  + "  ->  exit %d, named %s, changed %s" % (p.returncode, named, sab != good))
            bad += not good_cp
    finally:
        shutil.rmtree(tmpdir)
    print("VERDICT: " + ("GREEN (the checker says no when a number is wrong)" if not bad else "RED"))
    return 0 if not bad else 1


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--counter-proof":
        sys.exit(counter_proof())
    sys.exit(check(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "README.md")))
