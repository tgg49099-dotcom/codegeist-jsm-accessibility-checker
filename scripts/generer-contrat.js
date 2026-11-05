/**
 * Génère `src/demo/contrat.json` à partir de `docs/README-demo.md`
 * (l'index des 23 fautives DEMO-xx et des 6 contrôles négatifs SANTÉ-xx écrit
 * par le slot 1 le 04/11/2026).
 *
 * Pourquoi un script et pas un fichier écrit à la main : l'index du slot 1 est
 * un CONTRAT DE TEST. Le recopier à la main, c'est le recopier FAUX. Ici, le
 * contrat est PARSÉ de la source, et le md5 de la source est inscrit dans le
 * contrat : si la source change, le contrat change, et l'on le voit.
 *
 * Usage : node scripts/generer-contrat.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.resolve(__dirname, '..');
const SOURCE = path.join(RACINE, 'docs', 'README-demo.md');
const CIBLE = path.join(RACINE, 'src', 'demo', 'contrat.json');

const md5 = (fichier) =>
  crypto.createHash('md5').update(fs.readFileSync(fichier)).digest('hex');

const texte = fs.readFileSync(SOURCE, 'utf8');
const lignes = texte.split('\n');

/** Extrait le premier fragment entre accent graves d'une cellule. */
const premierFragment = (cellule) => {
  const m = cellule.match(/`([^`]+)`/);
  return m ? m[1].trim() : null;
};

/**
 * Un chemin de contrôle négatif pointe souvent une FEUILLE
 * (`...attrs.alt`) : le nœud à surveiller est le parent, sinon un constat
 * placé sur la feuille passerait inaperçu.
 */
const noeudDe = (chemin) => {
  const morceaux = chemin.split('.');
  const dernier = morceaux[morceaux.length - 1];
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(dernier)) {
    morceaux.pop();
    return morceaux.join('.');
  }
  return chemin;
};

const demo = [];
const sante = [];

for (const ligne of lignes) {
  // | **DEMO-01** | 1.1.1 | `fichier` | `chemin` | ce qui est faux |
  const mDemo = ligne.match(/^\|\s*\*\*(DEMO-\d+)\*\*\s*\|\s*([\d.]+)\s*\|\s*([^|]*)\|\s*([^|]*)\|(.*)$/);
  if (mDemo) {
    const chemin = premierFragment(mDemo[4]);
    if (!chemin) throw new Error('chemin illisible pour ' + mDemo[1]);
    demo.push({
      id: mDemo[1],
      critere: mDemo[2],
      fichier: premierFragment(mDemo[3]),
      chemin,
      ce_qui_est_faux: mDemo[5].trim(),
    });
    continue;
  }
  // | **SANTÉ-01** | `fichier` → `chemin` | pourquoi c'est sain |
  const mSante = ligne.match(/^\|\s*\*\*(SANTÉ-\d+)\*\*\s*\|\s*([^|]*)\|\s*([^|]*)\|/);
  if (mSante) {
    const fragments = mSante[2].match(/`([^`]+)`/g) || [];
    const fichier = fragments[0] ? fragments[0].replace(/`/g, '').trim() : null;
    const chemin = fragments[1] ? fragments[1].replace(/`/g, '').trim() : null;
    if (!fichier || !chemin) throw new Error('contrôle négatif illisible : ' + mSante[1]);
    sante.push({
      id: mSante[1],
      fichier,
      chemin,
      noeud: noeudDe(chemin),
      pourquoi_c_est_sain: mSante[3].trim(),
    });
  }
}

if (demo.length !== 23) throw new Error('index DEMO-xx : ' + demo.length + ' entrées (23 attendues)');
if (sante.length !== 6) throw new Error('contrôles SANTÉ-xx : ' + sante.length + ' (6 attendus)');

const contrat = {
  _source: {
    index: 'docs/README-demo.md',
    md5_index: md5(SOURCE),
    criteres: 'docs/CRITERES-WCAG-2.2-AA.md',
    md5_criteres: '2f82a94d5186e731e799f3337341c252',
    auteur: 'slot 1, 04/11/2026',
    lecture: 'un chemin DEMO-xx est un contrat de test : le contrôleur DOIT produire un constat dessus ; un contrôle SANTÉ-xx ne doit produire AUCUN constat.',
  },
  demo,
  sante,
};

fs.writeFileSync(CIBLE, JSON.stringify(contrat, null, 1) + '\n');
console.log('contrat écrit :', CIBLE);
console.log('  fautives DEMO-xx :', demo.length, '| contrôles négatifs SANTÉ-xx :', sante.length);
console.log('  md5 de docs/README-demo.md :', contrat._source.md5_index);
