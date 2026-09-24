const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Sur Railway, les données doivent être dans le Volume persistant
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

// Fonction utilitaire pour ajouter une colonne si elle n'existe pas
const addColumnIfMissing = (tableName, colName, colType) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
        if (rows && !rows.find(c => c.name === colName)) {
            console.log(`➕ Ajout de la colonne ${colName} à ${tableName}`);
            db.run(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colType}`);
        }
    });
};

// Initialisation des tables
db.serialize(() => {
    // 1. Table des Quizz
    db.run(`CREATE TABLE IF NOT EXISTS Quizz (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titre TEXT NOT NULL,
        date_planifiee DATETIME,
        statut TEXT DEFAULT 'EN_ATTENTE',
        createur TEXT DEFAULT 'Inconnu'
    )`);

    // Ajout de la colonne createur si elle manque (base existante)
    addColumnIfMissing('Quizz', 'createur', "TEXT DEFAULT 'Inconnu'");

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

    addColumnIfMissing('Membre', 'role', "TEXT DEFAULT 'Membre'");
    addColumnIfMissing('Membre', 'message_count', "INTEGER DEFAULT 0");
    addColumnIfMissing('Membre', 'batailles', "INTEGER DEFAULT 0");

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

    // 10. Table Settings (Mots de passe)
    db.run(`CREATE TABLE IF NOT EXISTS Settings (
        cle TEXT PRIMARY KEY,
        valeur TEXT NOT NULL
    )`, () => {
        // Initialiser les mots de passe par défaut si inexistants
        db.run(`INSERT OR IGNORE INTO Settings (cle, valeur) VALUES ('superadmin_password', 'superadmin')`);
        db.run(`INSERT OR IGNORE INTO Settings (cle, valeur) VALUES ('public_password', 'otaku123')`);
        db.run(`INSERT OR IGNORE INTO Settings (cle, valeur) VALUES ('quizz_password', '_mikasa_')`);
        console.log('✅ Table Settings initialisée avec les mots de passe par défaut');
    });
});

module.exports = db;
