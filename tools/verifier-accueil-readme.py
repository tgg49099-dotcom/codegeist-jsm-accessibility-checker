#!/usr/bin/env python3
"""Checks the first screen of README.md (everything above "## In two minutes").

What a judge reads first must be true and must lead somewhere:
  - every number it quotes about the real scan is READ from the measurement
    (docs/scan-jsm-2026-11-17.json): GET calls, refused calls, findings, split
    by criterion;
  - the number of WCAG criteria equals the heading of the criteria section and
    the rows of its table;
  - the button labels it names exist in the administration page source;
  - the video link is the one stated in the "Contest entry" section;
  - every relative link exists, every #anchor matches a heading;
  - the European Accessibility Act quote cites Annex I, Section III, point (c).
No network. Usage: python3 tools/verifier-accueil-readme.py [README.md]
Exit code 0 = GREEN, 1 = RED.
"""
import json
import os
import re
import sys

README = sys.argv[1] if len(sys.argv) > 1 else "README.md"
ROOT = os.path.dirname(os.path.abspath(README))
fails = 0


def check(label, ok, detail=""):
    global fails
    print("%s  %s%s" % ("PASS" if ok else "FAIL", label, ("  ->  " + detail) if detail else ""))
    fails += 0 if ok else 1


text = open(README, encoding="utf-8").read()
cut = text.find("## In two minutes")
check("the first screen ends at '## In two minutes'", cut > 0)
top = text[:cut] if cut > 0 else text

m = json.load(open(os.path.join(ROOT, "docs", "scan-jsm-2026-11-17.json"), encoding="utf-8"))
calls = m["appels"]
n_get = sum(1 for c in calls if c.get("m") == "GET")
n_refused = sum(1 for c in calls if c.get("status") != 200)
total = m["constats_total"]
split = m["repartition_criteres"]
check("measurement: findings listed = findings counted", len(m["constats"]) == total)

g = re.search(r"(\d+) GET calls, (\d+) refused, \**(\d+) findings\**", top)
check("first screen quotes 'N GET calls, N refused, N findings'", g is not None)
if g:
    check("GET calls = measurement", int(g.group(1)) == n_get, "%s vs %d" % (g.group(1), n_get))
    check("refused calls = measurement", int(g.group(2)) == n_refused, "%s vs %d" % (g.group(2), n_refused))
    check("findings = measurement", int(g.group(3)) == total, "%s vs %d" % (g.group(3), total))
quoted = dict((k, int(v)) for v, k in re.findall(r"(\d+) on (\d\.\d\.\d+)", top))
check("split by criterion = measurement", quoted == {k: int(v) for k, v in split.items()},
      "%s vs %s" % (quoted, split))

h = re.search(r"^## The (\d+) WCAG 2\.2 criteria it checks", text, re.M)
c = re.search(r"\[(\d+) WCAG 2\.2 criteria\]", top)
check("criteria count on the first screen = section heading",
      bool(h and c and h.group(1) == c.group(1)),
      "%s vs %s" % (c and c.group(1), h and h.group(1)))
if h:
    sec = text[h.start():]
    sec = sec[:sec.find("\n## ", 3)]
    rows = re.findall(r"^\|\s*\**(\d\.\d\.\d+)", sec, re.M)
    check("criteria count = rows of the criteria table", len(set(rows)) == int(h.group(1)),
          "%d rows" % len(set(rows)))

ui = open(os.path.join(ROOT, "src", "frontend", "admin.jsx"), encoding="utf-8").read()
named = [re.sub(r"\s+", " ", b[b.index("Run the"):]).strip()
         for b in re.findall(r"\*\*([^*]+)\*\*", top) if "Run the" in b]
check("the first screen names the two buttons of the judge path", len(named) >= 2, str(named))
for label in named:
    check("button '%s' named on the first screen exists in admin.jsx" % label, label in ui)
check("'copy the findings as CSV' matches the CSV area of admin.jsx",
      "copy the findings as CSV" not in top or "Findings as CSV (to copy)" in ui)

v = re.findall(r"https://youtu\.be/[\w-]+", top)
contest = text[text.find("## Contest entry"):]
v2 = re.findall(r"https://youtu\.be/[\w-]+", contest)
check("video link on the first screen = video of the 'Contest entry' section",
      bool(v) and bool(v2) and v[0] == v2[0], "%s vs %s" % (v[:1], v2[:1]))


# The legal sentence of "In two minutes": Directive (EU) 2019/882 puts the
# "perceivable, operable, understandable and robust" requirement for websites
# and online applications of services in Annex I, Section III, point (c)
# (general requirements for all services, made binding by Article 4(3)).
# Section IV holds service-specific requirements and does not say this.
law = re.findall(r'robust"\s*\(Annex I, ([^)]*\))', re.sub(r"\s+", " ", text))
check("the EAA quote cites Annex I, Section III, point (c)",
      bool(law) and all(x.startswith("Section III, point (c)") for x in law), str(law))


def slug(s):
    s = s.strip().lower()
    s = re.sub(r"[^\w\- ]", "", s)
    return s.replace(" ", "-")


anchors = {slug(x) for x in re.findall(r"^#+ (.*)$", text, re.M)}
for link in re.findall(r"\]\(([^)\s]+)\)", top):
    if link.startswith("http"):
        continue
    if link.startswith("#"):
        check("anchor %s matches a heading" % link, link[1:] in anchors)
    else:
        check("file %s exists" % link, os.path.exists(os.path.join(ROOT, link)))

print("VERDICT: %s (%d failure(s))" % ("GREEN" if fails == 0 else "RED", fails))
sys.exit(0 if fails == 0 else 1)
