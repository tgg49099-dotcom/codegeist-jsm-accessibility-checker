# CRITÈRES WCAG 2.2 AA vérifiables dans Jira / Confluence / JSM

**Destinataire** : le slot 4 (app Forge pour le **portail client de Jira Service Management**), via la mère.
**Auteur** : slot 1 — **écrit le 04/11/2026**, entre 09:11 et ~10:40.
**Objet** : la liste des critères WCAG 2.2 que l'**API REST** ou le **contenu** Jira/Confluence/JSM
permet de vérifier, avec pour chacun un exemple réel et un test de contrôle implémentable tel quel.
**Ce que ce document n'est pas** : ce n'est pas une fiche produit, ni un comparatif, ni du code.
Il ne contient **aucune promesse de conformité** : le produit du slot 4 produit des **constats à
faire vérifier**, jamais un verdict « conforme » (précédent FTC/accessiBe, 1 M$ ; HalfAccessible :
« *We do not sell "guaranteed compliance" — nobody honestly can* »).

**Sources : W3C WCAG 2.2, Recommandation du 12/12/2024** (https://www.w3.org/TR/WCAG22/) +
les URL officielles Atlassian listées au §17, **toutes relues le 04/11/2026**. Les intitulés de
critères sont reproduits en anglais tels qu'ils figurent dans la Recommandation ; les 87 critères
(niveaux A = 31, AA = 24, AAA = 31, plus 4.1.1 désormais obsolète) et leur texte normatif sont
déjà dans `/work/eaa-atlassian/referentiel-wcag.json` (md5 `df0d097ea5ee17f304d9d091768803ae`).

---

## 0. Mode d'emploi

### 0.1 Les trois niveaux de confiance (définition exacte)

| Niveau | Ce que ça veut dire | Ce que l'app doit afficher |
|---|---|---|
| **`REST vérifiable`** | La valeur fautive est **un champ nommé d'une réponse REST** : l'app la lit directement, sans interprétation. | Constat **prouvé** : « le champ X de la ressource Y vaut Z ». |
| **`contenu seulement (partiel)`** | La donnée est dans le contenu, mais l'API ne donne **qu'une partie** de ce qu'exige le critère (le reste dépend du rendu ou d'un jugement humain). | Constat **à vérifier** : l'app montre la valeur et dit sur quoi elle ne peut pas statuer. |
| **`rendu navigateur (hors de portée d'une app)`** | La donnée n'existe que dans la page rendue (styles calculés, ordre de focus, libellés composés). | Rien à signaler : l'app **ne dit rien** sur ce critère, elle le dit dans sa note de méthode. |

Règle de méthode : une affirmation sans source va dans le §16 « non vérifié », jamais dans le corps.

### 0.2 Les 5 appels REST prouvés (tout a été ouvert et lu le 04/11/2026)

| # | Appel | Scope OAuth documenté (3LO) | Ce qu'il renvoie exactement | Où c'est vérifié |
|---|---|---|---|---|
| **E1** | `GET /rest/api/3/issue/{issueIdOrKey}?fields=description` | `read:jira-work` (nom du scope Forge **non vérifié** le 04/11) | `fields.description` = document **ADF** (JSON) | Schéma officiel Jira platform v3 (HTTP 200 le 04/11) |
| **E2** | `GET /wiki/api/v2/pages/{id}?body-format=atlas_doc_format` | `read:page:confluence` | `title`, `body.atlas_doc_format.value` = ADF, `labels`, `properties` | OpenAPI officiel Confluence v2 (HTTP 200 le 04/11) |
| **E3** | `GET /wiki/api/v2/pages/{id}/attachments` | `read:attachment:confluence` | Liste des pièces jointes : `id`, `status`, `title`, `createdAt`, `pageId`, `mediaType`, `mediaTypeDescription`, `comment`, **`fileId`**, `fileSize`, `webuiLink`, `downloadLink` — **pas de champ `filename`** dans le schéma : le nom de fichier se lit dans le `downloadLink` | OpenAPI officiel Confluence v2 |
| **E4** | `GET /rest/servicedeskapi/servicedesk/{serviceDeskId}/requesttype/{requestTypeId}/field` | `read:servicedesk-request` | `requestTypeFields[]` : `name`, `description`, `required`, `visible`, `fieldId`, `jiraSchema`, `validValues`, `defaultValues` | Schéma officiel JSM v3 (`RequestTypeFieldDTO`) |
| **E5** | `GET /rest/servicedeskapi/servicedesk/{serviceDeskId}/requesttype` | `read:servicedesk-request` | `values[]` : `id`, `name`, **`helpText`**, `issueTypeId`, `portalId`, `restrictionStatus` | Schéma officiel JSM v3 (`RequestTypeDTO`) |

Deuxième chemin vers le contenu d'un article de la base de connaissances :
`GET /rest/servicedeskapi/knowledgebase/article` renvoie `ArticleDTO` = `{ title, excerpt, source, content }`
où **`content` ne contient qu'un `iframeSrc`** (un lien de rendu), et `source.type` vaut `"confluence"`.
→ **le contenu vérifiable d'un article de base de connaissances est la page Confluence qui le porte**
(E2/E3), pas l'API « article ». L'endpoint `GET /rest/servicedeskapi/knowledgebase/article/view/{pageId}`
(scope `read:knowledgebase:jira-service-management`, statut *Beta* dans la doc) renvoie un
`application/json` dont le schéma est `type: string`, **sans description** → l'app ne doit pas
construire son contrôle sur la forme de cette chaîne tant qu'elle n'a pas été vue sur un site réel.

### 0.3 Les points d'ancrage des exemples

Tous les exemples viennent des **5 fichiers de démonstration** que j'ai écrits le 04/11/2026 dans
`/work/codegeist-appui/demo/` (contenu, pas du code). Chaque valeur fautive porte un identifiant
`DEMO-xx` et un chemin JSON exact ; l'index complet est dans `demo/README-demo.md`.
Les `SANTÉ-xx` sont des **contrôles négatifs** : l'app ne doit rien signaler dessus.

