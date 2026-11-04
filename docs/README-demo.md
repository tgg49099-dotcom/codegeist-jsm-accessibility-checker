# Jeu de démonstration — valeurs fautives écrites par le slot 1 le 04/11/2026

Ces 5 fichiers sont des **contenus** (JSON), pas du code. Ils reproduisent la forme exacte des
réponses REST que l'app Forge du slot 4 devra analyser, et contiennent **des valeurs fautives
réelles écrites ici** (pas des cas inventés de mémoire). Chaque valeur fautive porte un identifiant
`DEMO-xx` : c'est la clé que le contrôleur utilisera dans ses tests.

**Règle de lecture** : une valeur `DEMO-xx` est un **contrat de test**. Si le contrôleur ne produit
pas le constat attendu sur `DEMO-xx`, il est cassé ; s'il produit un constat sur une valeur
`SANTÉ-xx` (contrôle négatif), il produit des faux positifs.

---

## Fichiers

| Fichier | Réponse REST qu'il reproduit |
|---|---|
| `demo-jira-issue-DEMO-101.json` | `GET /rest/api/3/issue/DEMO-101?fields=description` (ADF) |
| `demo-confluence-page-DEMO-202.json` | `GET /wiki/api/v2/pages/20202?body-format=atlas_doc_format` |
| `demo-jsm-requesttype-fields-DEMO-303.json` | `GET /rest/servicedeskapi/servicedesk/12/requesttype/41/field` |
| `demo-jsm-requesttypes-DEMO-304.json` | `GET /rest/servicedeskapi/servicedesk/12/requesttype` |
| `demo-jsm-article-DEMO-305.json` | `GET /rest/servicedeskapi/knowledgebase/article/DEMO-305` |
| `demo-confluence-attachments-DEMO-206.json` | `GET /wiki/api/v2/pages/20202/attachments` |

## Index des fautives (chemin JSON exact)

