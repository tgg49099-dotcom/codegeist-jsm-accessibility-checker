/**
 * Moteur de règles WCAG 2.2 AA — « Portal Accessibility Checker for JSM ».
 *
 * Ce module ne dépend QUE de JavaScript standard (aucune API Atlassian) : il est
 * donc importable par les deux chemins de l'app :
 *   - le scan en production (src/index.js), qui lui passe les réponses REST
 *     réellement lues sur le site (E1..E6) ;
 *   - le mode démo (src/demo.js), qui lui passe les 6 fichiers JSON de
 *     démonstration écrits par le slot 1 le 04/11/2026.
 *
 * Les règles sont celles de la fiche « CRITERES-WCAG-2.2-AA.md » (slot 1) :
 * 13 critères, dont 7 « REST vérifiable » (constat PRUVÉ) et 6 « contenu
 * seulement (partiel) » (constat SIGNALÉ, à vérifier).
 *
 * Règle de langue du produit : jamais « conforme », jamais « compliance ».
 * L'app produit des constats à faire vérifier, pas un verdict.
 *
 * Trois informations de l'écran ne sont PAS dans l'API REST et ne font donc
 * AUCUN contrôle ici (fiche §15) : le contraste RENDU, l'ordre de lecture /
 * de focus, et les libellés visibles. Le contraste est traité en 1.4.3 mais
 * uniquement comme un ratio calculé SOUS HYPOTHÈSE « fond blanc », avec la
 * mention « contraste incertain » — jamais « contraste non conforme ».
 */

// ---------------------------------------------------------------------------
// Catalogue des critères : niveau WCAG + niveau de confiance
// ---------------------------------------------------------------------------

const CRITERES = {
  '1.1.1': { niveau: 'A', confiance: 'REST-verifiable', titre: 'Non-text Content' },
  '1.3.1': { niveau: 'A', confiance: 'REST-verifiable', titre: 'Info and Relationships' },
  '2.4.4': { niveau: 'A', confiance: 'REST-verifiable', titre: 'Link Purpose (In Context)' },
  '3.3.2': { niveau: 'A', confiance: 'REST-verifiable', titre: 'Labels or Instructions' },
  '4.1.2': { niveau: 'A', confiance: 'REST-verifiable', titre: 'Name, Role, Value' },
  '2.4.2': { niveau: 'A', confiance: 'REST-verifiable', titre: 'Page Titled' },
  '3.2.6': { niveau: 'A', confiance: 'REST-verifiable', titre: 'Consistent Help' },
  '1.4.1': { niveau: 'A', confiance: 'content only (partial)', titre: 'Use of Color' },
  '1.4.3': { niveau: 'AA', confiance: 'content only (partial)', titre: 'Contrast (Minimum)' },
  '1.2.2': { niveau: 'A', confiance: 'content only (partial)', titre: 'Captions (Prerecorded)' },
  '2.4.6': { niveau: 'AA', confiance: 'content only (partial)', titre: 'Headings and Labels' },
  '1.3.5': { niveau: 'AA', confiance: 'content only (partial)', titre: 'Identify Input Purpose' },
  '1.3.3': { niveau: 'A', confiance: 'content only (partial)', titre: 'Sensory Characteristics' },
};

// Les 3 constats que l'API REST ne permet PAS de faire (§15 de la fiche).
// L'app ne dit rien dessus : elle le dit dans sa note de méthode.
const CONSTATS_IMPOSSIBLES = [
  'rendered contrast (real portal background and text colour)',
  'reading order and focus order on screen',
  'visible labels (string rendered by the portal)',
];

// ---------------------------------------------------------------------------
// Listes lexicales (fiche §4 2.4.4, §7 2.4.2, §12 2.4.6, §13 1.3.5, §14 1.3.3)
// ---------------------------------------------------------------------------

// 2.4.4 : libellés de liens qui ne décrivent pas leur but (signalement, pas preuve).
const LIENS_NON_DESCRIPTIFS = [
  'cliquez ici',
  'cliquez ici pour plus d informations',
  'en savoir plus',
  'ici',
  'lire la suite',
  'voir',
  'documentation',
  'télécharger',
  'lien',
  'plus d infos',
  // English (most portals and every Codegeist judge site are in English)
  'click here',
  'click',
  'here',
  'read more',
  'learn more',
  'more',
  'more info',
  'more information',
  'see more',
  'this link',
  'link',
  'details',
  'download',
  'this page',
];

// 2.4.2 : titres de page non descriptifs.
const TITRES_NON_DESCRIPTIFS = [
  'page',
  'document',
  'mise a jour',
  'nouveau',
  'sans titre',
  'home',
  'accueil',
  'index',
  'article',
  'notes',
  'untitled',
  'new page',
  'test',
  'title',
];

// 2.4.6 : titres de section trop vagues (« Détails », « Info »…).
const TITRES_VAGUES = [
  'détails',
  'détail',
  'informations',
  'info',
  'misc',
  'miscellaneous',
  'autres',
  'suite',
  'introduction',
  'à propos',
  'ici',
  'liens',
  'annexe',
  'information',
  'other',
  'others',
  'more',
  'links',
  'appendix',
];