### 0.4 Le contrat de sortie, commun à tous les tests

Chaque contrôle renvoie une liste de constats de cette forme :

```
{ "critere": "1.1.1", "niveau": "A", "source": "E1", "ressource": "DEMO-101",
  "emplacement": "fields.description.content[2].content[0].attrs", "valeur": null,
  "message": "Image sans texte alternatif", "preuve": "DEMO-01", "a_verifier": false }
```

`a_verifier: true` ⇔ le critère est de niveau « contenu seulement (partiel) » : l'app **signale**,
elle ne **condamne** pas.

---

## 1. Tableau de synthèse

| # | Critère | Niveau de confiance | Exemple | Ce que l'app peut dire |
|---|---|---|---|---|
| 1 | 1.1.1 Non-text Content | `REST vérifiable` | DEMO-01 / DEMO-02 / DEMO-21 | « image sans alternative » |
| 2 | 1.3.1 Info and Relationships | `REST vérifiable` | DEMO-03 / DEMO-04 / DEMO-22 / DEMO-24 | « niveau de titre sauté », « en-tête de tableau absent » |
| 3 | 2.4.4 Link Purpose (In Context) | `REST vérifiable` | DEMO-05 / DEMO-08 / DEMO-23 | « texte de lien non descriptif » |
| 4 | 3.3.2 Labels or Instructions | `REST vérifiable` | DEMO-30 / DEMO-31 | « champ sans étiquette », « champ sans instruction » |
| 5 | 4.1.2 Name, Role, Value | `REST vérifiable` | DEMO-09 | « nom non porté par le contenu » |
| 6 | 2.4.2 Page Titled | `REST vérifiable` | DEMO-20 / DEMO-50 | « titre non descriptif » |
| 7 | 3.2.6 Consistent Help | `REST vérifiable` | DEMO-40 | « aide inconsistente entre types de demande » |
| 8 | 1.4.1 Use of Color | `contenu seulement (partiel)` | DEMO-06 / DEMO-25 | « l'information n'est portée que par la couleur » |
| 9 | 1.4.3 Contrast (Minimum) | `contenu seulement (partiel)` | DEMO-26 | « contraste incertain : ratio calculé sur fond blanc » |
| 10 | 1.2.2 Captions (Prerecorded) | `contenu seulement (partiel)` | DEMO-28 | « vidéo sans transcription disponible » |
| 11 | 2.4.6 Headings and Labels | `contenu seulement (partiel)` | DEMO-07 | « titre trop vague » |
| 12 | 1.3.5 Identify Input Purpose | `contenu seulement (partiel)` | DEMO-32 | « finalité du champ non annoncée » |
| 13 | 1.3.3 Sensory Characteristics | `contenu seulement (partiel)` | DEMO-27 | « instruction qui repose sur la position ou la couleur » |

**Répartition** : 7 critères `REST vérifiable`, 6 critères `contenu seulement (partiel)`, 0 critère
`rendu navigateur` dans la liste — les 3 constats impossibles sont au §15.

---

## 2. Critère 1 — 1.1.1 Non-text Content (niveau A)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **1.1.1 Non-text Content**<br>(niveau A) | **ADF**, nœud `media` : `attrs.alt` (chaîne, **facultative** — le schéma ADF n'exige que `type`, `id`, `collection`), `attrs.type` (`file`/`link`/`external`), `attrs.id`, `attrs.collection`, `attrs.width`/`height`.<br>Sources : E1 (description d'issue ADF), E2 (corps ADF d'une page Confluence, `body.atlas_doc_format.value`), et pour un article de base de connaissances JSM la page Confluence qui le porte (`source.type = "confluence"`).<br>**Niveau : `REST vérifiable`** — la valeur est lue telle quelle dans `attrs.alt`. | **DEMO-01** — `demo-jira-issue-DEMO-101.json`, `fields.description.content[2].content[0].attrs` : nœud `media` (`id: 4478e39c-…`, `type: file`) **sans** la clé `alt`.<br>**DEMO-02** — même fichier, `fields.description.content[3].content[0].attrs.alt` = `""` (vide).<br>**DEMO-21** — `demo-confluence-page-DEMO-202.json`, `body.value.content[2].content[0].attrs` : idem, sans `alt`. | **Entrée** : un document ADF (E1 ou E2).<br>**Parcours** : récursif sur `content[]` ; à chaque nœud `type == "media"`.<br>**Sortie attendue** : si `attrs.alt` est **absent** → constat `critere: "1.1.1"`, `valeur: null`, message « image sans texte alternatif » ; si `attrs.alt == ""` → constat `valeur: ""`, message « texte alternatif vide » ; si `alt` est non vide → **aucun** constat (contrôle négatif **SANTÉ-01** : `content[12].content[0].attrs.alt` = « Capture d'écran du formulaire de réinitialisation du mot de passe »).<br>**Codes retour** : `200` + tableau de constats (vide = rien trouvé) ; `404` ressource absente → « rien à vérifier », pas d'erreur ; `401`/`403` scope manquant → état **« non vérifiable »**, jamais « conforme » ; `429` → file d'attente. | L'app **ne peut pas** savoir si l'image est décorative (exception prévue par 1.1.1) → tout constat 1.1.1 est une **alerte à vérifier**, pas un échec.<br>Une image **jointe mais non insérée** n'a aucun texte alternatif lisible : le bean `Attachment` de l'API Jira ne contient que `author, content, created, filename, id, mimeType, self, size, thumbnail` — **pas de champ `alt`** (vérifié le 04/11 dans le schéma officiel).<br>Un média `type == "link"` pointe vers une URL externe : son contenu n'est pas analysé. |

