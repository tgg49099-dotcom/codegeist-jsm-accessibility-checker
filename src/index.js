/**
 * Portal Accessibility Checker for JSM — scan engine (04/11/2026, rev. 05/11/2026).
 *
 * Two modes, ONE implementation of the rules (src/regles.js):
 *
 *  1. the SCAN, run on the site: reads the content through the REST API (JSM
 *     if the product is active, Jira as a fallback) and applies the WCAG 2.2
 *     checks (AA target) to what was read;
 *  2. the DEMO mode: runs the SAME engine on the 6 bundled demo fixtures — no
 *     account, no tenant — and publishes the proof that the rules detect the
 *     23 seeded issues without a false positive on the 6 negative controls.
 *
 * The application rules cover 13 WCAG 2.2 criteria (7 "REST-verifiable",
 * 6 "content only (partial)") — see docs/CRITERES-WCAG-2.2-AA.md. Every
 * finding is returned in the format of the submission (§0.4): critere, niveau,
 * source, ressource, emplacement, valeur, message, a_verifier.
 *
 * ENTRY POINT. Since cycle 128 (05/11/2026) this file is NOT an HTTP handler
 * any more: the public trigger module has been REMOVED from the manifest and
 * replaced by a `jira:adminPage` module. This file is the ENGINE; it is called
 * by the resolver (src/resolvers.js), which the platform only lets a logged-in
 * Jira administrator reach. See the entry-point section at the bottom of this
 * file.
 */

const api = require('@forge/api');
const { route } = require('@forge/api');

const regles = require('./regles');
const demo = require('./demo');

const JSM_HDRS = { 'X-Experimental-API': 'opt-in', Accept: 'application/json' };

// ---------- règles (fonctions pures, testables hors ligne) ----------

/**
 * Étiquette « technique interne » : tout en minuscules (nom de champ, de
 * variable, de table) ou contenant un identifiant numérique de >= 4 chiffres.
 * Une étiquette de formulaire destinée à l'utilisateur final doit décrire le
 * sujet ou la finalité du champ — WCAG 2.2, critère 2.4.6 (AA).
 */
const isInternalLabel = (name) => {
  if (typeof name !== 'string' || name.length === 0) return { hit: false, why: '' };
  if (/^[a-z0-9 ._\'-]+$/.test(name) && /[a-z]/.test(name)) {
    return {
      hit: true,
      why: 'label written as an internal technical name in lower case, never for the end user',
    };
  }
  if (/\d{4,}/.test(name)) {
    return {
      hit: true,
      why: 'label containing an internal numeric identifier (a run of 4 or more digits)',
    };
  }
  return { hit: false, why: '' };
};

/**
 * Format de saisie ambigu : date (le format jour/mois/séparateur n'est fixé
 * par l'étiquette) ou couleur (chaîne libre sans dire si c'est un nom ou un
 * code hexadécimal).
 */
const isFormatAmbiguous = (field) => {
  const t = (field.schema && field.schema.type) || '';
  const c = (field.schema && field.schema.custom) || '';
  return t === 'date' || t === 'datetime' || c.endsWith(':jsw-issue-color');
};

const isAmbiguousWithoutInstructions = (field) => {
  const desc = (field.description || '').trim();
  return isFormatAmbiguous(field) && desc === '';
};

/** Un résumé de moins de 4 caractères ne peut pas décrire le sujet d'une page. */
const isSummaryTooShort = (summary) =>
  typeof summary === 'string' ? summary.trim().length < 4 : true;

/**
 * Met un constat au format de la fiche (§0.4). Sert aux règles qui ne sont
 * pas dans src/regles.js (les « règles d'étiquette » historiques) afin que le
 * rapport lu par l'utilisateur ait UN SEUL schéma.
 */
const constatApp = (critere, niveau, source, ressource, emplacement, valeur, message, aVerifier) => ({
  critere,
  niveau,
  source,
  ressource,
  emplacement,
  valeur,
  message,
  a_verifier: aVerifier,
});

// ---------- appels REST : asApp par défaut, asUser sur demande ----------

/**
 * L'identité qui lit le site.
 *
 * `asApp` (le défaut, inchangé) = l'identité de l'app et ses deux scopes de
 * lecture : c'est le comportement de la page d'administration, qui n'est
 * atteignable que par un administrateur Jira connecté.
 *
 * `asUser` = les permissions Jira de la personne qui appelle. C'est ce que
 * le module `rovo:mcp` utilise : un outil d'agent ne doit pas pouvoir lire
 * ce que la personne qui l'appelle ne peut pas lire elle-même (la doc
 * officielle le dit : « Using asUser() keeps the tool safe »).
 *
 * @param {object} opts  { asUser: boolean } — absent = asApp.
 * @returns {object} le client REST (@forge/api)
 */
function client(opts) {
  return opts && opts.asUser ? api.asUser() : api.asApp();
}

async function jget(path, headers, opts) {
  // @forge/api 3.9.2 : requestJira exige un objet route (tagged template) —
  // un simple string est refusé ("You must create your route using the 'route'
  // export"). requestJira couvre aussi les chemins /rest/servicedeskapi/*.
  const res = await client(opts).requestJira(path, { headers: headers || {} });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = { parseError: String(e && e.message) };
  }
  return { status: res.status, body };
}