// 1.3.5 : mots-clés de DONNÉE PERSONNELLE (le champ collecte-t-il une
// information sur la personne ? C'est le seul cas que 1.3.5 vise).
const MOTS_CLES_FINALITE = [
  'e-mail',
  'email',
  'mail',
  'telephone',
  'tel',
  'phone',
  'url',
  'site web',
  'nom',
  'prenom',
  'adresse',
  'code postal',
  'date de naissance',
  'numero de carte',
  // English
  'name',
  'first name',
  'last name',
  'surname',
  'full name',
  'username',
  'address',
  'postcode',
  'postal code',
  'zip',
  'mobile',
  'telephone',
  'date of birth',
  'birthday',
  'website',
  'organization',
  'organisation',
  'company',
  'job title',
  'card number',
  'country',
  'city',
];

// 1.3.3 : instructions qui reposent sur une position ou une couleur.
const MOTIFS_SENSORIELS = [
  'en haut a droite',
  'en bas a gauche',
  'au milieu',
  'sur le cote',
  'le bouton rouge',
  'le bouton vert',
  'l icone bleue',
  'la case grise',
  // English
  'top right',
  'top left',
  'bottom right',
  'bottom left',
  'on the right',
  'on the left',
  'red button',
  'green button',
  'blue button',
  'blue icon',
  'grey box',
  'gray box',
  'round button',
];

// 1.4.3 : seuil WCAG pour du texte de taille normale.
//
// Le seuil « grand texte » (3:1) n'est PAS appliqué, et il ne peut pas
// l'être : dire si un texte est « grand » demande la taille de la police,
// qui est dans le THÈME du portail — qu'aucune API ne donne. Une constante
// 3:1 déclarée et jamais utilisée laissait croire que l'app appliquait ce
// seuil ; elle a été retirée (constat de la Direction, 23/11/2026). Le seul
// seuil appliqué est 4,5:1, et le constat dit « contraste incertain ».
const SEUIL_CONTRASTE_NORMAL = 4.5;

// ---------------------------------------------------------------------------
// Utilitaires de texte
// ---------------------------------------------------------------------------