## 3. Critère 2 — 1.3.1 Info and Relationships (niveau A)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **1.3.1 Info and Relationships**<br>(niveau A) | **ADF** : `heading` → `attrs.level` (entier 1-6, obligatoire) ; `table` → `tableRow` → nœuds **`tableHeader`** ou **`tableCell`** (deux types distincts dans le schéma ADF : `table_header_node` et `table_cell_node`) ; `tableCell.attrs` : `colspan`, `rowspan`, `colwidth`, `background`, `valign` ; `listItem`, `media`, `panel` (contenu d'une liste ou d'un panneau).<br>**Niveau : `REST vérifiable`** — `attrs.level` et le type du nœud de cellule sont des valeurs, pas des déductions. | **DEMO-03** — `demo-jira-issue-DEMO-101.json`, `fields.description.content[4].attrs.level` = `3`, alors que le titre précédent (`content[0].attrs.level`) vaut `1` → niveau 2 sauté.<br>**DEMO-04** — même fichier, `fields.description.content[5].content[0].content[0].type` = `"tableCell"` : la 1ʳᵉ ligne du tableau n'a **aucun** `tableHeader`.<br>**DEMO-22** — `demo-confluence-page-DEMO-202.json`, `body.value.content[3].content[0].content[0].type` = `"tableCell"` (même défaut).<br>**DEMO-24** — même fichier, `body.value.content[4].attrs.level` = `4` après un `level: 1`. | **Entrée** : document ADF.<br>**Règle 1 — hiérarchie** : parcourir les `heading` dans l'ordre du document ; comparer `level` au niveau précédent ; si `level − niveau_précédent > 1` → constat « niveau de titre sauté de X à Y ». (Le premier titre d'un document n'est pas signalé.)<br>**Règle 2 — tableaux** : pour chaque `table`, prendre `content[0]` (1ʳᵉ ligne) ; si **aucun** de ses nœuds enfants est de type `tableHeader` → constat « en-tête de tableau absent ».<br>**Sortie attendue** : un constat par occurrence, avec `emplacement` = chemin JSON exact.<br>**Codes retour** : idem §2 (`200` / `404` / `401`-`403` → non vérifiable / `429`). | L'app voit la structure **déclarée**, pas la structure **rendue** : un tableau servant à la mise en page ou une liste à puces dans une cellule sont indiscernables d'un tableau de données.<br>La **portée** réelle d'un en-tête (`colspan`/`rowspan`) n'est pas déductible : savoir si un `tableHeader` couvre telle cellule est un jugement humain.<br>Les relations exprimées hors structure (par exemple « voir le tableau ci-dessus ») ne sont pas analysables par l'API. |

## 4. Critère 3 — 2.4.4 Link Purpose (In Context) (niveau A)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **2.4.4 Link Purpose (In Context)**<br>(niveau A) | **ADF** : nœud `text` porteur du mark `link` → `marks[].attrs.href` (obligatoire dans le schéma) ; le **texte** du lien est le texte des nœuds `text` qui portent le mark (un lien peut être réparti sur plusieurs runs : il faut concaténer). Le mark `link` est aussi accepté sur les nœuds `media` et `emoji` (l'alternative textuelle y joue le rôle de nom du lien).<br>**Niveau : `REST vérifiable`** pour la **valeur** du texte ; l'**interprétation** (le texte décrit-il le but ?) reste un signalement. | **DEMO-05** — `demo-jira-issue-DEMO-101.json`, `fields.description.content[1].content[1].text` = `"cliquez ici"`, `marks[0].attrs.href` = `https://exemple.test/reinit`.<br>**DEMO-08** — même fichier, `fields.description.content[8].content[0].text` = `"https://exemple.test/doc-reinit"` : le texte du lien est une URL brute.<br>**DEMO-23** — `demo-confluence-page-DEMO-202.json`, `body.value.content[1].content[1].text` = `"cliquez ici"`. | **Entrée** : document ADF.<br>**Calcul** : pour chaque groupe de nœuds `text` portant le mark `link`, concaténer leur `text` → `libelle`.<br>**Sortie attendue** : si `libelle` normalisé (minuscules, sans ponctuation) appartient à la liste des libellés non descriptifs — `cliquez ici`, `cliquez ici pour plus d'informations`, `en savoir plus`, `ici`, `lire la suite`, `voir`, `documentation`, `télécharger`, `lien`, `plus d'infos` — **ou** si `libelle` est une URL (`^https?://`) **ou** si `libelle` ne contient aucun caractère alphanumérique → constat « texte de lien non descriptif », avec le `href` en evidence.<br>**Codes retour** : idem §2. | Le **but réel** de la destination est un jugement humain : la liste est un **signalement**, pas une preuve.<br>Le critère est « *In Context* » : l'app évalue le texte du lien, **pas** la phrase qui l'accompagne (cette phrase est ce qui rend le lien compréhensible dans la plupart des cas → **faux positifs fréquents**).<br>Les liens produits par l'éditeur (mention, « piéger le lien », lien automatique) portent des libellés variables : l'app doit les **ignorer** plutôt que les signaler.<br>Le contenu de destination n'est pas lu (pas d'appel réseau vers `href` : pas de permission, pas de raison). |

