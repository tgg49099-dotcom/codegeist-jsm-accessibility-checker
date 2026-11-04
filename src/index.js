/**
 * Portal Accessibility Checker for JSM — scan (04/11/2026).
 *
 * Deux modes, UNE SEULE implémentation de règles (src/regles.js) :
 *
 *  1. le SCAN, exécuté sur le site : lit le contenu via l'API REST (JSM si le
 *     produit est actif, sinon repli Jira) et applique les contrôles WCAG 2.2
 *     (cible AA) sur les valeurs lues ;
 *  2. le MODE DÉMO (`?demo=1`) : fait tourner le MÊME moteur sur les 6
 *     fichiers JSON de démonstration, sans compte et sans tenant, et publie
 *     la preuve que les règles détectent les 23 fautives documentées sans
 *     produire de faux positif sur les 6 contrôles négatifs.
 *
 * Les règles applicatives portent sur 13 critères WCAG 2.2 (7 « REST
 * vérifiable », 6 « contenu seulement (partiel) ») — voir
 * docs/CRITERES-WCAG-2.2-AA.md. Chaque constat est renvoyé au format de la
 * fiche (§0.4) : critere, niveau, source, ressource, emplacement, valeur,
 * message, a_verifier.
 *
 * Appelé par le web trigger `scan-trigger`. Réponse : JSON brut horodaté
 * contenant les données lues (read.*) et les constats (findings[]).
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
      why: 'étiquette rédigée comme un nom technique interne en minuscules, jamais pour l\'utilisateur final',
    };
  }
  if (/\d{4,}/.test(name)) {
    return {
      hit: true,
      why: 'étiquette contenant un identifiant numérique interne (série de >= 4 chiffres)',
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

// ---------- appels REST asApp ----------

async function jget(path, headers) {
  // @forge/api 3.9.2 : requestJira exige un objet route (tagged template) —
  // un simple string est refusé ("You must create your route using the 'route'
  // export"). requestJira couvre aussi les chemins /rest/servicedeskapi/*.
  const res = await api.asApp().requestJira(path, { headers: headers || {} });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = { parseError: String(e && e.message) };
  }
  return { status: res.status, body };
}

async function jpost(path, payload) {
  const res = await api.asApp().requestJira(path, {
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

// ---------- mode démo : détection du drapeau ----------

/**
 * Le mode démo s'active par `?demo=1` (et `?demo=1&format=csv` pour l'export
 * CSV). On regarde plusieurs endroits parce que la forme exacte de l'objet
 * `request` reçue par un web trigger n'est pas garantie par la doc : le
 * détecteur renvoie en plus le nom de l'endroit où il a trouvé le drapeau
 * (il est recopié dans la réponse : on peut vérifier ce qui a été lu).
 *
 * D'après la référence officielle, `queryParameters` est de la forme
 * `{ [clé: string]: string[] }` : chaque paramètre est un TABLEAU de
 * chaînes. On normalise donc les tableaux avant de lire la valeur.
 */
function detecterDemo(req) {
  const requete = req || {};
  const premier = (v) => (Array.isArray(v) ? v[0] : v);
  const vrai = (v) => {
    const x = premier(v);
    return x === true || x === '1' || x === 'true' || x === 'demo' || x === 'yes';
  };

  const qp = requete.queryParameters;
  if (qp && typeof qp === 'object') {
    if (qp.demo !== undefined) {
      return { demo: vrai(qp.demo), declencheur: 'queryParameters.demo', format: premier(qp.format) };
    }
    if (qp.mode !== undefined && String(premier(qp.mode)).toLowerCase() === 'demo') {
      return { demo: true, declencheur: 'queryParameters.mode', format: premier(qp.format) };
    }
  }

  for (const cle of ['queryString', 'url', 'rawUrl', 'path', 'userPath']) {
    const valeur = requete[cle];
    if (typeof valeur !== 'string') continue;
    // `demo` peut être en tête de query string ("demo=1") ou après un
    // séparateur ("?demo=1", "&demo=1") : les deux formes sont admises.
    const trouve = /(^|[?&])demo=([^&]*)/i.exec(valeur);
    if (trouve) {
      const format = /(^|[?&])format=([^&]*)/i.exec(valeur);
      return {
        demo: vrai(trouve[2]),
        declencheur: cle,
        format: format ? format[2] : undefined,
      };
    }
  }

  if (requete.body && typeof requete.body === 'object' && !Buffer.isBuffer(requete.body)) {
    if (requete.body.demo !== undefined) {
      return {
        demo: vrai(requete.body.demo),
        declencheur: 'body.demo',
        format: premier(requete.body.format),
      };
    }
  }
  return { demo: false, declencheur: null, format: undefined };
}

