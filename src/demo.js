/**
 * Mode DÉMO de l'app — « Portal Accessibility Checker for JSM ».
 *
 * Le mode démo fait tourner le MÊME moteur de règles (src/regles.js) que le
 * scan en production, sur les 6 fichiers JSON de démonstration écrits par le
 * slot 1 le 04/11/2026 (réponses REST figées, sans compte et sans tenant).
 *
 * Ce qu'il apporte : une preuve que les règles fonctionnent, rejouable par
 * n'importe qui, sans accès à un site Atlassian. Le mode démo ne se contente
 * pas d'afficher des constats : il les CONFRONTE au contrat de test
 * (src/demo/contrat.json, généré depuis l'index du slot 1) et publie un
 * verdict :
 *   - 23 fautives DEMO-xx détectées (une par chemin, avec le bon critère) ;
 *   - 0 faux positif sur les 6 contrôles négatifs SANTÉ-xx ;
 *   - 0 constat hors contrat.
 *
 * Règle de langue : le verdict parle de DÉTECTION et de FAUX POSITIF, jamais
 * de conformité du contenu.
 */

const regles = require('./regles');

const FIXTURES = {
  'demo-jira-issue-DEMO-101.json': require('./demo/demo-jira-issue-DEMO-101.json'),
  'demo-confluence-page-DEMO-202.json': require('./demo/demo-confluence-page-DEMO-202.json'),
  'demo-jsm-requesttype-fields-DEMO-303.json': require('./demo/demo-jsm-requesttype-fields-DEMO-303.json'),
  'demo-jsm-requesttypes-DEMO-304.json': require('./demo/demo-jsm-requesttypes-DEMO-304.json'),
  'demo-jsm-article-DEMO-305.json': require('./demo/demo-jsm-article-DEMO-305.json'),
  'demo-confluence-attachments-DEMO-206.json': require('./demo/demo-confluence-attachments-DEMO-206.json'),
};

const CONTRAT = require('./demo/contrat.json');

/**
 * Lance le moteur sur les 6 fixtures.
 * @returns {Array} la liste des constats (avec le champ `preuve` renseigné
 *                 par le contrat de test quand le constat correspond à une
 *                 faute connue).
 */
function constats() {
  const trouves = [];

  // Chaque constat est rattaché à son FICHIER de démonstration : deux
  // ressources différentes peuvent porter le même chemin JSON (le titre
  // `title` de la page Confluence et celui de l'article JSM, par exemple).
  const rattacher = (liste, fichier) => {
    for (const c of liste) c.fichier = fichier;
    return liste;
  };

  // E1 — description d'issue Jira (ADF)
  const issue = FIXTURES['demo-jira-issue-DEMO-101.json'];
  const champsIssue = issue.fields || {};
  const FICHIER_ISSUE = 'demo-jira-issue-DEMO-101.json';
  trouves.push(
    ...rattacher(
      regles.analyserDocument(
        champsIssue.description,
        'fields.description',
        'E1',
        issue.key || 'DEMO-101'
      ),
      FICHIER_ISSUE
    )
  );
  trouves.push(
    ...rattacher(
      regles.analyserTitre(
        champsIssue.summary,
        'fields.summary',
        'E1',
        issue.key || 'DEMO-101',
        regles._utilitaires.texteDu(champsIssue.description)
      ),
      FICHIER_ISSUE
    )
  );

  // E2 — corps de page Confluence (ADF)
  const page = FIXTURES['demo-confluence-page-DEMO-202.json'];
  const corpsPage = (page.body && page.body.value) || null;
  const FICHIER_PAGE = 'demo-confluence-page-DEMO-202.json';
  trouves.push(
    ...rattacher(
      regles.analyserDocument(corpsPage, 'body.value', 'E2', String(page.id || 'DEMO-202')),
      FICHIER_PAGE
    )
  );
  trouves.push(
    ...rattacher(
      regles.analyserTitre(
        page.title,
        'title',
        'E2',
        String(page.id || 'DEMO-202'),
        regles._utilitaires.texteDu(corpsPage)
      ),
      FICHIER_PAGE
    )
  );

  // E3 — pièces jointes de la page Confluence
  const pieces = FIXTURES['demo-confluence-attachments-DEMO-206.json'];
  trouves.push(
    ...rattacher(
      regles.analyserPieceJointes(
        pieces.results,
        'results',
        'E3',
        String(pieces.results && pieces.results[0] ? pieces.results[0].pageId : 'DEMO-206')
      ),
      'demo-confluence-attachments-DEMO-206.json'
    )
  );

  // E4 — champs du formulaire de demande (JSM)
  const champs = FIXTURES['demo-jsm-requesttype-fields-DEMO-303.json'];
  trouves.push(
    ...rattacher(
      regles.analyserChampsJsm(
        champs.requestTypeFields,
        'requestTypeFields',
        'E4',
        'service desk 12 / type de demande 41'
      ),
      'demo-jsm-requesttype-fields-DEMO-303.json'
    )
  );

  // E5 — types de demande du service desk (JSM)
  const types = FIXTURES['demo-jsm-requesttypes-DEMO-304.json'];
  trouves.push(
    ...rattacher(
      regles.analyserTypesDemande(types.values, 'values', 'E5', 'service desk 12'),
      'demo-jsm-requesttypes-DEMO-304.json'
    )
  );

  // E6 — article de la base de connaissances JSM (titre ; le corps n'est lisible
  // que via la page Confluence qui le porte — c'est déjà fait plus haut)
  const article = FIXTURES['demo-jsm-article-DEMO-305.json'];
  trouves.push(
    ...rattacher(
      regles.analyserTitre(article.title, 'title', 'E6', String(article.id || 'DEMO-305'), null),
      'demo-jsm-article-DEMO-305.json'
    )
  );

  // Annotation : chaque constat reçoit l'identifiant du contrat de test
  // lorsqu'il correspond à une faute connue (chemin + critère).
  for (const constat of trouves) {
    const entree = CONTRAT.demo.find(
      (e) =>
        e.fichier === constat.fichier &&
        e.chemin === constat.emplacement &&
        e.critere === constat.critere
    );
    if (entree) constat.preuve = entree.id;
  }
  return trouves;
}