/**
 * The ONE POST of the app — and it writes nothing.
 *
 * Atlassian's JQL search endpoint (`/rest/api/3/search/jql`) takes the query
 * in the BODY of a POST; it is a READ (a search), it creates nothing, and it
 * needs no write scope. There is no other POST in the app: the app declares
 * only the two read scopes, and it cannot write even if it wanted to.
 */
async function jsearch(path, payload, opts) {
  const res = await client(opts).requestJira(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = { parseError: String(e && e.message) };
  }
  return { status: res.status, body };
}

// ---------- contrat de confidentialité : une donnée personnelle reçue ne revient jamais en clair ----------

/**
 * Les deux champs de requête qui portent une donnée personnelle.
 * `canonique` est le nom sous lequel le champ apparaît dans la réponse ;
 * la liste de droite contient les alias acceptés, pour qu'un appelant qui
 * écrit `email` ne croie pas que sa donnée a été simplement ignorée.
 */
const CHAMPS_PV = {
  nom: ['nom', 'name'],
  'e-mail': ['e-mail', 'email', 'e_mail'],
};

/**
 * En dessous de cette longueur, une valeur ne peut pas être balayée dans le
 * corps de la réponse sans le détruire : une valeur de 1 ou 2 caractères
 * apparaît partout dans un rapport. La valeur est alors masquée dans la
 * section `privacy`, mais pas balayée dans le reste du corps. La limite est
 * déclarée dans la réponse elle-même (`privacy.limits`).
 */
const SEUIL_BALAYAGE = 3;

/**
 * La phrase exacte affichée dans l'app. Elle est en anglais, et elle dit
 * EXACTEMENT ce que fait l'app — rien de plus.
 *
 * Mesuré le 05/11/2026 : le contenu lu SUR LE SITE est renvoyé tel quel dans
 * `read[...].excerpt` (c'est ce contenu que l'app vérifie) ; il peut donc
 * contenir un nom ou une adresse e-mail tapés dans un titre de ticket. La
 * notice de confidentialité publiée (https://labs.chiffreo.ch/privacy.html)
 * le dit déjà explicitement (« an excerpt of it can appear in the scan
 * result »). L'app ne masque que les valeurs qu'ELLE REÇOIT dans la requête
 * (`nom`, `e-mail`), et uniquement celles-ci : c'est ce que la phrase dit.
 */