| ID | Critère | Fichier | Chemin JSON de la valeur fautive | Ce qui est faux |
|---|---|---|---|---|
| **DEMO-01** | 1.1.1 | `demo-jira-issue-DEMO-101.json` | `fields.description.content[2].content[0].attrs` | nœud `media` **sans** `alt` (attribut absent) |
| **DEMO-02** | 1.1.1 | `demo-jira-issue-DEMO-101.json` | `fields.description.content[3].content[0].attrs.alt` | `alt` présent mais **vide** (`""`) |
| **DEMO-03** | 1.3.1 | `demo-jira-issue-DEMO-101.json` | `fields.description.content[4].attrs.level` | `level: 3` alors que le titre précédent est `level: 1` (niveau sauté) |
| **DEMO-04** | 1.3.1 | `demo-jira-issue-DEMO-101.json` | `fields.description.content[5].content[0].content[0].type` | `tableCell` au lieu de `tableHeader` sur la 1ʳᵉ ligne |
| **DEMO-05** | 2.4.4 | `demo-jira-issue-DEMO-101.json` | `fields.description.content[1].content[1].text` | texte de lien `cliquez ici` (but non décrit) |
| **DEMO-06** | 1.4.1 | `demo-jira-issue-DEMO-101.json` | `fields.description.content[6].content[0].marks[0]` | mark `textColor` **seul** sur un glyphe `●` : la couleur est le seul moyen de signaler l'état |
| **DEMO-07** | 2.4.6 | `demo-jira-issue-DEMO-101.json` | `fields.description.content[7].content[0].text` | titre `Détails` : ne décrit ni le sujet ni le but |
| **DEMO-08** | 2.4.4 | `demo-jira-issue-DEMO-101.json` | `fields.description.content[8].content[0].text` | texte de lien = URL brute `https://exemple.test/doc-reinit` |
| **DEMO-09** | 4.1.2 | `demo-jira-issue-DEMO-101.json` | `fields.description.content[11].content[0].attrs` | nœud `mention` avec `id` mais **sans** `text` (nom affiché non porté par le contenu) |
| **DEMO-20** | 2.4.2 | `demo-confluence-page-DEMO-202.json` | `title` | titre de page = `Page` (non descriptif) |
| **DEMO-21** | 1.1.1 | `demo-confluence-page-DEMO-202.json` | `body.value.content[2].content[0].attrs` | nœud `media` **sans** `alt` |
| **DEMO-22** | 1.3.1 | `demo-confluence-page-DEMO-202.json` | `body.value.content[3].content[0].content[0].type` | `tableCell` au lieu de `tableHeader` |
| **DEMO-23** | 2.4.4 | `demo-confluence-page-DEMO-202.json` | `body.value.content[1].content[1].text` | texte de lien `cliquez ici` |
| **DEMO-24** | 1.3.1 | `demo-confluence-page-DEMO-202.json` | `body.value.content[4].attrs.level` | `level: 4` après un `level: 1` (niveau sauté) |
| **DEMO-25** | 1.4.1 | `demo-confluence-page-DEMO-202.json` | `body.value.content[5].content[0].marks[0]` | mark `textColor` **seul** sur un glyphe `●` (`#b71c1c`) |
| **DEMO-26** | 1.4.3 | `demo-confluence-page-DEMO-202.json` | `body.value.content[6].content[0].marks[0].attrs.color` | texte `#f2c200` sur fond blanc supposé → ratio 1,68:1 (sous 4,5:1) |
| **DEMO-27** | 1.3.3 | `demo-confluence-page-DEMO-202.json` | `body.value.content[7].content[0].text` | « Cliquez sur le bouton rouge en haut à droite du formulaire pour continuer. » |
| **DEMO-28** | 1.2.2 | `demo-confluence-attachments-DEMO-206.json` | `results[0].mediaType` | pièce jointe `video/mp4` dans la page, **aucune** pièce jointe `text/vtt` |
| **DEMO-30** | 3.3.2 | `demo-jsm-requesttype-fields-DEMO-303.json` | `requestTypeFields[0].name` | `name` **vide** : le champ du formulaire n'a pas d'étiquette |
| **DEMO-31** | 3.3.2 | `demo-jsm-requesttype-fields-DEMO-303.json` | `requestTypeFields[0].description` | `description` **vide** : aucune instruction |
| **DEMO-32** | 1.3.5 | `demo-jsm-requesttype-fields-DEMO-303.json` | `requestTypeFields[1].name` (+ `.description` vide) | champ `Référence` sans finalité annoncée ni mot-clé de finalité (email, tel, url, nom…) |
| **DEMO-40** | 3.2.6 | `demo-jsm-requesttypes-DEMO-304.json` | `values[1].helpText` | type de demande n° 42 **sans** `helpText`, alors que le n° 41 en a un |
| **DEMO-50** | 2.4.2 | `demo-jsm-article-DEMO-305.json` | `title` | titre d'article de la base de connaissances = `Mise à jour` |

## Contrôles négatifs (ne doivent PAS produire de constat)

| ID | Où | Pourquoi c'est sain |
|---|---|---|
| **SANTÉ-01** | `demo-jira-issue-DEMO-101.json` → `fields.description.content[12].content[0].attrs.alt` | image avec `alt` descriptif → rien à signaler en 1.1.1 |
| **SANTÉ-02** | `demo-jira-issue-DEMO-101.json` → `fields.description.content[9].content[1]` | nœud `status` avec `text` **et** `color` → la couleur ne porte pas seule l'information |
| **SANTÉ-03** | `demo-jira-issue-DEMO-101.json` → `fields.description.content[10].content[0].attrs.state` | `taskItem` avec `state: DONE` → nom (texte) et valeur (état) présents |
| **SANTÉ-04** | `demo-jsm-requesttype-fields-DEMO-303.json` → `requestTypeFields[2]` | champ `Adresse e-mail` avec étiquette **et** description |
| **SANTÉ-05** | `demo-jsm-requesttype-fields-DEMO-303.json` → `requestTypeFields[3]` | champ `Votre nom` avec étiquette **et** description |
| **SANTÉ-06** | `demo-jsm-requesttypes-DEMO-304.json` → `values[0].helpText` | type de demande n° 41 avec `helpText` renseigné |

## Rappel de méthode

Une valeur `DEMO-xx` demonstrates **que le contrôle détecte**, pas que le portail est en faute :
le portail est le produit d'Atlassian, le contenu est celui du client de l'app.
