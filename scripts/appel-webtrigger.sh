#!/usr/bin/env bash
#
# Appel du web trigger en production : le CAS ROUGE et le CAS VERT du contrat
# HTTP (voir README, section « The HTTP contract of the web trigger »).
#
#   - cas rouge : la requête porte `nom` et `e-mail`. La réponse ne doit
#     contenir ni le nom ni l'e-mail en clair.
#   - cas vert : la requête ne porte rien. La réponse doit être le rapport de
#     scan normal (HTTP 200, JSON).
#
# Les sorties BRUTES (corps de réponse, en-têtes, code HTTP, durée, taille)
# sont archivées dans le répertoire de sortie, avec la preuve du grep.
#
# Usage : scripts/appel-webtrigger.sh <URL_WEBTRIGGER> <REPERTOIRE_SORTIE>
#
# L'URL du web trigger N'EST JAMAIS écrite dans ce fichier : c'est une URL de
# déploiement, elle reste dans l'environnement de mesure.
set -u

URL="${1:?usage: appel-webtrigger.sh <URL_WEBTRIGGER> <REPERTOIRE_SORTIE>}"
SORTIE="${2:?usage: appel-webtrigger.sh <URL_WEBTRIGGER> <REPERTOIRE_SORTIE>}"
mkdir -p "$SORTIE"

# Valeurs de test : un nom et une adresse d'exemple (example.com est le
# domaine réservé par l'IANA pour la documentation : aucune personne réelle).
NOM_TEST='Camille Dupont'
EMAIL_TEST='camille.dupont@example.com'

encoder() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

# Un appel : on archive le corps BRUT, les en-têtes, et les métadonnées HTTP.
appel() {
  local etiquette="$1"
  local requete="$2"
  local base="$SORTIE/$etiquette"

  printf '%s\n' "$requete" > "$base.requete.txt"

  curl -sS \
    -D "$base.entetes.txt" \
    -o "$base.reponse.txt" \
    -w '%{http_code} %{time_total} %{size_download}\n' \
    "$requete" > "$base.http.txt" 2> "$base.curl.err"
  local rc=$?

  printf 'rc_curl=%s\n' "$rc" >> "$base.http.txt"
  return $rc
}

# La preuve : combien de fois la valeur apparaît dans le CORPS DE RÉPONSE
# (jamais dans le fichier de requête, qui contient la valeur encodée).
occurrences() {
  local fichier="$1" valeur="$2"
  local n
  n=$(grep -o -i -F -- "$valeur" "$fichier" 2>/dev/null | wc -l | tr -d ' ')
  printf '%s' "${n:-0}"
}

echo "== CAS ROUGE : la requête porte nom et e-mail =="
URL_ROUGE="${URL}?nom=$(encoder "$NOM_TEST")&e-mail=$(encoder "$EMAIL_TEST")"
appel "cas-rouge" "$URL_ROUGE"

echo "== CAS VERT : la requête ne porte rien =="
appel "cas-vert" "$URL"

# --- preuves ------------------------------------------------------------------
for etiquette in cas-rouge cas-vert; do
  base="$SORTIE/$etiquette"
  {
    echo "etiquette=$etiquette"
    echo "http=$(cat "$base.http.txt" | tr '\n' ' ')"
    echo "occurrences_nom_sensible_casse_insensible=$(occurrences "$base.reponse.txt" "$NOM_TEST")"
    echo "occurrences_email_sensible_casse_insensible=$(occurrences "$base.reponse.txt" "$EMAIL_TEST")"
    echo "taille_reponse=$(wc -c < "$base.reponse.txt" | tr -d ' ')"
    echo "sha256_reponse=$(sha256sum "$base.reponse.txt" | cut -d' ' -f1)"
  } > "$base.preuve.txt"
  cat "$base.preuve.txt"
  echo
done

# Le cas rouge doit avoir 0 occurrence ; le cas vert doit en avoir 0 aussi
# (aucun champ n'a été envoyé : rien ne peut fuiter).
rouge_nom=$(occurrences "$SORTIE/cas-rouge.reponse.txt" "$NOM_TEST")
rouge_mail=$(occurrences "$SORTIE/cas-rouge.reponse.txt" "$EMAIL_TEST")
vert_nom=$(occurrences "$SORTIE/cas-vert.reponse.txt" "$NOM_TEST")
vert_mail=$(occurrences "$SORTIE/cas-vert.reponse.txt" "$EMAIL_TEST")
code_rouge=$(head -1 "$SORTIE/cas-rouge.http.txt" | cut -d' ' -f1)
code_vert=$(head -1 "$SORTIE/cas-vert.http.txt" | cut -d' ' -f1)

echo "== VERDICT =="
if [ "$rouge_nom" = "0" ] && [ "$rouge_mail" = "0" ] && [ "$vert_nom" = "0" ] && [ "$vert_mail" = "0" ] \
   && [ "$code_rouge" = "200" ] && [ "$code_vert" = "200" ]; then
  echo "VERT : le nom et l'e-mail sont absents des deux réponses (HTTP 200 sur les deux cas)"
  exit 0
fi
echo "ROUGE : nom=$rouge_nom email=$rouge_mail (cas rouge) | nom=$vert_nom email=$vert_mail (cas vert) | HTTP $code_rouge / $code_vert"
exit 1
