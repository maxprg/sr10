/**
 * Base de données SQLite locale via sql.js (pur JavaScript, zéro compilation).
 * Fichier persisté : sr10.db
 */
const initSqlJs = require('sql.js');
const bcrypt    = require('bcryptjs');
const fs        = require('fs');
const path      = require('path');

const DB_FILE = path.join(__dirname, 'sr10.db');
let db;

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT    NOT NULL UNIQUE,
      password     TEXT    NOT NULL,
      nom          TEXT    NOT NULL,
      prenom       TEXT    NOT NULL,
      telephone    TEXT,
      role         TEXT    NOT NULL DEFAULT 'candidat',
      actif        INTEGER NOT NULL DEFAULT 1,
      organisation_id INTEGER,
      created_at   TEXT    NOT NULL DEFAULT (date('now'))
    );
    CREATE TABLE IF NOT EXISTS organisations (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      siren    TEXT    NOT NULL UNIQUE,
      nom      TEXT    NOT NULL,
      type     TEXT    NOT NULL,
      adresse  TEXT    NOT NULL,
      statut   TEXT    NOT NULL DEFAULT 'en_attente',
      demandeur_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (date('now'))
    );
    CREATE TABLE IF NOT EXISTS offres (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      titre            TEXT    NOT NULL,
      organisation_id  INTEGER NOT NULL,
      statut_poste     TEXT    NOT NULL DEFAULT 'Cadre',
      type_metier      TEXT    NOT NULL,
      lieu             TEXT    NOT NULL,
      rythme           TEXT,
      salaire_min      INTEGER NOT NULL DEFAULT 0,
      salaire_max      INTEGER NOT NULL DEFAULT 0,
      description      TEXT,
      pieces_demandees TEXT,
      nb_pieces        INTEGER NOT NULL DEFAULT 1,
      etat             TEXT    NOT NULL DEFAULT 'non_publiee',
      date_validite    TEXT,
      recruteur_id     INTEGER NOT NULL,
      created_at       TEXT    NOT NULL DEFAULT (date('now'))
    );
    CREATE TABLE IF NOT EXISTS candidatures (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      offre_id    INTEGER NOT NULL,
      candidat_id INTEGER NOT NULL,
      statut      TEXT    NOT NULL DEFAULT 'soumise',
      date        TEXT    NOT NULL DEFAULT (date('now')),
      UNIQUE(offre_id, candidat_id)
    );
    CREATE TABLE IF NOT EXISTS demandes_recruteur (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      org_id  INTEGER NOT NULL,
      message TEXT,
      statut  TEXT    NOT NULL DEFAULT 'en_attente',
      date    TEXT    NOT NULL DEFAULT (date('now'))
    );
  `);

  const hasUsers = db.exec("SELECT COUNT(*) as n FROM users")[0]?.values[0][0] > 0;
  if (!hasUsers) {
    const hash = pwd => bcrypt.hashSync(pwd, 10);

    db.run("INSERT INTO organisations VALUES (1,'123456789','TechCorp SAS','SASU','10 rue de la Paix, 75001 Paris','validee',NULL,date('now'))");
    db.run("INSERT INTO organisations VALUES (2,'987654321','InnoStart','Sarl','5 avenue des Startups, 69001 Lyon','en_attente',NULL,date('now'))");

    db.run("INSERT INTO users VALUES (1,?,?,?,?,?,'admin',1,NULL,date('now'))",  ['admin@recrutepro.fr',    hash('Admin@1234!'),    'Martin','Alice','0612345678']);
    db.run("INSERT INTO users VALUES (2,?,?,?,?,?,'recruteur',1,1,date('now'))", ['recruteur@techcorp.fr',  hash('Recrut@1234!'),   'Dupont','Jean','0687654321']);
    db.run("INSERT INTO users VALUES (3,?,?,?,?,?,'candidat',1,NULL,date('now'))",['candidat@gmail.com',    hash('Cand1dat@5678!'), 'Durand','Marie','0698765432']);

    db.run(`INSERT INTO offres VALUES (1,'Développeur Full-Stack',1,'Cadre','Informatique','Paris (75)','35h/semaine, télétravail 2j',45000,60000,'Rejoignez notre équipe tech. Maîtrise de React, Node.js requise.','CV, lettre de motivation, portfolio',3,'publiee','2025-06-30',2,date('now'))`);
    db.run(`INSERT INTO offres VALUES (2,'Analyste Cybersécurité',1,'Cadre','Cybersécurité','Paris (75)','35h/semaine',50000,70000,'Rejoignez notre SOC pour analyser les menaces.','CV, lettre de motivation, diplômes',3,'publiee','2025-05-15',2,date('now'))`);
    db.run(`INSERT INTO offres VALUES (3,'Chef de Projet Digital',1,'ETAM','Informatique','Lyon (69)','39h/semaine',38000,48000,'Pilotez des projets de transformation digitale.','CV, lettre de motivation',2,'non_publiee','2025-07-01',2,date('now'))`);

    save();
    console.log('✅ Base de données initialisée avec les données de démo.');
  }

  return db;
}

function save() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
  const res = db.exec("SELECT last_insert_rowid() as id");
  return { lastInsertRowid: res[0]?.values[0][0] };
}

module.exports = { initDB, all, get, run, save };