/** Réponse du mode démo : rapport JSON complet, ou export CSV. */
function reponseDemo(detection, horodatage) {
  if (detection.format === 'csv') {
    return {
      body: demo.csv(),
      headers: { 'Content-Type': ['text/csv; charset=utf-8'] },
      statusCode: 200,
      statusText: 'OK',
    };
  }
  const rapport = demo.rapport(horodatage);
  rapport.mode_declare_par = detection.declencheur;
  return {
    body: JSON.stringify(rapport, null, 1),
    headers: { 'Content-Type': ['application/json; charset=utf-8'] },
    statusCode: 200,
    statusText: 'OK',
  };
}

// ---------- scan JSM (exécuté seulement si JSM est actif sur le site) ----------

async function scanJsm() {
  const sources = {};
  const findings = [];
  const desks = await jget(route`/rest/servicedeskapi/servicedesk`, JSM_HDRS);
  sources['GET /rest/servicedeskapi/servicedesk'] = {
    httpStatus: desks.status,
    excerpt: (desks.body.values || []).slice(0, 3).map((d) => ({ id: d.id, projectName: d.projectName })),
  };
  if (desks.status !== 200) {
    return { sources, findings, error: 'service desk list unavailable (HTTP ' + desks.status + ')' };
  }
  for (const desk of (desks.body.values || []).slice(0, 3)) {
    const rts = await jget(route`/rest/servicedeskapi/servicedesk/${desk.id}/requesttype`, JSM_HDRS);
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
        JSM_HDRS
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
              `Étiquette de champ non descriptive : ${il.why}. Une étiquette doit décrire le sujet ou la finalité du champ pour l'utilisateur final.`,
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

async function scanJira() {
  const sources = {};
  const findings = [];
  const onScreen = {}; // fieldId -> nom vu sur l'écran de création

  const flds = await jget(route`/rest/api/3/field`);
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

  const projs = await jget(route`/rest/api/3/project`);
  const projectKeys = (Array.isArray(projs.body) ? projs.body : []).slice(0, 3).map((p) => p.key);
  sources['GET /rest/api/3/project'] = {
    httpStatus: projs.status,
    excerpt: projectKeys,
  };

  for (const key of projectKeys) {
    const its = await jget(route`/rest/api/3/issue/createmeta/${key}/issuetypes`);
    const types = (its.body.issueTypes || []).slice(0, 4);
    for (const it of types) {
      const meta = await jget(route`/rest/api/3/issue/createmeta/${key}/issuetypes/${it.id}`);
      for (const f of meta.body.fields || []) {
        onScreen[f.fieldId] = f.name;
      }
    }
  }
  sources['GET /rest/api/3/issue/createmeta/{projet}/issuetypes/{id}'] = {
    note: 'union des champs affichés sur les écrans de création des projets scannés',
    httpStatus: 200,
    excerpt: onScreen,
  };

  const jql =
    projectKeys.length > 0
      ? `project IN (${projectKeys.join(',')}) ORDER BY created DESC`
      : 'created >= -30d';
  const search = await jpost(route`/rest/api/3/search/jql`, {
    jql,
    maxResults: 20,
    fields: ['summary', 'description'],
  });
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
          `champ personnalisé ${f.id}`,
          `fields[${f.id}].name`,
          f.name,
          `Étiquette de champ non descriptive : ${il.why}. Une étiquette doit décrire le sujet ou la finalité du champ pour l'utilisateur final.`,
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
          `champ personnalisé ${f.id}`,
          `fields[${f.id}].description`,
          `type=${f.schema.type}, description="${(f.description || '').trim()}"`,
          'Champ à saisie ambiguë (date ou couleur) dont les métadonnées ne comportent aucune instruction : le format attendu n\'est indiqué nulle part dans ce que l\'API expose. Le sélecteur graphique peut atténuer le problème au rendu — l\'API REST ne permet pas de le vérifier.',
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
          'Titre de page trop court : le titre de la page de ticket est le résumé ; moins de 4 caractères ne peuvent pas décrire le sujet de la page.',
          false
        )
      );
      findings[findings.length - 1].ou = `ticket ${i.key}`;
    }
  }

  return { sources, findings };
}