/**
 * Confronte les constats au contrat de test.
 * @returns {object} le verdict : fautives détectées / manquées, faux positifs.
 */
function verdict() {
  const trouves = constats();

  const fautives = CONTRAT.demo.map((entree) => {
    const correspondants = trouves.filter(
      (c) =>
        c.fichier === entree.fichier &&
        c.emplacement === entree.chemin &&
        c.critere === entree.critere
    );
    return {
      id: entree.id,
      critere: entree.critere,
      chemin: entree.chemin,
      detecte: correspondants.length > 0,
      message: correspondants.length > 0 ? correspondants[0].message : null,
    };
  });

  const fauxPositifs = CONTRAT.sante.map((controle) => {
    // Un faux positif est un constat sur le NŒUD contrôlé (pas seulement sur
    // la feuille citée par le contrat).
    const noeud = controle.noeud;
    const surNoeud = trouves.filter(
      (c) =>
        c.fichier === controle.fichier &&
        (c.emplacement === noeud ||
          c.emplacement.startsWith(noeud + '.') ||
          c.emplacement.startsWith(noeud + '['))
    );
    return {
      id: controle.id,
      chemin: controle.chemin,
      noeud,
      faux_positif: surNoeud.length > 0,
      constats: surNoeud.map((c) => c.critere + ' @ ' + c.emplacement),
    };
  });

  const constatsIds = new Set(trouves.map((c) => c.preuve).filter(Boolean));
  const horsContrat = trouves.filter((c) => !c.preuve);

  const manquees = fautives.filter((f) => !f.detecte);
  const positifs = fauxPositifs.filter((f) => f.faux_positif);

  return {
    fautives_total: fautives.length,
    fautives_detectees: fautives.length - manquees.length,
    fautives_manquees: manquees.map((f) => f.id),
    controles_negatifs_total: fauxPositifs.length,
    faux_positifs: positifs.map((f) => f.id),
    constats_hors_contrat: horsContrat.map((c) => c.critere + ' @ ' + c.emplacement),
    total_constats: trouves.length,
    constats_annotes: constatsIds.size,
    ok:
      manquees.length === 0 &&
      positifs.length === 0 &&
      horsContrat.length === 0 &&
      constatsIds.size === CONTRAT.demo.length,
    fautives,
    controles_negatifs: fauxPositifs,
  };
}

/**
 * Rapport complet du mode démo (le « rapport daté, statut par critère » que
 * l'app sait produire, ici sur des données de démonstration).
 */
function rapport(horodatage) {
  const trouves = constats();
  const v = verdict();
  const rapportCritere = regles.rapportParCritere(trouves);
  return {
    application: 'Portal Accessibility Checker for JSM',
    mode: 'demo',
    generatedAt: horodatage || new Date().toISOString(),
    nature: "Données de DÉMONSTRATION (6 réponses REST figées, écrites par le slot 1 le 04/11/2026) — aucun appel n'est fait sur un site Atlassian, aucun compte, aucun tenant.",
    sources: {
      index_contrat: CONTRAT._source.index,
      md5_index_contrat: CONTRAT._source.md5_index,
      criteres: CONTRAT._source.criteres,
      md5_criteres: CONTRAT._source.md5_criteres,
      fixtures: Object.keys(FIXTURES),
    },
    constats: trouves,
    rapport_par_critere: rapportCritere,
    contrat: v,
    limites: [
      'lecture seule : ce mode n\'écrit rien, il ne lit rien sur un site',
      'contraste, ordre de lecture/focus et libellés visibles ne sont pas vérifiables par l\'API REST : l\'app ne statue pas dessus',
      'un constat est une ALERTE à faire vérifier par un humain, jamais un verdict de conformité',
      'les 6 contrôles négatifs SANTÉ-xx prouvent l\'absence de faux positif sur ces 6 cas, pas sur tout contenu possible',
    ],
  };
}

/** Export CSV des constats du mode démo. */
function csv() {
  return regles.versCsv(constats());
}

module.exports = { FIXTURES, CONTRAT, constats, verdict, rapport, csv };