const PHRASE_PV =
  'This app reads your site content through Atlassian read-only REST APIs and stores nothing. It calls no external service. Scan results are returned only to the logged-in user who started the scan. A name or e-mail address that it receives in the request is returned as a mask, never in clear text. The content it reads from your site is returned as it is, because that content is what it checks.';

/** Normalise un ensemble de valeurs pour un paramètre (tableau ou valeur unique). */
const extraireValeurs = (v) => {
  if (v === undefined || v === null) return [''];
  if (Array.isArray(v)) {
    if (v.length === 0) return [''];
    return v.map((item) => (item === undefined || item === null ? '' : String(item)));
  }
  return [String(v)];
};

/**
 * Cherche un paramètre dans un objet, sans tenir compte de la casse ni des
 * espaces autour du nom de champ.
 * Renvoie `{ present: false }` si le paramètre est ABSENT, et
 * `{ present: true, valeurs: ['...'] }` s'il est présent.
 */
function chercherParametre(objet, noms) {
  if (!objet || typeof objet !== 'object') return { present: false };
  for (const nom of noms) {
    for (const cle of Object.keys(objet)) {
      if (cle.trim().toLowerCase() !== nom.trim().toLowerCase()) continue;
      const valeurs = extraireValeurs(objet[cle]);
      return { present: true, valeurs, valeur: valeurs[0] };
    }
  }
  return { present: false };
}

/** Extrait les paramètres d'une query string ou chaîne URL-encodée (`?a=1&b=2` ou `a=1&b=2`). */
function parseQueryString(texte) {
  const params = {};
  if (typeof texte !== 'string' || !texte) return params;
  const str = String(texte);
  const partie = str.includes('?') ? str.split('?')[1] : str;
  if (!partie) return params;
  for (const morceau of partie.split('&')) {
    if (!morceau) continue;
    const i = morceau.indexOf('=');
    const bruteCle = i === -1 ? morceau : morceau.slice(0, i);
    const bruteVal = i === -1 ? '' : morceau.slice(i + 1);
    let cle = bruteCle.trim();
    let valeur = bruteVal;
    try {
      cle = decodeURIComponent(bruteCle.replace(/\+/g, ' ')).trim();
      valeur = decodeURIComponent(bruteVal.replace(/\+/g, ' '));
    } catch (e) {
      // Valeur mal encodée : on garde la forme brute
    }
    if (!(cle in params)) params[cle] = [];
    params[cle].push(valeur);
  }
  return params;
}

/**
 * Le corps de la requête peut être un objet, une chaîne JSON, un texte
 * encodé en query-string / form-urlencoded ou un Buffer.
 */
function corpsRequete(body) {
  if (!body) return null;
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  let texte = null;
  if (typeof body === 'string') texte = body;
  else if (Buffer.isBuffer(body)) texte = body.toString('utf8');
  if (!texte) return null;
  try {
    const obj = JSON.parse(texte);
    if (obj && typeof obj === 'object') return obj;
  } catch (e) {
    // Pas du JSON valide : peut être une chaîne URL-encodée (form-urlencoded)
  }
  if (typeof texte === 'string' && (texte.includes('=') || texte.includes('&'))) {
    return parseQueryString(texte);
  }
  return null;
}

/**
 * Les champs de données personnelles RÉELLEMENT présents dans la requête.
 * Seuls les champs présents sont listés : un champ absent n'est jamais
 * inventé (ni `null`, ni chaîne vide, ni masque).
 *
 * On regarde tous les endroits où une requête peut porter un champ : les
 * paramètres de requête (forme officielle `{ [clé]: string[] }`), le corps
 * (objet, JSON, texte url-encoded ou Buffer), les en-têtes HTTP et l'URL brute.
 */
