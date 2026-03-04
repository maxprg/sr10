const express  = require('express');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const { initDB, all, get, run } = require('./database');

const app    = express();
const PORT   = 3000;
const SECRET = 'sr10_secret_key_change_in_prod';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ error: 'Token invalide ou expiré' }); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
    next();
  };
}

app.post('/api/auth/register', (req, res) => {
  const { email, password, nom, prenom, telephone } = req.body;
  if (!email || !password || !nom || !prenom)
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  if (get('SELECT id FROM users WHERE email = ?', [email]))
    return res.status(400).json({ error: 'Adresse email déjà utilisée' });
  const info = run(
    'INSERT INTO users (email,password,nom,prenom,telephone) VALUES (?,?,?,?,?)',
    [email, bcrypt.hashSync(password, 10), nom, prenom, telephone || null]
  );
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  if (!user.actif)
    return res.status(403).json({ error: 'Compte désactivé' });
  const token = jwt.sign(
    { id: user.id, email: user.email, nom: user.nom, prenom: user.prenom, role: user.role, organisation_id: user.organisation_id },
    SECRET, { expiresIn: '7d' }
  );
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

app.get('/api/offres', (req, res) => {
  const { titre, lieu, metier, salaire } = req.query;
  let sql = `SELECT o.*, org.nom as organisation FROM offres o JOIN organisations org ON o.organisation_id = org.id WHERE o.etat = 'publiee'`;
  const params = [];
  if (titre)   { sql += ' AND (o.titre LIKE ? OR o.description LIKE ?)'; params.push(`%${titre}%`, `%${titre}%`); }
  if (lieu)    { sql += ' AND o.lieu LIKE ?'; params.push(`%${lieu}%`); }
  if (metier)  { sql += ' AND o.type_metier = ?'; params.push(metier); }
  if (salaire) { const [min, max] = salaire.split('-').map(Number); sql += ' AND o.salaire_max >= ? AND o.salaire_min <= ?'; params.push(min, max); }
  sql += ' ORDER BY o.created_at DESC';
  res.json(all(sql, params));
});

app.get('/api/offres/all', requireAuth, requireRole('admin'), (req, res) => {
  res.json(all('SELECT o.*, org.nom as organisation FROM offres o JOIN organisations org ON o.organisation_id = org.id ORDER BY o.created_at DESC'));
});

app.get('/api/offres/mes', requireAuth, requireRole('recruteur', 'admin'), (req, res) => {
  res.json(all('SELECT o.*, org.nom as organisation FROM offres o JOIN organisations org ON o.organisation_id = org.id WHERE o.recruteur_id = ? ORDER BY o.created_at DESC', [req.user.id]));
});

app.post('/api/offres', requireAuth, requireRole('recruteur', 'admin'), (req, res) => {
  const u = req.user;
  if (!u.organisation_id) return res.status(400).json({ error: 'Aucune organisation associée à ce compte' });
  const org = get("SELECT id FROM organisations WHERE id = ? AND statut = 'validee'", [u.organisation_id]);
  if (!org) return res.status(400).json({ error: 'Organisation non validée' });
  const { titre, statut_poste, type_metier, lieu, rythme, salaire_min, salaire_max, description, pieces_demandees, nb_pieces, etat, date_validite } = req.body;
  const info = run(`INSERT INTO offres (titre,organisation_id,statut_poste,type_metier,lieu,rythme,salaire_min,salaire_max,description,pieces_demandees,nb_pieces,etat,date_validite,recruteur_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [titre, u.organisation_id, statut_poste||'Cadre', type_metier, lieu, rythme||null, salaire_min||0, salaire_max||0, description||null, pieces_demandees||null, nb_pieces||1, etat||'non_publiee', date_validite||null, u.id]);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.put('/api/offres/:id', requireAuth, requireRole('recruteur', 'admin'), (req, res) => {
  const offre = get('SELECT * FROM offres WHERE id = ?', [Number(req.params.id)]);
  if (!offre) return res.status(404).json({ error: 'Offre introuvable' });
  if (req.user.role !== 'admin' && offre.recruteur_id !== req.user.id) return res.status(403).json({ error: 'Accès interdit' });
  const { titre, statut_poste, type_metier, lieu, rythme, salaire_min, salaire_max, description, pieces_demandees, nb_pieces, etat, date_validite } = req.body;
  run(`UPDATE offres SET titre=?,statut_poste=?,type_metier=?,lieu=?,rythme=?,salaire_min=?,salaire_max=?,description=?,pieces_demandees=?,nb_pieces=?,etat=?,date_validite=? WHERE id=?`,
    [titre||offre.titre, statut_poste||offre.statut_poste, type_metier||offre.type_metier, lieu||offre.lieu, rythme??offre.rythme, salaire_min??offre.salaire_min, salaire_max??offre.salaire_max, description??offre.description, pieces_demandees??offre.pieces_demandees, nb_pieces??offre.nb_pieces, etat||offre.etat, date_validite??offre.date_validite, offre.id]);
  res.json({ ok: true });
});

app.delete('/api/offres/:id', requireAuth, requireRole('recruteur', 'admin'), (req, res) => {
  const offre = get('SELECT * FROM offres WHERE id = ?', [Number(req.params.id)]);
  if (!offre) return res.status(404).json({ error: 'Offre introuvable' });
  if (req.user.role !== 'admin' && offre.recruteur_id !== req.user.id) return res.status(403).json({ error: 'Accès interdit' });
  run('DELETE FROM offres WHERE id = ?', [offre.id]);
  res.json({ ok: true });
});

app.get('/api/candidatures/mes', requireAuth, (req, res) => {
  res.json(all(`SELECT c.*, o.titre as offre_titre, org.nom as organisation FROM candidatures c JOIN offres o ON c.offre_id = o.id JOIN organisations org ON o.organisation_id = org.id WHERE c.candidat_id = ? ORDER BY c.date DESC`, [req.user.id]));
});

app.get('/api/candidatures/offre/:id', requireAuth, requireRole('recruteur', 'admin'), (req, res) => {
  const offre = get('SELECT * FROM offres WHERE id = ?', [Number(req.params.id)]);
  if (!offre) return res.status(404).json({ error: 'Offre introuvable' });
  if (req.user.role !== 'admin' && offre.recruteur_id !== req.user.id) return res.status(403).json({ error: 'Accès interdit' });
  res.json(all(`SELECT c.*, u.nom, u.prenom, u.email, u.telephone FROM candidatures c JOIN users u ON c.candidat_id = u.id WHERE c.offre_id = ? ORDER BY c.date DESC`, [offre.id]));
});

app.post('/api/candidatures', requireAuth, requireRole('candidat'), (req, res) => {
  const { offre_id } = req.body;
  const offre = get("SELECT * FROM offres WHERE id = ? AND etat = 'publiee'", [Number(offre_id)]);
  if (!offre) return res.status(400).json({ error: 'Offre introuvable ou non publiée' });
  if (get('SELECT id FROM candidatures WHERE offre_id=? AND candidat_id=?', [offre_id, req.user.id]))
    return res.status(400).json({ error: 'Vous avez déjà postulé à cette offre' });
  const info = run('INSERT INTO candidatures (offre_id, candidat_id) VALUES (?,?)', [offre_id, req.user.id]);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.delete('/api/candidatures/:id', requireAuth, (req, res) => {
  const c = get('SELECT * FROM candidatures WHERE id = ?', [Number(req.params.id)]);
  if (!c) return res.status(404).json({ error: 'Candidature introuvable' });
  if (req.user.role !== 'admin' && c.candidat_id !== req.user.id) return res.status(403).json({ error: 'Accès interdit' });
  run('DELETE FROM candidatures WHERE id = ?', [c.id]);
  res.json({ ok: true });
});

app.get('/api/organisations', (req, res) => {
  res.json(all("SELECT * FROM organisations WHERE statut = 'validee'"));
});

app.get('/api/organisations/toutes', requireAuth, requireRole('admin'), (req, res) => {
  res.json(all('SELECT * FROM organisations ORDER BY created_at DESC'));
});

app.post('/api/organisations', requireAuth, (req, res) => {
  const { siren, nom, type, adresse } = req.body;
  if (!siren || !nom || !type || !adresse) return res.status(400).json({ error: 'Champs obligatoires manquants' });
  if (!/^\d{9}$/.test(siren)) return res.status(400).json({ error: 'SIREN invalide (9 chiffres requis)' });
  if (get('SELECT id FROM organisations WHERE siren = ?', [siren])) return res.status(400).json({ error: 'Une organisation avec ce SIREN existe déjà' });
  const info = run('INSERT INTO organisations (siren,nom,type,adresse,demandeur_id) VALUES (?,?,?,?,?)', [siren, nom, type, adresse, req.user.id]);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.put('/api/organisations/:id/statut', requireAuth, requireRole('admin'), (req, res) => {
  const { statut } = req.body;
  if (!['validee','refusee'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
  run('UPDATE organisations SET statut = ? WHERE id = ?', [statut, Number(req.params.id)]);
  if (statut === 'validee') {
    const org = get('SELECT * FROM organisations WHERE id = ?', [Number(req.params.id)]);
    if (org?.demandeur_id) run("UPDATE users SET role='recruteur', organisation_id=? WHERE id=?", [org.id, org.demandeur_id]);
  }
  res.json({ ok: true });
});

app.get('/api/demandes', requireAuth, (req, res) => {
  if (req.user.role === 'admin') {
    res.json(all(`SELECT d.*, u.nom, u.prenom, u.email, org.nom as org_nom FROM demandes_recruteur d JOIN users u ON d.user_id = u.id JOIN organisations org ON d.org_id = org.id ORDER BY d.date DESC`));
  } else {
    res.json(all('SELECT * FROM demandes_recruteur WHERE user_id = ?', [req.user.id]));
  }
});

app.post('/api/demandes', requireAuth, (req, res) => {
  const { org_id, message } = req.body;
  if (get("SELECT id FROM demandes_recruteur WHERE user_id=? AND statut='en_attente'", [req.user.id]))
    return res.status(400).json({ error: 'Vous avez déjà une demande en attente' });
  const info = run('INSERT INTO demandes_recruteur (user_id,org_id,message) VALUES (?,?,?)', [req.user.id, org_id, message || null]);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.delete('/api/demandes/:id', requireAuth, (req, res) => {
  const d = get('SELECT * FROM demandes_recruteur WHERE id=?', [Number(req.params.id)]);
  if (!d) return res.status(404).json({ error: 'Demande introuvable' });
  if (req.user.role !== 'admin' && d.user_id !== req.user.id) return res.status(403).json({ error: 'Accès interdit' });
  run('DELETE FROM demandes_recruteur WHERE id=?', [d.id]);
  res.json({ ok: true });
});

app.put('/api/demandes/:id/statut', requireAuth, requireRole('admin'), (req, res) => {
  const { statut } = req.body;
  if (!['validee','refusee'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
  const d = get('SELECT * FROM demandes_recruteur WHERE id=?', [Number(req.params.id)]);
  if (!d) return res.status(404).json({ error: 'Demande introuvable' });
  run('UPDATE demandes_recruteur SET statut=? WHERE id=?', [statut, d.id]);
  if (statut === 'validee') run("UPDATE users SET role='recruteur', organisation_id=? WHERE id=?", [d.org_id, d.user_id]);
  res.json({ ok: true });
});

app.get('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  const { search } = req.query;
  let sql = 'SELECT id,email,nom,prenom,telephone,role,actif,organisation_id,created_at FROM users WHERE 1=1';
  const params = [];
  if (search) { sql += ' AND (nom LIKE ? OR prenom LIKE ? OR email LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  sql += ' ORDER BY created_at DESC';
  res.json(all(sql, params));
});

app.put('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { role, actif } = req.body;
  const u = get('SELECT * FROM users WHERE id=?', [Number(req.params.id)]);
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (role  !== undefined) run('UPDATE users SET role=? WHERE id=?',  [role, u.id]);
  if (actif !== undefined) run('UPDATE users SET actif=? WHERE id=?', [actif ? 1 : 0, u.id]);
  res.json({ ok: true });
});

app.get('/api/stats', requireAuth, requireRole('admin'), (req, res) => {
  res.json({
    users:         get('SELECT COUNT(*) as n FROM users').n,
    users_actifs:  get('SELECT COUNT(*) as n FROM users WHERE actif=1').n,
    orgs_validees: get("SELECT COUNT(*) as n FROM organisations WHERE statut='validee'").n,
    orgs_attente:  get("SELECT COUNT(*) as n FROM organisations WHERE statut='en_attente'").n,
    offres:        get("SELECT COUNT(*) as n FROM offres WHERE etat='publiee'").n,
    candidatures:  get('SELECT COUNT(*) as n FROM candidatures').n,
  });
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n✅ Serveur SR10 démarré → http://localhost:${PORT}`);
    console.log(`   Comptes de démo :`);
    console.log(`   • admin@recrutepro.fr   / Admin@1234!`);
    console.log(`   • recruteur@techcorp.fr / Recrut@1234!`);
    console.log(`   • candidat@gmail.com    / Cand1dat@5678!\n`);
  });
}).catch(err => { console.error('Erreur init DB:', err); process.exit(1); });