## 5. Critère 4 — 3.3.2 Labels or Instructions (niveau A)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **3.3.2 Labels or Instructions**<br>(niveau A) | **JSM, E4** : chaque champ du formulaire de demande → `name` (étiquette), `description` (instruction affichée sous le champ), `required`, `visible`, `fieldId`, `jiraSchema` (type Jira + `customId`), `validValues`/`defaultValues`.<br>**JSM, E5** : chaque type de demande → `name`, **`helpText`** (aide du type de demande).<br>**Niveau : `REST vérifiable`**.<br>**Contre-épreuve à connaître** : le `createmeta` de Jira (REST v3, `FieldCreateMetadata`) ne contient **pas** de `helpText` (champs : `allowedValues, autoCompleteUrl, configuration, defaultValue, fieldId, hasDefaultValue, key, name, operations, required, schema`) → l'app doit passer par **E4**, pas par `createmeta`, pour l'instruction d'un champ de portail. | **DEMO-30** — `demo-jsm-requesttype-fields-DEMO-303.json`, `requestTypeFields[0].name` = `""` : le champ du formulaire n'a **pas d'étiquette** (il est `required: true`).<br>**DEMO-31** — même fichier, `requestTypeFields[0].description` = `""` : aucune instruction.<br>Contrôles négatifs : `requestTypeFields[2]` (`name` = « Adresse e-mail », `description` = « Saisissez votre adresse e-mail professionnelle… ») et `requestTypeFields[3]` (`name` = « Votre nom », `description` = « Indiquez votre nom de famille. ») → rien à signaler (**SANTÉ-04**, **SANTÉ-05**). | **Entrée** : E4 (`requestTypeFields[]`).<br>**Règle** : ne traiter que les champs `visible == true` (un champ caché n'est pas rendu).<br>**Sortie attendue** : `name` absent ou vide → constat « champ sans étiquette » ; `name` non vide **et** `description` vide → constat « champ sans instruction » (`a_verifier: true`, car l'instruction n'est pas obligatoire si le nom suffit).<br>**Codes retour** : `200` + constats ; `404` (service desk ou type de demande introuvable) → rien à vérifier ; `403` → non vérifiable ; `429` → file d'attente. | L'**étiquette visible rendue** par le portail peut différer du `name` : le portail compose le libellé (traduction, suffixe d'obligation `*`, icône, aide contextuelle). L'app vérifie la **donnée**, pas l'écran.<br>Un `name` non vide n'est pas nécessairement une bonne étiquette (c'est du jugement humain) → l'app ne fait qu'un contrôle de **présence**, pas de qualité.<br>Les **erreurs de validation** affichées par le portail (3.3.1) ne sont pas dans E4 : hors de portée de l'API. |

## 6. Critère 5 — 4.1.2 Name, Role, Value (niveau A)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **4.1.2 Name, Role, Value**<br>(niveau A) | **ADF** :<br>• `taskItem.attrs.state` = `"TODO"` ou `"DONE"` (obligatoire) → la **valeur** ; le texte du `taskItem` → le **nom**.<br>• `status.attrs.text` (obligatoire, longueur ≥ 1) → le nom **et** la valeur ; `status.attrs.color` → l'indicateur visuel.<br>• `mention.attrs.id` (obligatoire) + `mention.attrs.text` (**facultatif**) → le nom affiché de la personne.<br>**Niveau : `REST vérifiable`** pour la présence des valeurs. | **DEMO-09** — `demo-jira-issue-DEMO-101.json`, `fields.description.content[11].content[0].attrs` : nœud `mention` avec `id: 5b10a2844c20165700ede21g` et `userType: DEFAULT`, mais **sans** `text`.<br>Contrôle négatif : `content[10].content[0].attrs.state` = `"DONE"` avec un texte → nom et valeur présents, rien à signaler (**SANTÉ-03**). | **Entrée** : document ADF.<br>**Sortie attendue** : nœud `mention` sans `attrs.text` → constat « nom de la mention non porté par le contenu » ; `status` sans `attrs.text` → constat « statut sans libellé » (impossible par le schéma, donc à traiter comme une donnée corrompue) ; `taskItem` → contrôle systematically positif (nom = texte, valeur = `state`) → aucun constat.<br>**Codes retour** : idem §2. | Le **rôle** (role) n'est pas une donnée ADF : il dérive du type de nœud **et** du rendu du portail (une liste de tâches devient une liste à cases à cocher) → l'app ne peut pas le vérifier.<br>Le nom accessible **calculé** d'un contrôle (étiquette + aide + erreur concaténées) n'est pas exposé par l'API.<br>Le repli de rendu d'une `mention` sans `text` (« Utilisateur inconnu » ?) n'est pas documenté → l'app ne peut pas affirmer que le nom est vide à l'écran. |

## 7. Critère 6 — 2.4.2 Page Titled (niveau A)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **2.4.2 Page Titled**<br>(niveau A) | **E2** : `GET /wiki/api/v2/pages/{id}` → `title` (chaîne).<br>**E5** : `GET …/requesttype` → `values[].name` (le nom du type de demande est le titre de la page de formulaire dans le portail).<br>**Base de connaissances JSM** : `GET /rest/servicedeskapi/knowledgebase/article` → `ArticleDTO.title`.<br>**Niveau : `REST vérifiable`**. | **DEMO-20** — `demo-confluence-page-DEMO-202.json`, `title` = `"Page"`.<br>**DEMO-50** — `demo-jsm-article-DEMO-305.json`, `title` = `"Mise à jour"`. | **Entrée** : `title` (E2) ou `ArticleDTO.title` ou `values[].name` (E5).<br>**Sortie attendue** : si `title` normalisé est vide **ou** appartient à la liste des titres non descriptifs (`page`, `document`, `mise a jour`, `nouveau`, `sans titre`, `home`, `accueil`, `index`, `article`, `notes`) **ou** s'il ne partage **aucun** mot significatif (≥ 4 caractères) avec les 10 premiers mots du corps → constat « titre non descriptif ».<br>**Codes retour** : idem §5. | Le `<title>` **rendu** = titre + nom du site + nom de l'espace ; l'app ne voit que le titre du contenu.<br>L'unicité du titre parmi toutes les pages n'est vérifiable que si l'app liste l'espace (`GET /wiki/api/v2/pages?space-id=`) — c'est une portée et un coût à confirmer.<br>La **pertinence** du titre (2.4.2 « descriptive ») reste un jugement humain : l'app fait un contrôle lexical, donc un signalement. |