function champsPvRecus(req) {
  const requete = req || {};
  const presents = {};
  const ajouter = (source) => {
    if (!source) return;
    for (const canonique of Object.keys(CHAMPS_PV)) {
      if (canonique in presents) continue;
      const trouve = chercherParametre(source, CHAMPS_PV[canonique]);
      if (trouve.present) {
        presents[canonique] = trouve.valeurs.length === 1 ? trouve.valeurs[0] : trouve.valeurs;
      }
    }
  };

  ajouter(requete.queryParameters);
  ajouter(corpsRequete(requete.body));
  ajouter(requete.headers);

  for (const cle of ['queryString', 'url', 'rawUrl', 'path', 'userPath']) {
    if (typeof requete[cle] !== 'string') continue;
    ajouter(parseQueryString(requete[cle]));
  }
  return presents;
}

/**
 * Masque une valeur personnelle : il n'en reste que le premier caractère.
 *   "Camille"                   -> "C***"
 *   "camille.dupont@exemple.fr" -> "c***@***"  (le domaine n'est jamais rendu)
 *   "AB"                        -> "***"        (moins de 3 caractères :
 *                                                 rendre le premier caractère
 *                                                 rendrait la valeur en clair)
 */
function masquerValeur(valeur) {
  const s = typeof valeur === 'string' ? valeur : String(valeur == null ? '' : valeur);
  if (s.length < 3) return '***';
  const arobase = s.indexOf('@');
  if (arobase > 0) {
    const locale = s.slice(0, arobase);
    if (locale.length < 3) return '***@***';
    return locale.slice(0, 1) + '***@***';
  }
  return s.slice(0, 1) + '***';
}

const echapperRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Remplace, dans toutes les chaînes de l'objet, chaque occurrence d'une
 * valeur personnelle reçue par son masque. Le balayage porte sur les VALEURS,
 * pas sur les clés (les clés sont écrites par l'app, jamais par l'appelant).
 */
function balayerNoeud(noeud, remplacements) {
  if (typeof noeud === 'string') {
    let s = noeud;
    for (const r of remplacements) {
      s = s.replace(new RegExp(echapperRegExp(r.valeur), 'gi'), () => r.masque);
    }
    return s;
  }
  if (Array.isArray(noeud)) {
    for (let i = 0; i < noeud.length; i += 1) noeud[i] = balayerNoeud(noeud[i], remplacements);
    return noeud;
  }
  if (noeud && typeof noeud === 'object') {
    for (const cle of Object.keys(noeud)) noeud[cle] = balayerNoeud(noeud[cle], remplacements);
    return noeud;
  }
  return noeud;
}

/** Les remplacements (valeur reçue -> masque) à appliquer au corps de la réponse. */
function remplacementsPv(pvRecus) {
  const liste = [];
  for (const champ of Object.keys(pvRecus || {})) {
    const brute = pvRecus[champ];
    const valeurs = Array.isArray(brute) ? brute : [brute];
    for (const v of valeurs) {
      if (typeof v !== 'string' || v.length < SEUIL_BALAYAGE) continue;
      liste.push({ valeur: v, masque: masquerValeur(v) });
    }
  }
  return liste;
}

/**
 * La section `privacy` du rapport : ce que l'app a reçu, ce quelle a masqué,
 * et ce qu'elle ne fait pas. Les champs absents de la requête n'y figurent
 * pas : aucune valeur n'est inventée.
 */
function sectionPrivacy(pvRecus) {
  const recus = Object.keys(pvRecus || {});
  const masques = {};
  for (const champ of recus) {
    const brute = pvRecus[champ];
    if (Array.isArray(brute)) {
      masques[champ] = brute.map(masquerValeur).join(', ');
    } else {
      masques[champ] = masquerValeur(brute);
    }
  }
  return {
    statement: PHRASE_PV,
    rule:
      'The values received in the "nom" and "e-mail" fields of the request are never returned in clear text: the app returns a mask instead, and only for the fields that were actually received.',
    receivedFields: recus,
    maskedValues: masques,
    limits: [
      'a received value of 3 characters or more is also masked wherever it appears in this response, including in the content read from the site',
      'a received value of less than 3 characters is masked in "maskedValues" but cannot be masked throughout the response without destroying the report',
      'the request itself is never written to the app logs',
    ],
  };
}