// ---------- point d'entrée (web trigger) ----------

exports.run = async (req) => {
  const generatedAt = new Date().toISOString();

  // Mode démo : aucun appel à un site, aucun compte, aucun tenant.
  const detection = detecterDemo(req);
  if (detection.demo) {
    return reponseDemo(detection, generatedAt);
  }

  const info = await jget(route`/rest/servicedeskapi/info`, JSM_HDRS);
  const jsmProbe = {
    endpoint: 'GET /rest/servicedeskapi/info',
    httpStatus: info.status,
    isLicensedForUse: info.status === 200 ? info.body.isLicensedForUse : null,
    note:
      info.status === 200 && info.body.isLicensedForUse === false
        ? 'l\'API JSM du site répond elle-même que JSM n\'y est pas licencié/activé : repli sur les tickets Jira (même API REST, contenu équivalent au portail : étiquettes de champs, descriptions, résumés)'
        : 'JSM actif',
  };

  let mode = 'jira-fallback';
  let scan = null;
  if (info.status === 200 && info.body.isLicensedForUse === true) {
    mode = 'jsm';
    scan = await scanJsm();
  } else {
    scan = await scanJira();
  }

  const report = {
    scanner: 'Portal Accessibility Checker for JSM — prototype 1.0.0 (app 33f1227e-0df1-4008-b181-ea9c50b116f5)',
    generatedAt,
    mode,
    jsmProbe,
    read: scan.sources,
    findings: scan.findings,
    limites: [
      'lecture seule : ce scan n\'écrit rien sur le site',
      'l\'API REST ne rend pas le portail : contraste (1.4.3), prise de focus (2.4.7), taille des cibles (2.5.8) et messages d\'état (4.1.3) ne sont PAS vérifiables ici',
      'la présence d\'un champ sur un écran est lue via createmeta ; là où un champ n\'apparaît pas, le constat porte sur ses métadonnées, pas sur un rendu',
      'un constat est une ALERTE à faire vérifier par un humain : l\'app ne certifie aucune conformité',
    ],
    modeDemo:
      'ajouter ?demo=1 à l\'URL du déclencheur pour rejouer le scan sur le jeu de démonstration (sans compte, sans tenant) ; &format=csv pour l\'export CSV',
  };

  return {
    body: JSON.stringify(report, null, 1),
    headers: { 'Content-Type': ['application/json; charset=utf-8'] },
    statusCode: 200,
    statusText: 'OK',
  };
};

// règles pures exportées pour les tests hors ligne (aucun effet à l'exécution)
exports._rules = { isInternalLabel, isFormatAmbiguous, isAmbiguousWithoutInstructions, isSummaryTooShort };
exports._detecterDemo = detecterDemo;