## 8. Critère 7 — 3.2.6 Consistent Help (niveau A, nouveau en WCAG 2.2)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **3.2.6 Consistent Help**<br>(niveau A, nouveau en 2.2) | **E5** : `values[].helpText` par type de demande d'un service desk ; `values[].name`.<br>**E4** : `requestTypeFields[].description` par champ d'un type de demande.<br>**Niveau : `REST vérifiable`** pour la **présence** de l'aide ; l'**emplacement** n'est pas lisible. | **DEMO-40** — `demo-jsm-requesttypes-DEMO-304.json` : `values[0].helpText` (type 41 « Réinitialisation du mot de passe ») est renseigné ; `values[1].helpText` (type 42 « Demande de facture ») = `""` → l'aide existe pour un parcours et pas pour l'autre.<br>Contrôle négatif : le type 41 seul, avec son `helpText` renseigné (**SANTÉ-06**) → aucun constat d'incohérence (le contrôle ne vaut que s'il y a **deux** types comparables). | **Entrée** : E5 (liste des types de demande d'un même service desk) + E4 pour chaque type.<br>**Sortie attendue** : si au moins un type de demande a un `helpText` non vide **et** qu'un autre du même service desk a un `helpText` vide → constat « aide inconsistente entre types de demande » ; idem sur `description` de champs de même nom (`name` identique, `description` présente dans un type et absente dans un autre).<br>**Codes retour** : idem §5. | 3.2.6 parle de l'**emplacement relatif** de l'aide dans le processus (« le même ordre relatif ») : l'API donne la **présence**, pas la position à l'écran → le constat est `a_verifier: true`.<br>L'API ne dit rien de la cohérence entre les **pages de la base de connaissances** ni avec l'aide de l'écran de connexion du portail.<br>Deux services desk différents sont hors périmètre du contrôle (le critère s'applique à un même processus). |

## 9. Critère 8 — 1.4.1 Use of Color (niveau A)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **1.4.1 Use of Color**<br>(niveau A) | **ADF** : mark `textColor` → `attrs.color` (motif `^#[0-9a-fA-F]{6}$`) ; `status.attrs.color` (nom de couleur ou hex) ; `tableCell.attrs.background` (couleur de fond, chaîne libre) ; `panel.attrs.panelType` (`info`, `note`, `warning`, `success`, `error`).<br>Les autres marks d'un même texte (`strong`, `underline`, `em`, `code`) sont lisibles dans `marks[]`.<br>**Niveau : `contenu seulement (partiel)`** — l'API donne la couleur **écrite**, jamais la couleur **rendue** (fond réel, thème). | **DEMO-06** — `demo-jira-issue-DEMO-101.json`, `fields.description.content[6].content[0]` : texte `"●"` dont le **seul** mark est `textColor` (`#c62828`) — le sens du caractère (une pastille d'état) n'est porté que par la couleur.<br>**DEMO-25** — `demo-confluence-page-DEMO-202.json`, `body.value.content[5].content[0]` : même mécanisme, `#b71c1c`.<br>Contrôle négatif : `content[9].content[1]` = nœud `status` avec `text: "En cours"` **et** `color: "blue"` → la couleur ne porte pas seule l'information (**SANTÉ-02**). | **Entrée** : document ADF.<br>**Sortie attendue** : un nœud `text` dont le texte normalisé ne contient **aucun** caractère alphanumérique (glyphe seul : `●`, `■`, `•`) et qui porte un mark `textColor` **sans** `strong`/`underline`/`em` → constat « l'information n'est portée que par la couleur » (`a_verifier: true`).<br>Variante (à implémenter si le temps le permet) : deux lignes de tableau identiques sauf `tableCell.attrs.background` → même constat.<br>**Codes retour** : idem §2. | Le **fond réel** (thème du portail, couleur du conteneur) est inconnu → l'app ne peut pas dire si la couleur est « suffisante ».<br>Un texte coloré dont le **sens est déjà dans les mots** (p. ex. « Urgent » en rouge) ne doit **pas** être signalé : c'est pourquoi le test ne vise que le glyphe seul.<br>Un contenu qui distingue deux éléments par la couleur **et** par la forme n'est pas vu par l'app (la forme n'est pas dans l'API).<br>Les couleurs de l'**interface** du portail (boutons, champs en erreur) ne sont pas dans le contenu : hors périmètre d'une app de contenu. |

## 10. Critère 9 — 1.4.3 Contrast (Minimum) (niveau AA)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **1.4.3 Contrast (Minimum)**<br>(niveau AA) | **ADF** : `textColor.attrs.color` (hex 6 chiffres) ; `tableCell.attrs.background` ; `status.attrs.color`. Le **thème du portail** (couleur de texte par défaut, fond des blocs, couleur de texte sur `panel`) **n'est dans aucune** de ces API → la couleur de premier plan **rendue** est inconnue ; la couleur de fond **rendue** aussi.<br>**Niveau : `contenu seulement (partiel)`** — l'app peut calculer un ratio **sous hypothèse**. | **DEMO-26** — `demo-confluence-page-DEMO-202.json`, `body.value.content[6].content[0]` : texte « Merci de votre patience » avec `textColor` `#f2c200`.<br>Ratio calculé par l'app **sous l'hypothèse explicite « fond blanc »** : luminance relative de `#f2c200` = 0,5748 → ratio = (1,00 + 0,05) / (0,5748 + 0,05) = **1,68:1** → très en dessous de 4,5:1 (texte normal) et de 3:1 (grand texte).<br>Comparaison : `#c62828` (DEMO-06) sur blanc = 5,62:1 → **passe** 4,5:1 : l'app ne doit donc pas le signaler. | **Entrée** : document ADF + la couleur hexadécimale trouvée.<br>**Calcul** : luminance relative WCAG : `c_lin = c/255 ; c_lin ≤ 0,03928 ? c_lin/12,92 : ((c_lin+0,055)/1,055)^2,4` par canal ; `L = 0,2126·R + 0,7152·G + 0,0722·B` ; ratio = `(L1 + 0,05) / (L2 + 0,05)`.<br>**Sortie attendue** : ratio calculé < 4,5 (texte normal) ou < 3,0 (grand texte) → constat **« contraste incertain »** avec la mention explicite `hypothese: "fond blanc"` et `a_verifier: true` ; ratio ≥ seuil → aucun constat.<br>**Codes retour** : idem §2. | C'est le **premier** des 3 constats impossibles (§15.1) : l'app ne connaît ni le fond ni la couleur de texte par défaut du portail ; un ratio calculé sur fond blanc peut être **faux** (le portail peut être en thème sombre → le texte jaune devient lisible).<br>L'app ne peut donc **jamais** conclure « contraste conforme » : au mieux, elle signale un risque sous hypothèse. |