// ---------- scan JSM (exécuté seulement si JSM est actif sur le site) ----------

async function scanJsm(opts) {
  const sources = {};
  const findings = [];
  const desks = await jget(route`/rest/servicedeskapi/servicedesk`, JSM_HDRS, opts);
  sources['GET /rest/servicedeskapi/servicedesk'] = {
    httpStatus: desks.status,
    excerpt: (desks.body.values || []).slice(0, 3).map((d) => ({ id: d.id, projectName: d.projectName })),
  };
  if (desks.status !== 200) {
    return { sources, findings, error: 'service desk list unavailable (HTTP ' + desks.status + ')' };
  }
  for (const desk of (desks.body.values || []).slice(0, 3)) {
    const rts = await jget(route`/rest/servicedeskapi/servicedesk/${desk.id}/requesttype`, JSM_HDRS, opts);
    const values = (rts.body.values || []).slice(0, 5);
    sources[`GET /rest/servicedeskapi/servicedesk/${desk.id}/requesttype`] = {
      httpStatus: rts.status,
      excerpt: values.map((rt) => ({ id: rt.id, name: rt.name, description: rt.description || '' })),
    };

    // Moteur WCAG 2.2 — E5 : types de demande (aide présente ou non d'un type
    // à l'autre : cohérence de l'aide — 3.2.6).
    for (const constat of regles.analyserTypesDemande(
      values,
      'values',
      'E5',
      desk.projectName || String(desk.id)
    )) {
      findings.push({ ...constat, ou: `service desk ${desk.projectName || desk.id}` });
    }
    // Moteur WCAG 2.2 — E5 : titre de page du type de demande (2.4.2).
    for (let i = 0; i < values.length; i += 1) {
      const rt = values[i];
      for (const constat of regles.analyserTitre(
        rt.name,
        `values[${i}].name`,
        'E5',
        desk.projectName || String(desk.id),
        rt.description || null
      )) {
        findings.push({ ...constat, ou: `service desk ${desk.projectName || desk.id}` });
      }
    }

    for (const rt of values) {
      const flds = await jget(
        route`/rest/servicedeskapi/servicedesk/${desk.id}/requesttype/${rt.id}/field`,
        JSM_HDRS,
        opts
      );
      const requestTypeFields = (flds.body.requestTypeFields || []).slice(0, 20);
      sources[`GET /rest/servicedeskapi/servicedesk/${desk.id}/requesttype/${rt.id}/field`] = {
        httpStatus: flds.status,
        excerpt: requestTypeFields.map((f) => ({
          fieldId: f.fieldId,
          name: f.name,
          description: f.description || '',
          required: f.required,
        })),
      };

      // Moteur WCAG 2.2 — E4 : champs du formulaire (étiquette vide 3.3.2,
      // champ obligatoire sans instruction 3.3.2, finalité non annoncée
      // 1.3.5).
      for (const constat of regles.analyserChampsJsm(
        requestTypeFields,
        'requestTypeFields',
        'E4',
        `${desk.projectName} > ${rt.name}`
      )) {
        findings.push({ ...constat, ou: `${desk.projectName} > ${rt.name}` });
      }

      // Règle d'étiquette « technique interne » (2.4.6) : absente du moteur
      // de démonstration (les fixtures n'ont pas d'étiquette de ce type),
      // elle reste appliquée sur les champs réels du portail.
      for (let i = 0; i < requestTypeFields.length; i += 1) {
        const f = requestTypeFields[i];
        const il = isInternalLabel(f.name);
        if (il.hit) {
          findings.push(
            constatApp(
              '2.4.6',
              'AA',
              'E4',
              `${desk.projectName} > ${rt.name}`,
              `requestTypeFields[${i}].name`,
              f.name,
              `Non-descriptive field label: ${il.why}. A label must describe the subject or the purpose of the field for the end user.`,
              true
            )
          );
          findings[findings.length - 1].ou = `${desk.projectName} > ${rt.name}`;
        }
      }
    }
  }
  return { sources, findings, error: null };
}

