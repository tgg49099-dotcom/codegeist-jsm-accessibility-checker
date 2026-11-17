#!/usr/bin/env python3
"""Checks that README.md names the production versions really served.

Input: a Platform API measurement (JSON) with two apps, `origine` (the app) and
`copie` (the judge copy), each with `environmentsPage.nodes[].versions.nodes[]`
as returned by api.atlassian.com/graphql `app(id:)`. The version with
`isLatest: true` in the PRODUCTION environment of each app must appear in the
README as "production **X**", and the judge copy id must be named.
No network: the measurement is taken elsewhere and passed as a file.
Usage: python3 tools/verifier-versions-readme.py MEASUREMENT.json [README.md]
"""
import json, re, sys

def prod_latest(app):
    for env in app.get('environmentsPage', {}).get('nodes', []):
        if env.get('type') == 'PRODUCTION':
            for v in env.get('versions', {}).get('nodes', []):
                if v.get('isLatest'):
                    return v.get('version')
    return None

def main():
    if len(sys.argv) < 2:
        print(__doc__); return 2
    m = json.load(open(sys.argv[1], encoding='utf-8'))
    readme = open(sys.argv[2] if len(sys.argv) > 2 else 'README.md', encoding='utf-8').read()
    fails = 0
    for key, label in (('origine', 'app'), ('copie', 'judge copy')):
        app = m.get(key)
        if isinstance(app, dict) and isinstance(app.get('app'), dict):
            app = app['app']  # measurement files that wrap the app object
        if not isinstance(app, dict):
            print('FAIL  %s: missing in the measurement' % label); fails += 1; continue
        v = prod_latest(app)
        if not v:
            print('FAIL  %s: no production isLatest version' % label); fails += 1; continue
        ok = re.search(r'production \*\*%s\*\*' % re.escape(v), readme) is not None
        print('%s  %s: production %s served, README names it: %s' % ('PASS' if ok else 'FAIL', label, v, ok))
        fails += 0 if ok else 1
        if key == 'copie':
            short = app.get('id', '').rsplit('/', 1)[-1]
            ok = bool(short) and short in readme
            print('%s  judge copy id %s named in README: %s' % ('PASS' if ok else 'FAIL', short[:8], ok))
            fails += 0 if ok else 1
    print('VERDICT: %s' % ('GREEN' if fails == 0 else 'RED'))
    return 0 if fails == 0 else 1

if __name__ == '__main__':
    sys.exit(main())
