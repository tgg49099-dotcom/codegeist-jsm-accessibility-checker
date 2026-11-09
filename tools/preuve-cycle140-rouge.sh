#!/bin/sh
# Preuve « rouge avant » du cycle 140 — rejouable par le jury.
#
# Le cycle 140 a ajoute le controle d'administrateur au chemin MCP et l'a
# partage avec le resolver (src/droits-admin.js). Pour montrer que les suites
# SAVENT dire non, on les rejoue sur l'etat d'AVANT — le code publie au
# commit 3d6c1d9, extrait par `git show`, donc la preuve ne depend d'aucune
# copie locale conservee.
#
# Usage : sh tools/preuve-cycle140-rouge.sh
# Sortie : les fichiers d'avant sont ecrits dans src/, les deux suites sont
# jouees dessus (resultat attendu : ROUGE, code de retour 1), puis les
# fichiers d'avant sont supprimes de src/.
set -e
APP=$(cd "$(dirname "$0")/.." && pwd)
cd "$APP"

echo "== AVANT : le code publie au commit 3d6c1d9 (identite prouvee par md5) =="
git show 3d6c1d9:src/mcp.js > src/mcp.js.avant-admin-cycle140
git show 3d6c1d9:src/resolvers.js > src/resolvers.avant-cycle140.js
md5sum src/mcp.js.avant-admin-cycle140
git show 3d6c1d9:src/mcp.js | md5sum
md5sum src/resolvers.avant-cycle140.js
git show 3d6c1d9:src/resolvers.js | md5sum
echo ""

echo "== SUITE MCP sur l'etat d'AVANT (le resultat attendu est ROUGE) =="
set +e
node test-mcp-admin-cycle140.js src/mcp.js.avant-admin-cycle140
RC_MCP=$?
set -e
echo "RC suite MCP sur l'avant = $RC_MCP (1 = ROUGE)"
echo ""

echo "== SUITE ADMIN sur l'etat d'AVANT (le resultat attendu est ROUGE) =="
set +e
node test-admin-cycle139.js src/resolvers.avant-cycle140.js
RC_ADMIN=$?
set -e
echo "RC suite ADMIN sur l'avant = $RC_ADMIN (1 = ROUGE)"
echo ""

rm -f src/mcp.js.avant-admin-cycle140 src/resolvers.avant-cycle140.js
echo "== fichiers avant supprimes de src/ =="
ls src/