// ---------- scan Jira (repli : JSM non activé) ----------

async function scanJira(opts) {
  const sources = {};
  const findings = [];
  const onScreen = {}; // fieldId -> nom vu sur l'écran de création

  const flds = await jget(route`/rest/api/3/field`, undefined, opts);
  const allFields = Array.isArray(flds.body) ? flds.body : [];
  const customFields = allFields.filter((f) => f.custom === true).slice(0, 40);
  sources['GET /rest/api/3/field'] = {
    httpStatus: flds.status,
    excerpt: customFields.map((f) => ({
      id: f.id,
      name: f.name,
      description: (f.description || '').trim(),
      type: (f.schema && f.schema.type) || null,
      custom: (f.schema && f.schema.custom) || null,
    })),
  };

  const projs = await jget(route`/rest/api/3/project`, undefined, opts);
  const projectKeys = (Array.isArray(projs.body) ? projs.body : []).slice(0, 3).map((p) => p.key);
  sources['GET /rest/api/3/project'] = {
    httpStatus: projs.status,
    excerpt: projectKeys,
  };

  for (const key of projectKeys) {
    const its = await jget(route`/rest/api/3/issue/createmeta/${key}/issuetypes`, undefined, opts);
    const types = (its.body.issueTypes || []).slice(0, 4);
    for (const it of types) {
      const meta = await jget(route`/rest/api/3/issue/createmeta/${key}/issuetypes/${it.id}`, undefined, opts);
      for (const f of meta.body.fields || []) {
        onScreen[f.fieldId] = f.name;
      }
    }
  }
  sources['GET /rest/api/3/issue/createmeta/{projet}/issuetypes/{id}'] = {
    note: 'union of the fields shown on the create screens of the scanned projects',
    httpStatus: 200,
    excerpt: onScreen,
  };

  const jql =
    projectKeys.length > 0
      ? `project IN (${projectKeys.join(',')}) ORDER BY created DESC`
      : 'created >= -30d';
  const search = await jsearch(route`/rest/api/3/search/jql`, {
    jql,
    maxResults: 20,
    fields: ['summary', 'description'],
  }, opts);
  const issues = (search.body.issues || []).map((i) => ({
    key: i.key,
    summary: i.fields.summary,
    description: i.fields.description || null,
    hasDescription: !!i.fields.description,
  }));
  sources['POST /rest/api/3/search/jql {"jql":"' + jql + '"}'] = {
    httpStatus: search.status,
    excerpt: issues.map((i) => ({ key: i.key, summary: i.summary, hasDescription: i.hasDescription })),
  };

  for (const f of customFields) {
    const il = isInternalLabel(f.name);
    if (il.hit) {
      findings.push(
        constatApp(
          '2.4.6',
          'AA',
          'J1',
          `custom field ${f.id}`,
          `fields[${f.id}].name`,
          f.name,
          `Non-descriptive field label: ${il.why}. A label must describe the subject or the purpose of the field for the end user.`,
          true
        )
      );
    }
    if (isAmbiguousWithoutInstructions(f)) {
      findings.push(
        constatApp(
          '3.3.2',
          'A',
          'J1',
          `custom field ${f.id}`,
          `fields[${f.id}].description`,
          `type=${f.schema.type}, description="${(f.description || '').trim()}"`,
          'Ambiguous input field (date or colour) whose metadata carries no instruction: the expected format is nowhere in what the API exposes. A graphical picker may soften the problem when rendered — the REST API cannot verify this.',
          true
        )
      );
    }
  }

  for (const i of issues) {
    // Moteur WCAG 2.2 — E1 : le corps ADF de l'issue (image sans alternative,
    // niveau de titre sauté, en-tête de tableau absent, texte de lien non
    // descriptif, mention sans nom, contraste incertain…).
    const constatsDocument = regles.analyserDocument(
      i.description,
      'fields.description',
      'E1',
      i.key
    );
    for (const constat of constatsDocument) {
      findings.push({ ...constat, ou: `ticket ${i.key}` });
    }
    // Moteur WCAG 2.2 — E1 : titre de la page de ticket (2.4.2) — le résumé
    // est le titre de la page.
    const constatsTitre = regles.analyserTitre(
      i.summary,
      'fields.summary',
      'E1',
      i.key,
      i.description ? regles._utilitaires.texteDu(i.description) : null
    );
    for (const constat of constatsTitre) {
      findings.push({ ...constat, ou: `ticket ${i.key}` });
    }
    // Règle complémentaire : un résumé de moins de 4 caractères ne décrit ni le
    // sujet ni la finalité de la page. On ne l'ajoute que si le moteur n'a
    // déjà rien dit sur ce titre (pas de double constat).
    const dejaSignale = constatsTitre.some((c) => c.critere === '2.4.2');
    if (!dejaSignale && isSummaryTooShort(i.summary)) {
      findings.push(
        constatApp(
          '2.4.2',
          'A',
          'E1',
          i.key,
          'fields.summary',
          JSON.stringify(i.summary),
          'Page title too short: the title of the issue page is the summary; fewer than 4 characters cannot describe the subject of the page.',
          false
        )
      );
      findings[findings.length - 1].ou = `ticket ${i.key}`;
    }
  }

  return { sources, findings };
}