## 11. Critère 10 — 1.2.2 Captions (Prerecorded) (niveau A)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **1.2.2 Captions (Prerecorded)**<br>(niveau A) | **E3** : `GET /wiki/api/v2/pages/{id}/attachments` → pour chaque pièce jointe : `mediaType` (MIME), `fileId`, `fileSize`, `webuiLink`, `downloadLink`. Le schéma officiel décrit `fileId` comme « *the ID referenced in `atlas_doc_format` bodies* » → l'app peut relier un nœud `media` (ADF) à sa pièce jointe. Le nom de fichier se lit dans le `downloadLink` (le schéma n'a pas de `filename`).<br>**E1** : `GET /rest/api/3/issue/{key}?fields=attachment` → bean `Attachment` : `filename`, `mimeType`, `content`, `size`, `created` (celui-ci a bien `filename`).<br>Une piste de transcription se voit comme une pièce jointe `text/vtt` ou un `downloadLink` terminant par `.vtt`/`.srt`.<br>**Niveau : `contenu seulement (partiel)`**. | **DEMO-28** — `demo-confluence-attachments-DEMO-206.json` : `results[0]` = pièce jointe `mediaType: "video/mp4"`, `downloadLink: "/wiki/download/attachments/20202/tuto-portail.mp4"`, `fileId: 4478e39c-…` ; `results[1]` = une image PNG ; **aucune** pièce jointe de type `text/vtt` → aucune transcription disponible dans le contenu. | **Entrée** : E3 (ou les attachments d'une issue).<br>**Sortie attendue** : si au moins une pièce jointe a `mediaType` commençant par `video/` (ou `audio/`) **et** qu'aucune pièce jointe n'a `mediaType == "text/vtt"` ni `downloadLink` terminant par `.vtt`/`.srt` → constat « média sans transcription disponible » (`a_verifier: true`).<br>**Codes retour** : `200` + constats ; `404` page absente → rien à vérifier ; `403` → non vérifiable ; `429` → file d'attente. | La présence d'un fichier `.vtt` ne prouve pas qu'il est **lié** au média : le lien se fait dans le corps de la page, via un mécanisme que je n'ai **pas** pu vérifier dans la documentation officielle le 04/11 (le vocabulaire du balisage `storage` n'est pas documenté dans la doc REST v2 consultée) → l'app ne peut pas affirmer que la transcription est **rattachée**.<br>Les sous-titres **incrustés** dans la vidéo (burned-in) sont invisibles à l'API.<br>L'app ne transcrit rien et ne lit pas l'audio : elle signale l'absence de piste, pas l'absence de sous-titres. |

## 12. Critère 11 — 2.4.6 Headings and Labels (niveau AA)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **2.4.6 Headings and Labels**<br>(niveau AA) | **ADF** : `heading` → `attrs.level` + le texte de ses nœuds `text` ; `panel.attrs.panelType` ; `status.attrs.text`.<br>Le **rendu** (la taille, la casse, le positionnement du titre) n'est pas dans l'API : seuls le **texte** et le **niveau** le sont.<br>**Niveau : `contenu seulement (partiel)`**. | **DEMO-07** — `demo-jira-issue-DEMO-101.json`, `fields.description.content[7].content[0].text` = `"Détails"` (niveau 2) : le titre ne dit ni de quoi il s'agit ni à quoi il sert. | **Entrée** : document ADF.<br>**Sortie attendue** : pour chaque `heading`, si le texte normalisé ∈ {`détails`, `détail`, `informations`, `info`, `misc`, `miscellaneous`, `autres`, `suite`, `introduction`, `à propos`, `ici`, `liens`, `annexe`} **ou** s'il compte moins de 2 mots → constat « titre trop vague » (`a_verifier: true`).<br>**Codes retour** : idem §2. | La pertinence du titre (2.4.6) est un **jugement humain** : la liste est heuristique et produit des faux positifs (« Détails » peut être parfaitement adapté dans un article court dont le sujet est évident — c'est le cas d'usage « hors contexte »).<br>Les **étiquettes** de contrôles (3.3.2) sont traitées au §5, pas ici ; un même mot peut être acceptable comme titre et critiquable comme étiquette. |

## 13. Critère 12 — 1.3.5 Identify Input Purpose (niveau AA)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **1.3.5 Identify Input Purpose**<br>(niveau AA) | **E4** : `requestTypeFields[].name`, `.description`, `.jiraSchema` (type Jira du champ), `.required`, `.visible`.<br>L'attribut HTML `autocomplete` du champ **rendu par le portail** n'est dans aucune API : c'est le portail qui le fixe.<br>**Niveau : `contenu seulement (partiel)`** — l'app vérifie que le contenu **annonce** la finalité, pas que le navigateur l'identifie. | **DEMO-32** — `demo-jsm-requesttype-fields-DEMO-303.json`, `requestTypeFields[1].name` = `"Référence"`, `description` = `""` : ni le nom ni la description n'annoncent la finalité attendue (e-mail, téléphone, adresse, nom, URL…). | **Entrée** : E4.<br>**Sortie attendue** : pour chaque champ `visible == true` et `required == true`, chercher un mot-clé de finalité dans `name + " " + description` (`e-mail`, `email`, `mail`, `telephone`, `tel`, `phone`, `url`, `site web`, `nom`, `prenom`, `adresse`, `code postal`, `date de naissance`, `numero de carte`) ; si **aucun** → constat « finalité du champ non annoncée » (`a_verifier: true`).<br>**Codes retour** : idem §5. | 1.3.5 ne vise que les champs qui collectent **des informations sur la personne** : un champ « Référence de commande » n'a pas de finalité d'entrée automatique → l'app risque un faux positif ; le filtre par `name` est une heuristique, pas une preuve.<br>La condition réelle du critère (le jeton `autocomplete` du champ rendu) est **hors de portée de l'API** : l'app ne vérifie donc **pas** 1.3.5, elle vérifie un prérequis (l'annonce de la finalité), qui est utile mais ne vaut pas le critère.<br>À dire tel quel dans la vidéo de 3 minutes : « 1.3.5 n'est pas vérifiable, on vérifie que l'étiquette annonce la finalité ». |

