const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Sur Railway, les données doivent être dans le Volume persistant
// La variable RAILWAY_VOLUME_MOUNT_PATH est automatiquement définie par Railway
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'data')
    : path.resolve(__dirname, '../../data');

const dbDir = dataDir;
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'quizz.db');
const db = new sqlite3.Database(dbPath);
db.run('PRAGMA foreign_keys = ON;');
db.run('PRAGMA journal_mode = WAL;');

// Initialisation des tables
db.serialize(() => {
    // 1. Table des Quizz
    db.run(`CREATE TABLE IF NOT EXISTS Quizz (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titre TEXT NOT NULL,
        date_planifiee DATETIME,
        statut TEXT DEFAULT 'EN_ATTENTE' 
    )`);

    // 2. Table des Questions
    db.run(`CREATE TABLE IF NOT EXISTS Question (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quizz_id INTEGER,
        texte TEXT NOT NULL,
        temps_imparti INTEGER DEFAULT 30,
        type TEXT DEFAULT 'QRO',
        choix TEXT,
        FOREIGN KEY(quizz_id) REFERENCES Quizz(id) ON DELETE CASCADE
    )`);

    // 3. Table des Réponses valables
    db.run(`CREATE TABLE IF NOT EXISTS ReponseValable (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id INTEGER,
        texte_reponse TEXT NOT NULL,
        FOREIGN KEY(question_id) REFERENCES Question(id) ON DELETE CASCADE
    )`);

    // 4. Table des Scores
    db.run(`CREATE TABLE IF NOT EXISTS Score (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quizz_id INTEGER,
        numero_joueur TEXT,
        nom_joueur TEXT,
        points INTEGER DEFAULT 0,
        FOREIGN KEY(quizz_id) REFERENCES Quizz(id) ON DELETE CASCADE
    )`);
    
    // 5. Table des Membres du Groupe
    db.run(`CREATE TABLE IF NOT EXISTS Membre (
        numero TEXT PRIMARY KEY,
        pseudo TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT 0,
        role TEXT DEFAULT 'Membre',
        message_count INTEGER DEFAULT 0,
        batailles INTEGER DEFAULT 0
    )`);

    // Ajout des colonnes à la table Membre si elles n'existent pas
    const addColumn = (colName, colType) => {
        db.all(`PRAGMA table_info(Membre)`, (err, rows) => {
            if (rows && !rows.find(c => c.name === colName)) {
                db.run(`ALTER TABLE Membre ADD COLUMN ${colName} ${colType}`);
            }
        });
    };
    addColumn('role', "TEXT DEFAULT 'Membre'");
    addColumn('message_count', "INTEGER DEFAULT 0");
    addColumn('batailles', "INTEGER DEFAULT 0");

    // 6. Table Configuration / Logs
    db.run(`CREATE TABLE IF NOT EXISTS Config (
        cle TEXT PRIMARY KEY,
        valeur TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS Log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 7. Table Historique
    db.run(`CREATE TABLE IF NOT EXISTS Historique (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        utilisateur TEXT NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 8. Table Avis
    db.run(`CREATE TABLE IF NOT EXISTS Avis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_joueur TEXT NOT NULL,
        pseudo TEXT NOT NULL,
        message TEXT NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 9. Table StatistiquesMots
    db.run(`CREATE TABLE IF NOT EXISTS StatistiquesMots (
        mot TEXT PRIMARY KEY,
        compte INTEGER DEFAULT 1
    )`);

    // 10. Table Settings (Mot de passe Superadmin)
    db.run(`CREATE TABLE IF NOT EXISTS Settings (
        cle TEXT PRIMARY KEY,
        valeur TEXT NOT NULL
    )`, () => {
        // Initialiser le mot de passe superadmin par défaut si inexistant
        db.run(`INSERT OR IGNORE INTO Settings (cle, valeur) VALUES ('superadmin_password', 'superadmin')`);
    });
});

module.exports = db;