// ---------------------------------------------------------------------------
// Entry point — THE SCAN ENGINE.
//
// CYCLE 128 (05/11/2026): THE PUBLIC TRIGGER IS GONE.
//
// This app used to expose a public trigger module whose request was
// UNAUTHENTICATED (`authentication: none`): anyone who knew the URL could run
// a scan of the customer's site and read the findings in clear text. The
// manifest now declares a `jira:adminPage` module instead (see manifest.yml)
// and this file is no longer an HTTP handler. It is the ENGINE, and it is
// called by the resolver (src/resolvers.js), which is only reachable from the
// administration page of a logged-in Jira administrator.
//
// Nothing is duplicated: `executerScan()` runs the very same REST reads and
// the very same rules (src/regles.js) as the code that used to answer the
// public trigger. The resolver adds the caller check and the transport; it
// does not re-implement any rule.
// ---------------------------------------------------------------------------

/**
 * Runs the scan ON THE SITE and returns the raw scan result.
 *
 * The site is read with the app's own identity (`asApp`) and the two read-only
 * scopes the manifest declares (`read:jira-work`, `read:servicedesk-request`).
 * Nothing is written, and no external service is called.
 *
 * @returns {Promise<{mode: string, jsmProbe: object, scan: object}>}
 */
async function executerScan(opts) {
  const info = await jget(route`/rest/servicedeskapi/info`, JSM_HDRS, opts);
  const jsmProbe = {
    endpoint: 'GET /rest/servicedeskapi/info',
    httpStatus: info.status,
    isLicensedForUse: info.status === 200 ? info.body.isLicensedForUse : null,
    note:
      info.status === 200 && info.body.isLicensedForUse === false
        ? "the site's own JSM API reports that JSM is not licensed or not active on it: falling back to Jira issues (same REST API, content equivalent to the portal: field labels, descriptions, summaries)"
        : 'JSM is active',
  };

  let mode = 'jira-fallback';
  let scan = null;
  if (info.status === 200 && info.body.isLicensedForUse === true) {
    mode = 'jsm';
    scan = await scanJsm(opts);
  } else {
    scan = await scanJira(opts);
  }
  return { mode, jsmProbe, scan };
}

