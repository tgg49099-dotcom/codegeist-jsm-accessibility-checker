/**
 * Contre-épreuve du harnais du CONTRAT DU RESOLVER (test-contrat-http.js).
 *
 * Un harnais qui dit « 59 contrôles PASS » ne prouve rien tant qu'on n'a pas
 * montré qu'il devient ROUGE quand le contrat est cassé. Ce script :
 *   1. rejoue le harnais sur une copie INTACTE de l'app (contrôle : il doit
 *      être vert) ;
 *   2. casse le contrat une fois par sabotage, sur une copie, et exige que le
 *      harnais devienne ROUGE, qu'il nomme le contrôle cassé, et qu'il n'ait
 *      pas simplement CRASHÉ (un crash ne distingue pas « détecté » de
 *      « cassé »).
 *
 * Depuis le 05/11/2026 : deux sabotages supplémentaires portent sur le
 * resolver lui-même — la gâche d'identité et l'appel AU MOTEUR. C'est la
 * preuve que le harnais ne se fabrique pas son propre verdict : un resolver
 * qui répondrait un panneau figé, ou qui accepterait un appel sans compte
 * connecté, est détecté.
 *
 * Usage : node test-contrat-http-contre-epreuve.js
 * RC 0 = les contre-épreuves sont concluantes, RC 1 = au moins une ne l'est pas.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const APP = __dirname;
let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks += 1;
  if (!ok) failures += 1;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ->  ' + detail : ''));
}

/** Copie l'app (sans node_modules, qui est un lien symbolique) dans un dossier temporaire. */
function copierApp(suffixe) {
  const cible = fs.mkdtempSync(path.join(os.tmpdir(), 'pac-contrat-' + suffixe + '-'));
  fs.mkdirSync(path.join(cible, 'src'), { recursive: true });
  fs.mkdirSync(path.join(cible, 'src', 'demo'), { recursive: true });
  fs.cpSync(path.join(APP, 'src', 'index.js'), path.join(cible, 'src', 'index.js'));
  fs.cpSync(path.join(APP, 'src', 'resolvers.js'), path.join(cible, 'src', 'resolvers.js'));
  // Le contrôle d'administrateur, partagé avec les outils MCP.
  fs.cpSync(path.join(APP, 'src', 'droits-admin.js'), path.join(cible, 'src', 'droits-admin.js'));
  fs.cpSync(path.join(APP, 'src', 'demo.js'), path.join(cible, 'src', 'demo.js'));
  fs.cpSync(path.join(APP, 'src', 'regles.js'), path.join(cible, 'src', 'regles.js'));
  fs.cpSync(path.join(APP, 'src', 'demo'), path.join(cible, 'src', 'demo'), { recursive: true });
  fs.cpSync(path.join(APP, 'test-contrat-http.js'), path.join(cible, 'test-contrat-http.js'));
  try {
    fs.symlinkSync(path.join(APP, 'node_modules'), path.join(cible, 'node_modules'), 'dir');
  } catch (e) {
    // sans lien symbolique, le harnais ne pourra pas charger @forge/api ni acorn
  }
  return cible;
}

/** Exécute le harnais dans un dossier et renvoie {code, sortie}. */
function lancerHarnais(dossier) {
  const res = spawnSync(process.execPath, [path.join(dossier, 'test-contrat-http.js')], {
    cwd: dossier,
    encoding: 'utf8',
  });
  return { code: res.status, sortie: (res.stdout || '') + (res.stderr || '') };
}

/**
 * Supprime le dossier temporaire du harnais.
 *
 * SANS CETTE SUPPRESSION, chaque passage de la suite laisse un dossier dans
 * /tmp. Or /tmp est un tmpfs de 256 Mo : apres quelques dizaines de passages
 * (mesuré le 10/11/2026 : 720 dossiers, /tmp a 100 %), la suite CRASHE sur
 * « ENOSPC: no space left on device » — le harnais ne peut plus tourner du
 * tout, et le vert devient un mensonge. Le dossier est donc supprime dans
 * tous les cas, même quand le sabotage n'est pas applicable.
 */
function nettoyer(dossier) {
  try {
    fs.rmSync(dossier, { recursive: true, force: true });
  } catch (e) {
    console.log('WARNING: the temporary folder could not be deleted: ' + e.message);
  }
}

/** Remplace une chaîne unique et vérifie qu'elle n'était présente qu'une fois. */
const sabotage = (texte, avant, apres) => {
  const occurrences = texte.split(avant).length - 1;
  if (occurrences !== 1) {
    throw new Error('non-unique anchor (' + occurrences + ' times): ' + avant);
  }
  return texte.replace(avant, apres);
};

// --- 0. contrôle : le harnais est vert sur une copie intacte -----------------
const copieIntacte = copierApp('intact');
const vert = lancerHarnais(copieIntacte);
nettoyer(copieIntacte);
check(
  'control: the harness is GREEN on an intact copy (RC 0)',
  vert.code === 0 && /ALL PASS/.test(vert.sortie),
  'RC ' + vert.code + ' | ' + vert.sortie.slice(-160).replace(/\n/g, ' ')
);

