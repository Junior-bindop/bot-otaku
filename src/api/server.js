require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('../db/database');
const { startBot, getQR, isBotReady } = require('../bot/bot');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// ── Page QR Code (pour connecter le bot sur Railway) ──────────
app.get('/qr', async (req, res) => {
    if (isBotReady()) {
        return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bot Connecté</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff;text-align:center;}
        .box{background:#1e293b;padding:40px;border-radius:20px;max-width:400px;}
        .icon{font-size:80px;margin-bottom:20px;}
        h1{color:#22c55e;}p{color:#94a3b8;}</style></head>
        <body><div class="box"><div class="icon">✅</div><h1>Bot Connecté !</h1>
        <p>Le bot WhatsApp est actif et connecté à votre groupe. Vous pouvez fermer cette page.</p>
        <p><a href="/" style="color:#ef4444;font-weight:bold;">← Aller au Dashboard</a></p></div></body></html>`);
    }

    const qr = getQR();
    if (!qr) {
        return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>En attente...</title>
        <meta http-equiv="refresh" content="3">
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff;text-align:center;}
        .box{background:#1e293b;padding:40px;border-radius:20px;max-width:400px;}
        .icon{font-size:80px;margin-bottom:20px;}
        h1{color:#f59e0b;}p{color:#94a3b8;}</style></head>
        <body><div class="box"><div class="icon">⏳</div><h1>Démarrage en cours...</h1>
        <p>Le bot démarre. Cette page se rafraîchit automatiquement toutes les 3 secondes. Patientez...</p></div></body></html>`);
    }

    // Générer le QR code en image Base64
    try {
        const QRCode = require('qrcode');
        const qrDataURL = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Scanner le QR Code</title>
        <meta http-equiv="refresh" content="30">
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#fff;text-align:center;}
        .box{background:#1e293b;padding:40px;border-radius:20px;max-width:400px;width:90%;}
        h1{color:#ef4444;margin-bottom:8px;font-size:1.5rem;}
        p{color:#94a3b8;font-size:0.9rem;margin-bottom:20px;}
        img{border-radius:12px;max-width:100%;}
        .note{margin-top:16px;font-size:0.8rem;color:#64748b;}</style></head>
        <body><div class="box">
        <h1>🤖 OtakuQuizz Bot</h1>
        <p>Scannez ce QR code avec WhatsApp pour connecter le bot.</p>
        <img src="${qrDataURL}" alt="QR Code WhatsApp">
        <p class="note">Cette page se rafraîchit automatiquement. Le QR expire en ~60s.</p>
        </div></body></html>`);
    } catch (e) {
        res.status(500).send('Erreur génération QR: ' + e.message);
    }
});

// Configuration des mots de passe par défaut (à faire une seule fois)
db.serialize(() => {
    db.run(`INSERT OR IGNORE INTO Config (cle, valeur) VALUES ('pwd_public', 'otaku123')`);
    db.run(`INSERT OR IGNORE INTO Config (cle, valeur) VALUES ('pwd_admin', 'superadmin')`);
});

// Route d'authentification (Double mot de passe + Pseudo)
app.post('/api/login', (req, res) => {
    const { pseudo, password } = req.body;
    
    db.get(`SELECT valeur FROM Settings WHERE cle = 'superadmin_password'`, [], (err, rowSettings) => {
        if (err) return res.status(500).json({ error: "Erreur serveur" });
        const pwdAdmin = rowSettings ? rowSettings.valeur : 'superadmin';

        db.get(`SELECT valeur FROM Settings WHERE cle = 'public_password'`, [], (err, rowSettings2) => {
            if (err) return res.status(500).json({ error: "Erreur serveur" });
            
            // Si le mot de passe public a été modifié il est dans Settings, sinon fallback sur Config
            if (rowSettings2) {
                finishLogin(rowSettings2.valeur);
            } else {
                db.get(`SELECT valeur FROM Config WHERE cle = 'pwd_public'`, [], (e, r) => {
                    finishLogin(r ? r.valeur : 'otaku123');
                });
            }

            function finishLogin(pwdPublic) {
                // 1. Check SuperAdmin
                if (password === pwdAdmin) {
                    db.run(`INSERT INTO Historique (action, utilisateur) VALUES (?, ?)`, ['Connexion SuperAdmin', pseudo || 'Inconnu']);
                    return res.json({ success: true, role: 'admin', token: 'token-admin-123', pseudo: pseudo || 'SuperAdmin' });
                }

                // 2. Check Public (Créateur)
                if (password === pwdPublic) {
                    db.get(`SELECT * FROM Membre WHERE pseudo = ? COLLATE NOCASE`, [pseudo], (err2, membre) => {
                        if (err2) return res.status(500).json({ error: "Erreur serveur" });
                        if (!membre) return res.status(403).json({ error: "Pseudo non reconnu. Seuls les membres du groupe WhatsApp peuvent se connecter." });
                        db.run(`INSERT INTO Historique (action, utilisateur) VALUES (?, ?)`, ['Connexion Créateur', membre.pseudo]);
                        return res.json({ success: true, role: 'public', token: 'token-public-123', pseudo: membre.pseudo, numero: membre.numero });
                    });
                } else {
                    return res.status(401).json({ error: "Mot de passe incorrect" });
                }
            }
        });
    });
});

// GET : Récupérer tous les quizz
app.get('/api/quizz', (req, res) => {
    db.all('SELECT * FROM Quizz ORDER BY date_planifiee DESC', [], (err, quizz) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(quizz);
    });
});

// POST : Créer un nouveau quizz avec ses questions et réponses
app.post('/api/quizz', (req, res) => {
    const { titre, date_planifiee, questions, createur, password_creation } = req.body;
    if (!titre || !date_planifiee || !questions?.length || !password_creation) {
        return res.status(400).json({ error: "Données incomplètes ou mot de passe manquant" });
    }

    // Vérifier le mot de passe spécial de création de quizz
    db.get(`SELECT valeur FROM Settings WHERE cle = 'quizz_password'`, [], (err, rowSettings) => {
        if (err) return res.status(500).json({ error: "Erreur serveur" });
        const pwdCreation = rowSettings ? rowSettings.valeur : '_mikasa_';

        if (password_creation !== pwdCreation) {
            return res.status(401).json({ error: "Mot de passe de programmation invalide" });
        }

        db.run(`INSERT INTO Quizz (titre, date_planifiee, statut, createur) VALUES (?, ?, 'EN_ATTENTE', ?)`,
            [titre, date_planifiee, createur || 'Inconnu'],
            function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const quizzId = this.lastID;

            const insertPromises = questions.map((q) => new Promise((resolve, reject) => {
                const choixStr = q.type === 'QCM' && q.choix ? JSON.stringify(q.choix) : null;
                db.run(`INSERT INTO Question (quizz_id, texte, temps_imparti, type, choix) VALUES (?, ?, ?, ?, ?)`,
                    [quizzId, q.texte, q.temps_imparti || 30, q.type || 'QRO', choixStr],
                    function(err) {
                        if (err) return reject(err);
                        const questionId = this.lastID;
                        const reponses = q.reponses || [];
                        if (reponses.length === 0) return resolve();

                        let done = 0;
                        reponses.forEach(rep => {
                            db.run(`INSERT INTO ReponseValable (question_id, texte_reponse) VALUES (?, ?)`,
                                [questionId, rep.toLowerCase().trim()],
                                (err) => {
                                    if (err) return reject(err);
                                    if (++done === reponses.length) resolve();
                                }
                            );
                        });
                    }
                );
            }));

            Promise.all(insertPromises)
                .then(() => {
                    db.run(`INSERT INTO Historique (action, utilisateur) VALUES (?, ?)`, [`Création du quizz: ${titre}`, createur || 'Inconnu']);
                    const { client } = require('../bot/bot');
                    const groupId = process.env.GROUP_ID;
                    if (groupId && client) {
                        const dateObj = new Date(date_planifiee);
                        const dateStr = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        client.sendMessage(groupId, `📢 *Nouveau Quizz Planifié !*\n\n🏆 *${titre}*\n📅 ${dateStr}\n❓ ${questions.length} question(s)\n\nSoyez prêts ! ⚔️`).catch(console.error);
                    }
                    res.json({ success: true, id: quizzId });
                })
                .catch(err => res.status(500).json({ error: err.message }));
        }
    );
    });
});

// DELETE : Supprimer un quizz en cascade
app.delete('/api/quizz/:id', (req, res) => {
    const { id } = req.params;
    const { pseudo } = req.body;
    console.log(`Tentative de suppression du quizz ID: ${id}`);
    
    // Récupérer le titre du quizz avant suppression pour l'historique
    db.get('SELECT titre FROM Quizz WHERE id = ?', [id], (err, row) => {
        const titre = row ? row.titre : id;
        
        db.run('DELETE FROM Quizz WHERE id = ?', [id], function(err) {
            if (err) {
                console.error(`Erreur lors de la suppression du quizz ${id}:`, err.message);
                return res.status(500).json({ error: err.message });
            }
            console.log(`Quizz ${id} supprimé avec succès.`);
            db.run(`INSERT INTO Historique (action, utilisateur) VALUES (?, ?)`, [`Suppression du quizz: ${titre}`, pseudo || 'SuperAdmin']);
            res.json({ success: true });
        });
    });
});

// GET : Récupérer tous les membres
app.get('/api/membres', (req, res) => {
    db.all('SELECT * FROM Membre', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET : Classement global (cumul de tous les quizz)
app.get('/api/classement', (req, res) => {
    db.all(
        `SELECT Score.nom_joueur, SUM(Score.points) as points, Membre.batailles 
         FROM Score 
         LEFT JOIN Membre ON Score.numero_joueur = Membre.numero
         GROUP BY Score.numero_joueur 
         ORDER BY points DESC LIMIT 20`,
        [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// GET : Classement d'un quizz spécifique
app.get('/api/classement/:quizzId', (req, res) => {
    db.all(
        `SELECT nom_joueur, SUM(points) as points FROM Score WHERE quizz_id = ? GROUP BY numero_joueur ORDER BY points DESC`,
        [req.params.quizzId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// GET : Historique pour le SuperAdmin
app.get('/api/historique', (req, res) => {
    db.all('SELECT * FROM Historique ORDER BY date DESC LIMIT 100', [], (err, logs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(logs);
    });
});

// GET : Avis pour le SuperAdmin
app.get('/api/avis', (req, res) => {
    db.all('SELECT * FROM Avis ORDER BY date DESC', [], (err, avis) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(avis);
    });
});

// POST : Créer un avis
app.post('/api/avis', (req, res) => {
    const { numero, pseudo, message } = req.body;
    if (!numero || !message) return res.status(400).json({ error: "Données incomplètes" });

    // Vérifier la limite de 3 avis par semaine
    db.get(`SELECT COUNT(*) as count FROM Avis WHERE numero_joueur = ? AND date >= datetime('now', '-7 days')`, [numero], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row && row.count >= 3) {
            return res.status(429).json({ error: "Vous avez atteint la limite de 3 recommandations par semaine." });
        }
        db.run(`INSERT INTO Avis (numero_joueur, pseudo, message) VALUES (?, ?, ?)`, [numero, pseudo, message], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
    });
});

// GET : Top 10 des mots
app.get('/api/stats/mots', (req, res) => {
    db.all('SELECT * FROM StatistiquesMots ORDER BY compte DESC LIMIT 10', [], (err, mots) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(mots);
    });
});

// POST : Changer le mot de passe PUBLIC (créateurs)
app.post('/api/config/password', (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: "Mot de passe trop court (min 4 caractères)" });
    
    db.run(`INSERT INTO Settings (cle, valeur) VALUES ('public_password', ?) ON CONFLICT(cle) DO UPDATE SET valeur=excluded.valeur`, [password], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`INSERT INTO Historique (action, utilisateur) VALUES (?, ?)`, ['Changement de mot de passe public', 'SuperAdmin']);
        res.json({ success: true });
    });
});

// PUT : Changer le mot de passe Spécial Création de Quizz (_mikasa_)
app.put('/api/superadmin/quizz_password', (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Mot de passe manquant" });
    
    db.run(`INSERT INTO Settings (cle, valeur) VALUES ('quizz_password', ?) ON CONFLICT(cle) DO UPDATE SET valeur=excluded.valeur`, [password], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`INSERT INTO Historique (action, utilisateur) VALUES (?, ?)`, ['Changement de mot de passe Création Quizz', 'SuperAdmin']);
        res.json({ success: true });
    });
});

// PUT : Changer le mot de passe SuperAdmin
app.put('/api/superadmin/password', (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: "Mot de passe trop court" });
    
    db.run(`INSERT INTO Settings (cle, valeur) VALUES ('superadmin_password', ?) ON CONFLICT(cle) DO UPDATE SET valeur=excluded.valeur`, [password], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run(`INSERT INTO Historique (action, utilisateur) VALUES (?, ?)`, ['Changement de mot de passe SuperAdmin', 'SuperAdmin']);
        
        // Envoi du DM au VIP
        const { client } = require('../bot/bot');
        const specialNumber = process.env.SPECIAL_MEMBER_NUMBER;
        if (client && specialNumber) {
            client.sendMessage(specialNumber, `🔐 *Le mot de passe SuperAdmin a été modifié.*\n\nNouveau mot de passe : ${password}`).catch(console.error);
        }
        
        res.json({ success: true });
    });
});

// Lancement du serveur Web + Bot + Moteur de Quizz
const { startEngine } = require('../bot/quizzEngine');
const { client } = require('../bot/bot');

app.listen(PORT, () => {
    console.log(`Le serveur Web est en écoute sur http://localhost:${PORT}`);
    startBot();
});

client.on('ready', () => {
    const groupId = process.env.GROUP_ID;
    if (groupId) {
        startEngine(client, groupId);
    } else {
        console.log('⚠️  GROUP_ID non configuré. Créez un fichier .env avec GROUP_ID=XXXXXXXX@g.us');
    }
});