/**
 * Builds the report the page displays.
 *
 * The shape is the one documented in the submission (§0.4): the data that was
 * read (`read`), the findings (`findings`), what could not be checked
 * (`limites`), and the privacy statement.
 *
 * @param {object} args
 * @returns {object} the report (not yet masked)
 */
function construireRapport({ mode, jsmProbe, scan, horodatage, pvRecus }) {
  return {
    // No version number here: the deployed version is the one in
    // package.json (read in the README and in the Atlassian console). A
    // hard-coded number in the response would become false on the next
    // version.
    scanner: 'Portal Accessibility Checker for JSM (app 33f1227e-0df1-4008-b181-ea9c50b116f5)',
    generatedAt: horodatage,
    mode,
    privacy: sectionPrivacy(pvRecus),
    jsmProbe,
    read: scan.sources,
    findings: scan.findings,
    limites: [
      'read-only: this scan writes nothing on your site',
      'the REST API does not render the portal: contrast (1.4.3), focus order (2.4.7), target size (2.5.8) and status messages (4.1.3) are NOT checkable here',
      'the presence of a field on a screen is read through createmeta; where a field does not appear, the finding is about its metadata, not about a rendering',
      'a finding is an ALERT to be checked by a human: the app does not certify any conformance',
    ],
  };
}

/**
 * The scan, with the privacy contract applied.
 *
 * A personal value received in the request (fields `nom` and `e-mail`) is
 * NEVER returned in clear text: it comes back as a mask, and only for the
 * fields that were actually received.
 *
 * @param {object} args
 * @param {object} args.pvRecus  the personal values received, as collected by
 *                                `champsPvRecus`
 * @param {boolean} args.asUser  when true the site is read with the CALLER's
 *                                own Jira permissions (`asUser`) instead of the
 *                                app's own read-only scopes (`asApp`, the
 *                                default). Used by the `rovo:mcp` tools.
 * @returns {Promise<object>} the report, masked
 */
async function lancerScan({ pvRecus, asUser } = {}) {
  const recues = pvRecus || {};
  const horodatage = new Date().toISOString();
  const { mode, jsmProbe, scan } = await executerScan({ asUser: !!asUser });
  const rapport = construireRapport({ mode, jsmProbe, scan, horodatage, pvRecus: recues });
  return balayerNoeud(rapport, remplacementsPv(recues));
}

/**
 * The demo report: the SAME rules engine run on the 6 bundled demo fixtures.
 * No site, no account, no tenant.
 *
 * @param {object} args
 * @param {object} args.pvRecus
 * @returns {object} the demo report, masked
 */
function rapportDemo({ pvRecus } = {}) {
  const recues = pvRecus || {};
  const horodatage = new Date().toISOString();
  const rapport = demo.rapport(horodatage);
  rapport.privacy = sectionPrivacy(recues);
  return balayerNoeud(rapport, remplacementsPv(recues));
}

// ---------------------------------------------------------------------------
// Exports — the engine is the single source of truth.
// ---------------------------------------------------------------------------

// The scan of the site. Called by the resolver (src/resolvers.js).
exports.lancerScan = lancerScan;
// The demo report (same engine, bundled fixtures).
exports.rapportDemo = rapportDemo;
// The personal values received in a request, as the engine collects them.
exports.champsPvRecus = champsPvRecus;
// The CSV export of a report's findings (same escaping rules as the demo CSV).
exports.csvRapport = (rapport) =>
  regles.versCsv((rapport && (rapport.findings || rapport.constats)) || []);

// Pure rules exported for the offline tests (no effect at runtime).
exports._rules = { isInternalLabel, isFormatAmbiguous, isAmbiguousWithoutInstructions, isSummaryTooShort };
// Privacy contract: pure functions exported for the offline tests.
exports._contratPv = {
  CHAMPS_PV,
  SEUIL_BALAYAGE,
  PHRASE_PV,
  masquerValeur,
  champsPvRecus,
  sectionPrivacy,
  balayerNoeud,
  remplacementsPv,
};