## 14. Critère 13 — 1.3.3 Sensory Characteristics (niveau A)

| Critère | Ce que l'API REST / le contenu permet de lire exactement | Un exemple RÉEL | Le test de contrôle | La limite |
|---|---|---|---|---|
| **1.3.3 Sensory Characteristics**<br>(niveau A) | **ADF** : le texte des nœuds `text` (donc le contenu des instructions) ; la position dans le document (`content[]`).<br>Les **propriétés sensorielles** d'un élément (sa couleur, sa forme, sa position **rendue**) ne sont pas dans l'API : le test porte donc sur le **texte de l'instruction**.<br>**Niveau : `contenu seulement (partiel)`**. | **DEMO-27** — `demo-confluence-page-DEMO-202.json`, `body.value.content[7].content[0].text` = « Cliquez sur le bouton rouge en haut à droite du formulaire pour continuer. » : l'instruction ne peut être suivie que par quelqu'un qui **voit** la couleur et la position. | **Entrée** : document ADF.<br>**Sortie attendue** : sur le texte normalisé, repérer les motifs de position ou de couleur seuls : (`en haut à droite`, `en bas à gauche`, `au milieu`, `sur le côté`, `le bouton rouge`, `le bouton vert`, `l'icône bleue`, `la case grise`) → constat « instruction qui repose sur une caractéristique sensorielle » (`a_verifier: true`).<br>**Codes retour** : idem §2. | Le test est **linguistique** : il dépend de la langue du contenu (motifs français ci-dessus ; à compléter pour l'anglais) et produit des faux positifs (« le bouton rouge » peut désigner un bouton dont la couleur est aussi écrite dans le texte voisin).<br>Un contenu **visuel** équivalent (capture d'écran légendée) n'est pas analysé par l'app ; la même consigne peut être donnée par une image, que l'API ne décrit pas.<br>Ce contrôle est typiquement ce qu'un scanner automatique ne fait pas et ce que les lettres d'avocats allemandes visaient en 2026 : c'est un bon sujet de démonstration. |

---

## 15. Les 3 constats impossibles par l'API REST

À dire **tel quel** dans la vidéo de 3 minutes : une app Forge lit des **données**, pas un **écran**.
Voici les trois informations que le portail *rendu* contient et que l'API ne donne pas.

### 15.1 Le contraste calculé

L'API renvoie la couleur **écrite dans le contenu** (`textColor.attrs.color` = `#f2c200`,
`tableCell.attrs.background`, `status.attrs.color`). Elle ne renvoie **jamais** la couleur **rendue** :
le texte par défaut du thème, le fond réel du bloc, la couleur de texte sur un `panel`.warning, la
densité de la police, l'anticrénelage. Un ratio calculé par l'app repose donc sur une **hypothèse**
(fond blanc) — j'ai calculé 1,68:1 pour `#f2c200` sur blanc, mais ce chiffre ne vaut que si le
portail est clair. **La formulation correcte** : « contraste incertain, calculé sur fond blanc »,
jamais « contraste non conforme ».

### 15.2 L'ordre de lecture

L'API renvoie l'**arbre** du contenu (ADF `content[]`, un ordre de *source*), pas l'**ordre de
lecture** ni l'**ordre de focus** à l'écran. L'ordre visuel dépend en plus de `attrs.layout`
(`wrap-left`, `wrap-right`, `full-width`, `align-end`), du CSS du portail, de la largeur de la
fenêtre et de l'écriture bidirectionnelle. L'app **ne peut donc pas** statuer sur 1.3.2
(Meaningful Sequence), ni sur 2.4.3 (Focus Order), ni sur 2.4.7 (Focus Visible) : ce sont des
critères de **rendu**. Elle peut seulement signaler un *risque* (« un bloc `layout: wrap-left` au
milieu du document »).

### 15.3 Les libellés visibles

L'API renvoie les **données** du libellé (`requestTypeFields[].name`, `description`,
`RequestTypeDTO.helpText`), jamais la **chaîne rendue** : le portail compose le libellé affiché
(traduction de l'interface, suffixe d'obligation `*`, icône, texte d'aide contextuelle, ordre
libellé/aide/erreur). Le **nom accessible** d'un contrôle — l'étiquette concaténée à l'aide puis
à l'erreur — n'est nulle part dans l'API. L'app peut donc dire « le champ n'a pas d'étiquette »
(valeur absente), mais **pas** « le client ne voit pas d'étiquette » (valeur rendue).

---

## 16. Ce qui n'a pas pu être vérifié (à assumer)

- **Le vocabulaire du balisage `storage` de Confluence** (XHTML de l'éditeur, images en
  `<ac:image ac:alt="…">`) : les pages de documentation `/confluence/rest/v1/intro/` et
  `/confluence/rest/v2/intro/` renvoient **HTTP 404** le 04/11/2026, et la doc v2 ne contient ni
  `ac:image` ni `ac:alt`. → **L'app doit utiliser `body.atlas_doc_format` (ADF), dont le schéma
  est public et vérifié**, et traiter `body.storage.value` comme une source secondaire à parser
  prudemment (jamais comme la source normative).
- **La forme exacte de la réponse de `GET /rest/servicedeskapi/knowledgebase/article/view/{pageId}`** :
  le schéma officiel dit `application/json` de type `string`, **sans description**. La chaîne peut
  être le corps HTML de l'article ou autre chose → à tester sur un site réel avant d'en dépendre.