/** Minuscules, sans accents, sans ponctuation, espaces normalisés. */
const sansAccents = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normaliser = (s) =>
  sansAccents(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normaliserListe = (liste) => liste.map(normaliser);

/** Le motif (déjà normalisé) apparaît-il comme mot(s) entier(s) dans le texte normalisé ? */
const contientMots = (texteNorm, motif) => (' ' + texteNorm + ' ').includes(' ' + motif + ' ');

const LIENS_ND = normaliserListe(LIENS_NON_DESCRIPTIFS);
const TITRES_ND = normaliserListe(TITRES_NON_DESCRIPTIFS);
const TITRES_VAGUES_ND = normaliserListe(TITRES_VAGUES);
const MOTS_CLES_FINALITE_ND = normaliserListe(MOTS_CLES_FINALITE);
const MOTIFS_SENSORIELS_ND = normaliserListe(MOTIFS_SENSORIELS);

/** Une chemin JSON se construit comme dans le contrat de la fiche §0.4. */
const prop = (base, cle) => (base ? base + '.' + cle : cle);
const index = (base, i) => base + '[' + i + ']';
/** Enfant n° i du tableau `content` d'un noeud ADF (chemin du contrat §0.4). */
const cheminEnfant = (base, i) => base + '.content[' + i + ']';

/** Parcours récursif d'un document ADF : callback (noeud, chemin). */
function parcourir(noeud, chemin, visitor) {
  if (!noeud || typeof noeud !== 'object') return;
  visitor(noeud, chemin);
  const contenu = Array.isArray(noeud.content) ? noeud.content : [];
  for (let i = 0; i < contenu.length; i += 1) {
    parcourir(contenu[i], cheminEnfant(chemin, i), visitor);
  }
}

/** Texte concaténé d'un sous-arbre (les nœuds `text` portent la chaîne). */
function texteDu(noeud) {
  let texte = '';
  parcourir(noeud, '', (n) => {
    if (n.type === 'text' && typeof n.text === 'string') texte += n.text;
  });
  return texte;
}

/** Chemin du PREMIER nœud `text` d'un sous-arbre (pour pointer la valeur lue). */
function cheminPremierTexte(noeud, cheminBase) {
  let trouve = null;
  parcourir(noeud, cheminBase, (n, chemin) => {
    if (trouve === null && n.type === 'text') trouve = chemin;
  });
  return trouve;
}

// ---------------------------------------------------------------------------
// Couleur et contraste (1.4.3)
// ---------------------------------------------------------------------------

function hexRgb(hexa) {
  let h = String(hexa).replace('#', '');
  // Une couleur courte (#fff) est la MÊME couleur que son équivalent long
  // (#ffffff) : sans cette extension, la règle 1.4.3 ignorait toutes les
  // couleurs écrites en 3 chiffres (faux négatif de contraste).
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function luminanceRelative(rgb) {
  const canal = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgb.map(canal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG entre deux couleurs (formule officielle). */
function ratioContraste(rgb1, rgb2) {
  const l1 = luminanceRelative(rgb1);
  const l2 = luminanceRelative(rgb2);
  const haute = Math.max(l1, l2);
  const basse = Math.min(l1, l2);
  return (haute + 0.05) / (basse + 0.05);
}

// ---------------------------------------------------------------------------
// Construction d'un constat
// ---------------------------------------------------------------------------

/**
 * Un constat respecte le contrat de sortie de la fiche §0.4 :
 * { critere, niveau, source, ressource, emplacement, valeur, message, a_verifier }
 * `preuve` porte, en mode démo, l'identifiant du contrat de test (DEMO-xx) et,
 * en production, la preuve lue (ressource + valeur).
 */
function constat(critere, source, ressource, emplacement, valeur, message, options) {
  const opts = options || {};
  const meta = CRITERES[critere] || { niveau: '?', confiance: '?' };
  return {
    critere,
    niveau: meta.niveau,
    confiance: meta.confiance,
    source,
    ressource,
    emplacement,
    valeur: valeur === undefined ? null : valeur,
    message,
    a_verifier: opts.aVerifier === true,
    ...(opts.preuve ? { preuve: opts.preuve } : {}),
    ...(opts.evidence ? { evidence: opts.evidence } : {}),
    ...(opts.hypothese ? { hypothese: opts.hypothese } : {}),
    ...(opts.ratio !== undefined ? { ratio: Math.round(opts.ratio * 100) / 100 } : {}),
  };
}

// ---------------------------------------------------------------------------
// Règles sur un document ADF (E1 : description d'issue, E2 : corps de page)
// ---------------------------------------------------------------------------

/**
 * 1.1.1 Non-text Content — un nœud `media` sans texte alternatif (ou vide).
 * La fiche rappelle que l'app ne peut pas savoir si l'image est décorative
 * (exception prévue par 1.1.1) : le constat porte donc sur un fait lu dans
 * l'API — pas de texte alternatif — et non sur un verdict : c'est un
 * signalement, pas une preuve (même famille que 2.4.4, dont le but réel
 * d'un lien est aussi un jugement humain). Le drapeau du constat est donc
 * `a_verifier: false` : le critère est de niveau « REST vérifiable »
 * (légende de la fiche), le CONTRÔLE est automatique, le verdict ne l'est pas.
 */
function regleTexteAlternatif(noeud, chemin, ctx) {
  if (noeud.type !== 'media') return;
  const attrs = noeud.attrs || {};
  if (!('alt' in attrs)) {
    ctx.constats.push(
      constat(
        '1.1.1',
        ctx.source,
        ctx.ressource,
        prop(chemin, 'attrs'),
        null,
        'Image without alternative text',
        { aVerifier: false }
      )
    );
  } else if (String(attrs.alt).trim() === '') {
    ctx.constats.push(
      constat(
        '1.1.1',
        ctx.source,
        ctx.ressource,
        prop(prop(chemin, 'attrs'), 'alt'),
        attrs.alt,
        'Empty alternative text',
        { aVerifier: false }
      )
    );
  }
}

/**
 * 1.3.1 Info and Relationships — hiérarchie de titres : niveau sauté.
 * Le premier titre d'un document n'est jamais signalé.
 */
function regleNiveauxTitres(noeud, chemin, ctx) {
  if (noeud.type !== 'heading') return;
  const level = (noeud.attrs || {}).level;
  const precedent = ctx.dernierTitre;
  ctx.dernierTitre = level;
  if (typeof precedent !== 'number' || typeof level !== 'number') return;
  if (level - precedent > 1) {
    ctx.constats.push(
      constat(
        '1.3.1',
        ctx.source,
        ctx.ressource,
        prop(prop(chemin, 'attrs'), 'level'),
        level,
        'Heading level skipped from ' + precedent + ' to ' + level,
        { aVerifier: false }
      )
    );
  }
}

/**
 * 1.3.1 Info and Relationships — tableau : la 1re ligne doit porter des
 * `tableHeader` (le schéma ADF distingue `tableHeader` et `tableCell`).
 */
function regleEnteteTableau(noeud, chemin, ctx) {
  if (noeud.type !== 'table') return;
  const premiereLigne = Array.isArray(noeud.content) ? noeud.content[0] : null;
  if (!premiereLigne || !Array.isArray(premiereLigne.content)) return;
  const cellules = premiereLigne.content;
  if (cellules.length === 0) return;
  const aEntete = cellules.some((c) => c && c.type === 'tableHeader');
  if (aEntete) return;
  const premiereCellule = cellules[0];
  ctx.constats.push(
    constat(
      '1.3.1',
      ctx.source,
      ctx.ressource,
      prop(index(prop(cheminEnfant(chemin, 0), 'content'), 0), 'type'),
      premiereCellule ? premiereCellule.type : null,
      'Table header missing: the first row contains only cells',
      { aVerifier: false }
    )
  );
}

/**
 * 2.4.4 Link Purpose (In Context) — libellé de lien non descriptif.
 * On ne juge QUE le texte du lien (la phrase qui l'accompagne rend le lien
 * compréhensible : c'est la limite annoncée par la fiche).
 */
function regleLiens(noeud, chemin, ctx) {
  const enfants = Array.isArray(noeud.content) ? noeud.content : [];
  let groupe = null;

  const clore = () => {
    if (!groupe) return;
    const brut = groupe.texte.trim();
    const norm = normaliser(brut);
    const estUrl = /^https?:\/\//i.test(brut);
    const sansAlphanumerique = norm === '' || !/[\p{L}\p{N}]/u.test(norm);
    if (LIENS_ND.includes(norm) || estUrl || sansAlphanumerique) {
      ctx.constats.push(
        constat(
          '2.4.4',
          ctx.source,
          ctx.ressource,
          prop(groupe.chemin, 'text'),
          brut,
          estUrl
            ? 'Non-descriptive link text: the link text is a raw URL'
            : 'Non-descriptive link text: the label does not describe the destination',
          { aVerifier: false, evidence: 'href=' + groupe.href }
        )
      );
    }
    groupe = null;
  };

  for (let i = 0; i < enfants.length; i += 1) {
    const enfant = enfants[i];
    const marque =
      enfant && enfant.type === 'text' && Array.isArray(enfant.marks)
        ? enfant.marks.find((m) => m && m.type === 'link')
        : null;
    if (!marque) {
      clore();
      continue;
    }
    const href = (marque.attrs || {}).href || '';
    if (!groupe || groupe.href !== href) {
      clore();
      groupe = { href, texte: '', chemin: cheminEnfant(chemin, i) };
    }
    groupe.texte += typeof enfant.text === 'string' ? enfant.text : '';
  }
  clore();
}

/**
 * 4.1.2 Name, Role, Value — `mention` sans `attrs.text` : le nom affiché de la
 * personne n'est pas porté par le contenu. `status` sans `attrs.text` : donnée
 * corrompue. Le `taskItem` est un contrôle systématiquement positif (nom =
 * texte, valeur = `state`).
 */
function regleNomRoleValeur(noeud, chemin, ctx) {
  if (noeud.type === 'mention') {
    const attrs = noeud.attrs || {};
    if (!('text' in attrs) || String(attrs.text).trim() === '') {
      ctx.constats.push(
        constat(
          '4.1.2',
          ctx.source,
          ctx.ressource,
          prop(chemin, 'attrs'),
          'text' in attrs ? attrs.text : null,
          'Mention name not carried by the content (no `text` attribute)',
          { aVerifier: false }
        )
      );
    }
  }
  if (noeud.type === 'status') {
    const attrs = noeud.attrs || {};
    if (!('text' in attrs) || String(attrs.text).trim() === '') {
      ctx.constats.push(
        constat(
          '4.1.2',
          ctx.source,
          ctx.ressource,
          prop(chemin, 'attrs'),
          'text' in attrs ? attrs.text : null,
          'Status without a label (`text` attribute missing)',
          { aVerifier: false }
        )
      );
    }
  }
}

/**
 * 1.4.1 Use of Color — l'information n'est portée QUE par la couleur.
 * On vise uniquement le glyphe seul (`●`, `■`) coloré : un texte coloré dont
 * le sens est déjà dans les mots (« Urgent » en rouge) n'est pas signalé.
 */
function regleCouleurSeule(noeud, chemin, ctx) {
  if (noeud.type !== 'text' || !Array.isArray(noeud.marks)) return;
  const texte = String(noeud.text == null ? '' : noeud.text);
  if (texte.trim() === '') return;
  if (/[\p{L}\p{N}]/u.test(normaliser(texte))) return; // le sens est dans les mots
  const iMarque = noeud.marks.findIndex((m) => m && m.type === 'textColor');
  if (iMarque < 0) return;
  const porteAutreMarque = noeud.marks.some((m) => m && ['strong', 'underline', 'em'].includes(m.type));
  if (porteAutreMarque) return;
  ctx.constats.push(
    constat(
      '1.4.1',
      ctx.source,
      ctx.ressource,
      index(prop(chemin, 'marks'), iMarque),
      noeud.marks[iMarque],
      'Information is carried by colour alone (coloured glyph on its own)',
      { aVerifier: true }
    )
  );
}

/**
 * 1.4.3 Contrast (Minimum) — ratio calculé SOUS HYPOTHÈSE « fond blanc ».
 * La couleur RENDUE (fond réel, thème du portail) n'est dans aucune API : le
 * constat est donc « contraste incertain », jamais « non conforme ».
 */
function regleContraste(noeud, chemin, ctx) {
  if (noeud.type !== 'text' || !Array.isArray(noeud.marks)) return;
  const iMarque = noeud.marks.findIndex((m) => m && m.type === 'textColor');
  if (iMarque < 0) return;
  const couleur = ((noeud.marks[iMarque].attrs || {}).color || '');
  // 3 chiffres (#fff) ou 6 (#ffffff) : les deux écritures sont valides.
  if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(couleur)) return;
  const ratio = ratioContraste(hexRgb(couleur), [255, 255, 255]);
  if (ratio >= SEUIL_CONTRASTE_NORMAL) return;
  ctx.constats.push(
    constat(
      '1.4.3',
      ctx.source,
      ctx.ressource,
      prop(index(prop(chemin, 'marks'), iMarque), 'attrs') + '.color',
      couleur,
      'Uncertain contrast: ratio ' + ratio.toFixed(2) + ':1 computed on a white background (assumption), below the 4.5:1 threshold',
      { aVerifier: true, hypothese: 'white background', ratio }
    )
  );
}

/**
 * 2.4.6 Headings and Labels — titre de section trop vague.
 * Le rendu (taille, casse, position) n'est pas dans l'API : c'est un signalement.
 */
function regleTitreVague(noeud, chemin, ctx) {
  if (noeud.type !== 'heading') return;
  const texte = texteDu(noeud);
  const norm = normaliser(texte);
  // ECART ASSUMÉ avec la formulation littérale de la fiche §12 : celle-ci
  // signalait aussi tout titre de MOINS DE 2 MOTS. Cette clause produirait un
  // faux positif systématique sur les titres corrects d'un seul mot (« FAQ »,
  // « Contact », « Sommaire », « Escalade »…) : l'app s'en tient donc à la
  // liste explicite de titres vagues, qui est le contrôle lexical annoncé.
  if (!TITRES_VAGUES_ND.includes(norm)) return;
  const cheminTexte = cheminPremierTexte(noeud, chemin);
  if (cheminTexte === null) return;
  ctx.constats.push(
    constat(
      '2.4.6',
      ctx.source,
      ctx.ressource,
      prop(cheminTexte, 'text'),
      texte,
      'Section heading too vague: it describes neither the subject nor the purpose',
      { aVerifier: true }
    )
  );
}

/**
 * 1.3.3 Sensory Characteristics — instruction qui repose sur une position ou
 * une couleur (« en haut à droite », « le bouton rouge »…).
 */
function regleCaracteristiqueSensorielle(noeud, chemin, ctx) {
  if (noeud.type !== 'text') return;
  const texte = String(noeud.text == null ? '' : noeud.text);
  if (texte.trim() === '') return;
  const norm = normaliser(texte);
  const motif = MOTIFS_SENSORIELS_ND.find((m) => contientMots(norm, m));
  if (!motif) return;
  ctx.constats.push(
    constat(
      '1.3.3',
      ctx.source,
      ctx.ressource,
      prop(chemin, 'text'),
      texte,
      'Instruction that relies on a sensory characteristic ("' + motif + '")',
      { aVerifier: true }
    )
  );
}

/**
 * Analyse un document ADF complet (E1 ou E2).
 * @param {object} adf       le document ADF
 * @param {string} racine    chemin JSON de la racine du document (ex. « fields.description »)
 * @param {string} source    code de la source REST (« E1 », « E2 »…)
 * @param {string} ressource identifiant de la ressource lue (clé d'issue, id de page…)
 * @returns {Array} liste de constats
 */
function analyserDocument(adf, racine, source, ressource) {
  const ctx = { constats: [], source, ressource, dernierTitre: null };
  if (!adf || typeof adf !== 'object') return ctx.constats;
  parcourir(adf, racine, (noeud, chemin) => {
    regleTexteAlternatif(noeud, chemin, ctx);
    regleNiveauxTitres(noeud, chemin, ctx);
    regleEnteteTableau(noeud, chemin, ctx);
    regleLiens(noeud, chemin, ctx);
    regleNomRoleValeur(noeud, chemin, ctx);
    regleCouleurSeule(noeud, chemin, ctx);
    regleContraste(noeud, chemin, ctx);
    regleTitreVague(noeud, chemin, ctx);
    regleCaracteristiqueSensorielle(noeud, chemin, ctx);
  });
  return ctx.constats;
}

// ---------------------------------------------------------------------------
// 3.3.2 / 1.3.5 — champs du formulaire de demande (E4)
// ---------------------------------------------------------------------------

/**
 * Champs du formulaire de portail (E4 : `requestTypeFields[]`).
 *
 * 3.3.2 : `name` absent ou vide → « champ sans étiquette » (preuve : la valeur
 * est absente). `description` vide → « champ sans instruction », constat
 * `a_verifier` (l'instruction n'est pas obligatoire si le nom suffit).
 * La fiche demande de ne traiter que les champs `visible == true`.
 *
 * 1.3.5 : le champ collecte-t-il une DONNÉE PERSONNELLE (mot-clé de finalité
 * dans « nom + description ») ? La finalité doit alors être identifiable par
 * programme au rendu (autocomplete) — hors de portée de l'API REST, donc un
 * constat « à vérifier » ; les champs sans donnée personnelle ne relèvent
 * pas de 1.3.5.
 */
function analyserChampsJsm(champs, racine, source, ressource) {
  const constats = [];
  const liste = Array.isArray(champs) ? champs : [];
  for (let i = 0; i < liste.length; i += 1) {
    const champ = liste[i] || {};
    const chemin = index(racine, i);
    if (champ.visible === false) continue; // un champ caché n'est pas rendu
    const nom = champ.name == null ? '' : String(champ.name);
    const description = champ.description == null ? '' : String(champ.description);

    if (nom.trim() === '') {
      constats.push(
        constat(
          '3.3.2',
          source,
          ressource,
          prop(chemin, 'name'),
          champ.name === undefined ? null : champ.name,
          'Form field without a label (`name` is empty)',
          { aVerifier: false }
        )
      );
    }

    // « champ sans instruction » : réservé aux champs OBLIGATOIRES.
    // Deux écarts assumés avec la formulation littérale de la fiche §5 :
    //  - la fiche conditionne ce constat à « name non vide ET description
    //    vide » : sans cette condition, le champ sans étiquette ET sans
    //    description (le cas de démonstration) ne serait jamais signalé ;
    //  - la fiche ne filtre pas sur `required` : sans ce filtre, chaque champ
    //    FACULTATIF sans description serait signalé, ce qui inonderait le
    //    rapport d'un portal réel (la plupart des champs optionnels n'ont pas
    //    de description). 3.3.2 demande « une étiquette OU une instruction » :
    //    un champ facultatif sans description n'est pas un défaut. Ces champs
    //    ne sont repris par 1.3.5 que s'ils collectent une donnée personnelle.
    if (description.trim() === '' && champ.required === true) {
      constats.push(
        constat(
          '3.3.2',
          source,
          ressource,
          prop(chemin, 'description'),
          champ.description === undefined ? null : champ.description,
          'Required field without instructions (`description` is empty)',
          { aVerifier: true }
        )
      );
    }

    // 1.3.5 : donnée personnelle. Un champ sans étiquette n'est pas repris ici
    // (3.3.2 le signale déjà : on ne peut pas demander la finalité d'un champ
    // qui n'a pas de nom).
    // WCAG 1.3.5 vise les champs qui collectent une information SUR LA
    // PERSONNE (e-mail, téléphone, nom, adresse…) : la finalité de la saisie
    // doit être identifiable PAR PROGRAMME (attribut autocomplete du champ
    // rendu). Cet attribut n'est exposé par AUCUNE API REST : le constat est
    // donc « à vérifier », et il ne vise QUE les champs de saisie libre dont
    // le nom ou la description annonce une donnée personnelle. Un champ sans
    // rapport avec la personne (« Steps to reproduce », « Référence »…)
    // relève de 1.2.2/1.3.3 au besoin, pas de 1.3.5 : aucun constat.
    // (Règle du 23/11/2026 — l'ancienne, qui signalait les champs SANS
    // mot-clé, était à l'envers : faux positif sur « Steps to reproduce »,
    // silence sur « Email ». Voir docs/CRITERES-WCAG-2.2-AA.md § 13.)
    const fieldId = champ.fieldId == null ? '' : String(champ.fieldId);
    const schema = champ.jiraSchema || {};
    const saisieLibre =
      (fieldId === '' || fieldId.startsWith('customfield_')) &&
      (schema.type === undefined || schema.type === 'string') &&
      !/(select|radio|checkbox|multi|cascading|picker|labels)/i.test(String(schema.custom || ''));
    if (nom.trim() !== '' && saisieLibre) {
      const tout = normaliser(nom + ' ' + description);
      const donneePersonnelle = MOTS_CLES_FINALITE_ND.find((mot) => contientMots(tout, mot));
      if (donneePersonnelle) {
        constats.push(
          constat(
            '1.3.5',
            source,
            ressource,
            prop(chemin, 'name'),
            nom,
            'Field collecting personal data ("' +
              donneePersonnelle +
              '"): WCAG 1.3.5 requires the input purpose to be programmatically identifiable when rendered (autocomplete) — the REST API cannot read that attribute, so a human must check it',
            { aVerifier: true }
          )
        );
      }
    }
  }
  return constats;
}

// ---------------------------------------------------------------------------
// 3.2.6 — aide cohérente entre types de demande (E5)
// ---------------------------------------------------------------------------

/**
 * Types de demande d'un même service desk (E5 : `values[]`).
 *
 * 3.2.6 : si un type de demande a une aide (`helpText`) et un autre du même
 * service desk n'en a pas → « aide inconsistente ». L'API donne la PRÉSENCE
 * de l'aide, pas sa POSITION à l'écran : le constat est `a_verifier`.
 *
 * Variante champ : deux champs de MÊME NOM dans deux types, l'un avec
 * description et l'autre sans → même constat (nécessite les champs de
 * plusieurs types : `champsParType`).
 *
 * @param {number[]|undefined} indices  index de chaque type dans la réponse
 *        BRUTE (`values[]` du JSON lu). Sans lui, le chemin du constat
 *        désigne la position dans la liste FILTRÉE — donc le mauvais type
 *        quand un type caché du portail a été retiré (23/11/2026).
 */
function analyserTypesDemande(types, racine, source, ressource, champsParType, indices) {
  const constats = [];
  const liste = Array.isArray(types) ? types : [];
  const avecAide = [];
  const sansAide = [];
  liste.forEach((type, i) => {
    const aide = type && type.helpText != null ? String(type.helpText) : '';
    if (aide.trim() === '') sansAide.push(i);
    else avecAide.push(i);
  });
  if (avecAide.length > 0 && sansAide.length > 0) {
    for (const i of sansAide) {
      const type = liste[i] || {};
      const pos = Array.isArray(indices) && indices[i] !== undefined ? indices[i] : i;
      constats.push(
        constat(
          '3.2.6',
          source,
          ressource,
          prop(index(racine, pos), 'helpText'),
          type.helpText === undefined ? null : type.helpText,
          'Inconsistent help between request types: another request type of the same service desk has help text, this one has none',
          { aVerifier: true }
        )
      );
    }
  }

  // Variante champ : même nom de champ, description présente dans un type et
  // absente dans un autre.
  if (Array.isArray(champsParType) && champsParType.length > 1) {
    const parNom = new Map();
    for (const entree of champsParType) {
      const champs = Array.isArray(entree.champs) ? entree.champs : [];
      const racineChamps = entree.racine || 'requestTypeFields';
      champs.forEach((champ, i) => {
        const nom = champ && champ.name != null ? String(champ.name).trim() : '';
        if (nom === '') return;
        if (!parNom.has(nom)) parNom.set(nom, []);
        parNom.get(nom).push({
          chemin: prop(index(racineChamps, i), 'description'),
          description: champ.description == null ? '' : String(champ.description),
          ressource: entree.ressource || ressource,
        });
      });
    }
    for (const [nom, occurrences] of parNom.entries()) {
      if (occurrences.length < 2) continue;
      const avecDescription = occurrences.filter((o) => o.description.trim() !== '');
      const sansDescription = occurrences.filter((o) => o.description.trim() === '');
      if (avecDescription.length === 0 || sansDescription.length === 0) continue;
      for (const o of sansDescription) {
        constats.push(
          constat(
            '3.2.6',
            source,
            o.ressource,
            o.chemin,
            null,
            'Inconsistent help between request types: the field "' + nom + '" has a description in another request type and none in this one',
            { aVerifier: true }
          )
        );
      }
    }
  }
  return constats;
}

// ---------------------------------------------------------------------------
// 1.2.2 — transcription d'un média (E3)
// ---------------------------------------------------------------------------

/**
 * Pièces jointes d'une page (E3 : `results[]`).
 * 1.2.2 : un média `video/*` sans transcription disponible → constat.
 *
 * Deux précisions que la fiche (CRITERES-WCAG-2.2-AA.md § 11) pose déjà :
 *
 *  - la présence d'un fichier `.vtt` sur la page ne prouve pas qu'il est
 *    RATTACHÉ au média (le lien se fait dans le corps de la page, hors API).
 *    Une page qui porte UNE vidéo et une piste ne pose pas de question ;
 *    une page qui en porte PLUSIEURS ne permet pas d'attribuer la piste :
 *    le constat passe alors en « à vérifier » au lieu de disparaître
 *    (constat de la Direction, 23/11/2026) ;
 *  - 1.2.2 est « Captions (Prerecorded) » : elle vise la VIDÉO. Un fichier
 *    `audio/*` seul relève de 1.2.1, que cette app n'implémente pas (elle
 *    n'en annonce que 13 critères) : il n'y a donc AUCUN constat 1.2.2 pour
 *    un média audio (constat de la Direction, 23/11/2026).
 */
function analyserPieceJointes(attachments, racine, source, ressource) {
  const constats = [];
  const liste = Array.isArray(attachments) ? attachments : [];
  const videos = [];
  let nbTranscriptions = 0;
  liste.forEach((piece, i) => {
    const type = piece && piece.mediaType != null ? String(piece.mediaType) : '';
    const lien = piece && piece.downloadLink != null ? String(piece.downloadLink) : '';
    if (type === 'text/vtt' || /\.(vtt|srt)$/i.test(lien)) {
      nbTranscriptions += 1;
      return;
    }
    if (/^video\//.test(type)) videos.push(i);
  });
  if (videos.length === 0) return constats;
  // Une piste existe ET la page ne porte qu'une vidéo : rien d'ambigu.
  if (nbTranscriptions > 0 && videos.length === 1) return constats;
  for (const i of videos) {
    const piece = liste[i] || {};
    constats.push(
      constat(
        '1.2.2',
        source,
        ressource,
        prop(index(racine, i), 'mediaType'),
        piece.mediaType === undefined ? null : piece.mediaType,
        nbTranscriptions === 0
          ? 'Media without an available transcript (no `text/vtt` attachment and no `.vtt`/`.srt` track)'
          : 'Media whose transcript cannot be attributed: the page carries a transcript track, but the REST API does not say which media it belongs to — a human must check',
        { aVerifier: true }
      )
    );
  }
  return constats;
}

// ---------------------------------------------------------------------------
// 2.4.2 — titre de page (E2, E5, article de la base de connaissances)
// ---------------------------------------------------------------------------

/**
 * 2.4.2 Page Titled — le titre doit décrire le sujet de la page.
 * Contrôle LEXICAL (liste de titres non descriptifs + absence de mot commun
 * avec les 10 premiers mots du corps) : c'est un signalement, pas une preuve
 * de pertinence.
 *
 * @param {string} titre      le titre lu
 * @param {string} racine     chemin JSON du titre (ex. « title »)
 * @param {string} source     code de la source REST
 * @param {string} ressource  identifiant de la ressource
 * @param {string|null} corpsTexte  texte du corps, si l'API le donne (sinon null)
 */
function analyserTitre(titre, racine, source, ressource, corpsTexte) {
  const norm = normaliser(titre);
  const motsTitre = norm.split(' ').filter((m) => m.length >= 4);
  let raison = null;
  let heuristique = false;
  if (norm === '') {
    raison = 'Empty title';
  } else if (TITRES_ND.includes(norm)) {
    raison = 'Non-descriptive title ("' + String(titre) + '" is a generic title)';
  } else if (typeof corpsTexte === 'string' && corpsTexte.trim() !== '' && motsTitre.length > 0) {
    const motsCorps = normaliser(corpsTexte).split(' ').filter(Boolean).slice(0, 10);
    const racine = (m) => m.slice(0, 5);
    const partage = motsTitre.some((m) => motsCorps.some((c) => c === m || racine(c) === racine(m)));
    if (!partage) {
      raison = 'Title shares no significant word with the beginning of the content (heuristic: check that the title describes the topic)';
      heuristique = true;
    }
  }
  if (!raison) return [];
  return [
    constat(
      '2.4.2',
      source,
      ressource,
      racine,
      titre == null ? null : titre,
      raison,
      { aVerifier: heuristique }
    ),
  ];
}

// ---------------------------------------------------------------------------
// Rapport par critère (le « statut par critère » du rapport de l'app)
// ---------------------------------------------------------------------------

/**
 * Construit le statut par critère : pour chacun des 13 critères, le nombre de
 * constats et la nature du constat (« prouvé » ou « à vérifier »).
 */
function rapportParCritere(constats) {
  const lignes = Object.keys(CRITERES).map((critere) => {
    const concerned = constats.filter((c) => c.critere === critere);
    const aVerifier = concerned.filter((c) => c.a_verifier === true).length;
    return {
      critere,
      titre: CRITERES[critere].titre,
      niveau: CRITERES[critere].niveau,
      confiance: CRITERES[critere].confiance,
      constats: concerned.length,
      dont_a_verifier: aVerifier,
      statut: concerned.length === 0 ? 'no finding' : aVerifier === concerned.length ? 'to verify' : 'finding',
    };
  });
  const couverts = lignes.filter((l) => l.constats > 0).length;
  return {
    criteres: lignes,
    couverture: { criteres_implémentes: lignes.length, criteres_avec_constat: couverts },
    constats_impossibles: CONSTATS_IMPOSSIBLES,
  };
}

/** Export CSV des constats (colonnes stables, échappement RFC 4180). */
function versCsv(constats) {
  // Les en-têtes du CSV sont en anglais : c'est le format qui sort du
  // produit (téléchargé par le juge). Les CLÉS du constat restent celles du
  // contrat de sortie documenté (critere, niveau, …) : `colonnes` porte le
  // couple (clé du constat, en-tête du CSV).
  const colonnes = [
    ['critere', 'criterion'],
    ['niveau', 'level'],
    ['confiance', 'confidence'],
    ['source', 'source'],
    ['ressource', 'resource'],
    ['emplacement', 'location'],
    ['valeur', 'value'],
    ['message', 'message'],
    ['a_verifier', 'to_verify'],
  ];
  // Injection de formule (règle du 23/11/2026) : une valeur lue sur le site
  // et commençant par =, +, -, @, tabulation ou CR serait interprétée comme
  // une FORMULE par le tableur qui ouvre le CSV (=HYPERLINK…), même entre
  // guillemets — l'échappement RFC 4180 ne neutralise pas ça. La parade
  // usuelle (OWASP « CSV Injection») : préfixer d'une apostrophe.
  const AMORCE_FORMULE = /^[=+\-@\t\r]/;
  const echapper = (v) => {
    if (v === null || v === undefined) return '""';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    const protege = AMORCE_FORMULE.test(s) ? "'" + s : s;
    return '"' + protege.replace(/"/g, '""') + '"';
  };
  const lignes = [colonnes.map((p) => '\"' + p[1] + '\"').join(',')];
  for (const c of constats) {
    lignes.push(colonnes.map((p) => echapper(c[p[0]])).join(','));
  }
  return lignes.join('\r\n') + '\r\n';
}

module.exports = {
  CRITERES,
  CONSTATS_IMPOSSIBLES,
  analyserDocument,
  analyserChampsJsm,
  analyserTypesDemande,
  analyserPieceJointes,
  analyserTitre,
  rapportParCritere,
  versCsv,
  // utilitaires exposés pour les tests hors ligne
  _utilitaires: {
    normaliser,
    sansAccents,
    ratioContraste,
    hexRgb,
    luminanceRelative,
    texteDu,
  },
};