// --- 1..N : chaque sabotage doit rendre le harnais ROUGE, nommément ----------
const SABOTAGES = [
  {
    nom: 'the mask is removed: the received value comes back in clear text',
    fichier: 'src/index.js',
    avant: "  return s.slice(0, 1) + '***';",
    apres: '  return s;',
    attendu: 'ROUGE-06',
  },
  {
    nom: 'the body scan is disabled: site data carrying the name leaks',
    fichier: 'src/index.js',
    avant: '      s = s.replace(new RegExp(echapperRegExp(r.valeur), \'gi\'), () => r.masque);',
    apres: '      s = s;',
    attendu: 'SCAN-01',
  },
  {
    nom: 'absent fields are invented: the privacy section always announces two',
    fichier: 'src/index.js',
    avant: '  const recus = Object.keys(pvRecus || {});',
    apres: '  const recus = Object.keys(CHAMPS_PV);',
    attendu: 'VERT-02',
  },
  {
    nom: 'the collection is disabled: the page payload is ignored instead of being masked',
    fichier: 'src/index.js',
    avant: '  ajouter(corpsRequete(requete.body));',
    apres: '  // sabotage : le corps de la requête n\'est plus collecté',
    attendu: 'ROUGE-05',
  },
  {
    nom: 'the displayed statement becomes stronger than the code: it claims never to return a name in clear text',
    fichier: 'src/index.js',
    avant:
      'A name or e-mail address that it receives in the request is returned as a mask, never in clear text.',
    apres:
      'A name or e-mail address that it receives in the request is returned as a mask, never in clear text. The app never returns a name or e-mail address in clear text.',
    attendu: 'ROUGE-08b',
  },
  {
    nom: 'the site content is masked: the statement says it is returned as is',
    fichier: 'src/index.js',
    avant: '      id: f.id,\n      name: f.name,',
    apres: "      id: f.id,\n      name: '***',",
    attendu: 'SCAN-09',
  },
  {
    nom: 'the identity gate is removed: a call without a signed-in account is accepted',
    fichier: 'src/resolvers.js',
    avant: '  return principal.accountId || context.accountId || null;',
    apres: "  return 'acc-quelconque';",
    attendu: 'GATE-01',
  },
  {
    nom: 'the resolver no longer calls the engine (frozen panel) in demo mode',
    fichier: 'src/resolvers.js',
    avant: '  const report = moteur.rapportDemo({ pvRecus });',
    apres:
      "  const report = { constats: [], findings: [], privacy: { receivedFields: [], maskedValues: {}, statement: '' } };",
    attendu: 'ROUGE-09',
  },
  {
    nom: 'the resolver no longer calls the engine (frozen panel) in scan mode',
    fichier: 'src/resolvers.js',
    avant: '  const report = await moteur.lancerScan({ pvRecus });',
    apres:
      "  const report = { findings: [], privacy: { receivedFields: [], maskedValues: {}, statement: '' } };",
    attendu: 'SCAN-03',
  },
];

for (const test of SABOTAGES) {
  const dossier = copierApp('sabotage');
  const cheminFichier = path.join(dossier, test.fichier);
  const source = fs.readFileSync(cheminFichier, 'utf8');
  let patched = null;
  let erreur = null;
  try {
    patched = sabotage(source, test.avant, test.apres);
  } catch (e) {
    erreur = e.message;
  }
  if (erreur) {
    check(test.nom + ': sabotage applicable', false, erreur);
    nettoyer(dossier);
    continue;
  }
  fs.writeFileSync(cheminFichier, patched);
  const res = lancerHarnais(dossier);
  nettoyer(dossier);
  const sortie = res.sortie;
  // Le contrôle cassé doit être nommé SUR UNE LIGNE « FAIL » : le simple fait
  // que son étiquette aparaisse quelque part (y compris sur une ligne PASS)
  // ne prouverait rien.
  const mentionne = new RegExp('^FAIL\\s+' + test.attendu + '\\b', 'm').test(sortie);
  const aEchoue = /FAILURE\(S\)/.test(sortie);
  const aCrash = /a levé une exception|Error:|TypeError:|ReferenceError:|SyntaxError:/.test(sortie);
  check(
    test.nom + ': the harness turns RED',
    res.code === 1 && aEchoue,
    'RC ' + res.code
  );
  check(
    test.nom + ': the harness names the broken check (' + test.attendu + ')',
    mentionne,
    mentionne ? '' : sortie.slice(-400)
  );
  check(
    test.nom + ': the harness FAILED, it did not crash',
    !aCrash,
    aCrash ? sortie.slice(-400) : ''
  );
}

console.log('');
if (failures === 0) {
  console.log(
    '== ALL PASS (' + checks + ' checks): the harness turns red when the contract is broken =='
  );
  process.exit(0);
}
console.log('== ' + failures + ' FAILURE(S) on ' + checks + ' checks ==');
process.exit(1);