- **Les scopes Forge** : les scopes documentés ci-dessus sont des scopes **OAuth 3LO**
  (`read:page:confluence`, `read:attachment:confluence`, `read:servicedesk-request`,
  `read:knowledgebase:jira-service-management`). Les **équivalents Forge** (portail client inclus)
  ne sont **pas** vérifiés le 04/11 : à confirmer dans la doc Forge avant d'écrire le manifeste.
- **L'accès d'un utilisateur portail (anonyme/non licencié) aux API** : les endpoints JSM portent
  `x-atlassian-app-access-rule-exempt: true` pour certains, et les modules portail
  (`jiraServiceManagement:portalRequestDetail` etc.) existent bien — mais **la combinaison** de l'app
  Forge avec un client **non licencié** du portail n'a pas été testée (aucun compte, aucune clé
  ce cycle, conformément à la consigne).
- **La présence d'un `title` composé par le portail** (suffixe) : non vérifiée.
- **Aucun appel réel n'a été fait** sur un site Atlassian : toutes les formes de réponses
  utilisées ici sont **écrites par moi** à partir des schémas officiels, donc **garanties conformes
  au schéma mais pas observées en production**. C'est la limite honnête de ce document.

---

## 17. Sources — toutes relues le **04/11/2026**

| Source | URL | HTTP le 04/11/2026 | Ce que j'en ai tiré |
|---|---|---|---|
| **W3C WCAG 2.2** (Rec. 12/12/2024) | https://www.w3.org/TR/WCAG22/ | 200 (via le lecteur web) | Intitulés officiels, niveaux A/AA, 9 nouveaux critères, 4.1.1 supprimé |
| **Schéma ADF officiel** | http://go.atlassian.com/adf-json-schema | **200**, 73 655 o, `application/json` | `media_node.attrs.alt` (facultatif), `heading_node.attrs.level` (1-6), `table_header_node` / `table_cell_node`, `taskItem_node.attrs.state`, `mention_node.attrs.text`, `status_node.attrs.text/color`, `link_mark.attrs.href`, `textColor_mark.attrs.color` |
| **ADF — nœud `media`** | https://developer.atlassian.com/cloud/jira/platform/apis/document/nodes/media/ | 200 | `attrs` : `width`, `height`, `id`, `type`, `collection`, `occurrenceKey` (+ `alt` dans l'exemple officiel) |
| **ADF — nœud `mediaSingle`** | https://developer.atlassian.com/cloud/jira/platform/apis/document/nodes/mediaSingle/ | 200 | `attrs.layout`, `attrs.width`, `attrs.widthType` |
| **ADF — nœud `heading`** | https://developer.atlassian.com/cloud/jira/platform/apis/document/nodes/heading/ | 200 | `attrs.level` = 1-6 (obligatoire) |
| **ADF — nœud `status`** | https://developer.atlassian.com/cloud/jira/platform/apis/document/nodes/status/ | 200 | `attrs.text` (obligatoire), `attrs.color` (nom ou hex) |
| **ADF — nœud `text`** | https://developer.atlassian.com/cloud/jira/platform/apis/document/nodes/text/ | 200 | `text` non vide, `marks[]` (dont `link`) |
| **ADF — structure** | https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/ | 200 | « in Jira Cloud platform, the text in issue comments and in `textarea` custom fields is stored as ADF » + schéma JSON |
| **JSM REST — types de demande** | https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-requesttype/ | 200 (729 998 o) | `RequestTypeFieldDTO` (`name`, `description`, `required`, `visible`, `fieldId`, `jiraSchema`, `validValues`, `defaultValues`), `RequestTypeDTO.helpText`, scope `read:servicedesk-request` |
| **JSM REST — articles de la base de connaissances** | https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-article/ | 200 (611 235 o) | `ArticleDTO` = `{content, excerpt, source, title}` ; **`ContentDTO` ne contient que `iframeSrc`** ; `source.type = "confluence"` ; `/article/view/{pageId}` → schéma `type: string`, scope `read:knowledgebase:jira-service-management` (Beta) |
| **Confluence Cloud REST API v2** (OpenAPI officiel) | https://dac-static.atlassian.com/cloud/confluence/openapi-v2.v3.json | **200**, 735 132 o | `GET /pages/{id}` (+ `body-format` ∈ `storage, atlas_doc_format, view, export_view, anonymous_export_view, styled_view, editor`), `title`, `labels`, `properties` (`ContentProperty.key/value`) ; `GET /pages/{id}/attachments` ; scopes `read:page:confluence`, `read:attachment:confluence` |
| **Jira Cloud platform REST v3** (OpenAPI officiel) | https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json | **200**, 2 511 514 o | Bean `Attachment` **sans** champ `alt` ; `FieldCreateMetadata` (createmeta) **sans** `helpText` ; 433 chemins |
| **Référentiel WCAG local** | `/work/eaa-atlassian/referentiel-wcag.json` | md5 `df0d097ea5ee17f304d9d091768803ae` | 87 critères : texte normatif, niveau, exceptions, liens W3C |

**Fichiers de démonstration produits ce cycle** (`/work/codegeist-appui/demo/`) :
`demo-jira-issue-DEMO-101.json`, `demo-confluence-page-DEMO-202.json`,
`demo-jsm-requesttype-fields-DEMO-303.json`, `demo-jsm-requesttypes-DEMO-304.json`,
`demo-jsm-article-DEMO-305.json`, `demo-confluence-attachments-DEMO-206.json`, `README-demo.md`.

**Contre-épreuve effectuée** : les 6 fichiers JSON de démonstration ont été parsés, et **chacun des
23 chemins `DEMO-xx` et des 6 contrôles négatifs `SANTÉ-xx` a été résolu** dans les données : aucun
chemin ne pointe dans le vide. Un `DEMO-xx` qui ne résout pas rendrait tout le §2-§14 faux ; il a
fallu le vérifier.
