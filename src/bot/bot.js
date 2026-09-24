const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const db = require('../db/database.js');
const fs = require('fs');
const path = require('path');
const { handleSocialMessage, handleGroupJoin, handleGroupLeave } = require('./socialEngine');

// ── Stockage du QR code en mémoire pour l'afficher via /qr ──
let currentQR = null;
let botReady = false;

// ── Configuration Puppeteer (Windows local ou Linux/Railway) ──
const isLinux = process.platform === 'linux';

const puppeteerConfig = {
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-extensions'
    ]
};

// Sur Windows local : utiliser Chrome ou Edge installé
if (!isLinux) {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    if (fs.existsSync(chromePath)) puppeteerConfig.executablePath = chromePath;
    else if (fs.existsSync(edgePath)) puppeteerConfig.executablePath = edgePath;
}

// Sur Linux (Railway) : utiliser Google Chrome installé via le Dockerfile
if (isLinux) {
    const cheminsPossibles = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/opt/google/chrome/chrome'
    ].filter(Boolean);

    let chromeTrouve = null;
    for (const chemin of cheminsPossibles) {
        if (fs.existsSync(chemin)) {
            chromeTrouve = chemin;
            break;
        }
    }

    if (chromeTrouve) {
        puppeteerConfig.executablePath = chromeTrouve;
        console.log(`✅ Chrome trouvé : ${chromeTrouve}`);
    } else {
        console.error('❌ Aucun Chrome trouvé ! Chemins testés :', cheminsPossibles);
    }
}

// ── Chemin de session WhatsApp (persistant sur Railway via Volume) ──
const authDataPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, '.wwebjs_auth')
    : path.join(__dirname, '../../.wwebjs_auth');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authDataPath }),
    puppeteer: puppeteerConfig
});

client.on('qr', (qr) => {
    console.log('QR Code généré. Visitez /qr sur votre serveur pour le scanner.');
    currentQR = qr;
    botReady = false;
    if (!isLinux) qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Bot WhatsApp Otaku est prêt et connecté !');
    currentQR = null;
    botReady = true;
});

// ── Écoute des messages ──────────────────────────────────────
client.on('message', async msg => {
    const groupId = process.env.GROUP_ID;

    // --- DÉTECTEUR D'ID DE GROUPE ---
    if (msg.from.endsWith('@g.us')) {
        const path = require('path');
        const envPath = path.join(__dirname, '../../.env');
        
        console.log(`\n📱 Message reçu d'un groupe !`);
        console.log(`🔑 GROUP_ID détecté : ${msg.from}`);
        
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        if (!envContent.includes(msg.from)) {
            if (envContent.includes('GROUP_ID=')) {
                envContent = envContent.replace(/GROUP_ID=.*/, `GROUP_ID=${msg.from}`);
            } else {
                envContent += `\nGROUP_ID=${msg.from}\n`;
            }
            fs.writeFileSync(envPath, envContent);
            console.log(`✅ SUCCÈS : L'ID a été AUTOMATIQUEMENT enregistré dans le fichier .env !`);
            console.log(`⚠️  Appuyez sur Ctrl+C puis tapez "npm start" pour redémarrer le serveur.\n`);
            msg.reply('🤖 *Bot Otaku* : Je suis maintenant connecté à ce groupe ! Redémarrez le serveur pour lancer les quizz.');
        }
    }

    // --- ENREGISTREMENT AUTOMATIQUE DES MEMBRES ET STATS ---
    if (msg.from === groupId && msg.author) {
        let nom = msg.author.split('@')[0];
        try {
            const contact = await msg.getContact();
            nom = contact.pushname || contact.name || nom;
        } catch (e) {
            nom = (msg._data && msg._data.notifyName) ? msg._data.notifyName : nom;
        }
        
        const rolePredefini = msg.author.includes('237620793844') ? 'Admin' : 'Membre';
        
        db.run(`INSERT INTO Membre (numero, pseudo, message_count, role) VALUES (?, ?, 1, ?) 
                ON CONFLICT(numero) DO UPDATE SET pseudo=excluded.pseudo, message_count=message_count + 1`, 
                [msg.author, nom, rolePredefini]);

        if (msg.body) {
            const stopWords = new Set([
                'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'en', 'a', 'à', 'pour', 'qui', 'que', 
                'quoi', 'dont', 'où', 'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'se', 'me', 
                'te', 'ce', 'c', 'est', 'pas', 'dans', 'sur', 'au', 'aux', 'avec', 'ou', 'ne', 'ça', 'ca', 'mon', 
                'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'si', 'oui', 'non', 'mais', 'ou', 'donc', 'or', 'ni', 'car',
                'bien', 'très', 'trop', 'plus', 'moins', 'tout', 'tous', 'fait', 'faire', 'être', 'avoir', 'suis', 'es', 'est',
                'sommes', 'êtes', 'sont', 'ai', 'as', 'a', 'avons', 'avez', 'ont', 'qu', 'n', 's', 'm', 't', 'l', 'd', 'j', 'y'
            ]);
            
            const mots = msg.body.toLowerCase().replace(/[^\w\sàâäéèêëîïôöùûüç]/g, ' ').split(/\s+/);
            const motsFiltres = mots.filter(w => w.length > 2 && !stopWords.has(w));
            
            motsFiltres.forEach(mot => {
                db.run(`INSERT INTO StatistiquesMots (mot, compte) VALUES (?, 1) ON CONFLICT(mot) DO UPDATE SET compte = compte + 1`, [mot]);
            });
        }
    }

    // --- MOTEUR SOCIAL ---
    if (groupId) {
        try { await handleSocialMessage(msg, client, groupId); } catch (e) { console.error('[SOCIAL] Erreur:', e.message); }
    }

    if (msg.body === '!ping') {
        msg.reply('pong 🏓');
    }

    if (msg.body && msg.body.startsWith('!sticker ') && msg.hasQuotedMsg) {
        const stickerName = msg.body.replace('!sticker ', '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
        if (!stickerName) { msg.reply('❌ Précise un nom. Ex: `!sticker welcome`'); return; }
        
        try {
            const quoted = await msg.getQuotedMessage();
            if (quoted.type !== 'sticker') { msg.reply('❌ Le message cité n\'est pas un sticker !'); return; }
            
            const media = await quoted.downloadMedia();
            if (!media) { msg.reply('❌ Impossible de télécharger le sticker.'); return; }
            
            const path = require('path');
            const stickerPath = path.join(__dirname, '../../stickers', `${stickerName}.webp`);
            const buf = Buffer.from(media.data, 'base64');
            fs.writeFileSync(stickerPath, buf);
            
            msg.reply(`✅ Sticker *${stickerName}* sauvegardé avec succès dans /stickers/ !\n\nTu peux maintenant l'utiliser dans responses.js.`);
            console.log(`[STICKER] Sauvegardé: ${stickerPath}`);
        } catch (e) {
            console.error('[STICKER] Erreur sauvegarde:', e.message);
            msg.reply('❌ Erreur lors de la sauvegarde du sticker.');
        }
    }
});

client.on('group_join', async (notification) => {
    const groupId = process.env.GROUP_ID;
    if (!groupId) return;
    try { await handleGroupJoin(notification, client, groupId); } catch (e) { console.error('[JOIN] Erreur:', e.message); }
});

client.on('group_leave', async (notification) => {
    const groupId = process.env.GROUP_ID;
    if (!groupId) return;
    try { await handleGroupLeave(notification, client, groupId); } catch (e) { console.error('[LEAVE] Erreur:', e.message); }
});

client.on('group_admin_changed', async (notification) => {
    try {
        const type = notification.type;
        const affectedIds = notification.recipientIds;
        const specialNumber = process.env.SPECIAL_MEMBER_NUMBER;

        for (const id of affectedIds) {
            if (id === specialNumber) {
                db.run(`UPDATE Membre SET role = 'Katika' WHERE numero = ?`, [id]);
                continue;
            }

            const newRole = (type === 'promote') ? 'Admin' : 'Membre';
            db.run(`UPDATE Membre SET role = ? WHERE numero = ?`, [newRole, id]);
        }
    } catch (e) {
        console.error('[ADMIN_CHANGE] Erreur:', e.message);
    }
});

const startBot = () => {
    console.log('Démarrage du bot WhatsApp...');
    client.initialize();
    
    try {
        const cron = require('node-cron');
        cron.schedule('0 20 * * 0', async () => {
            const groupId = process.env.GROUP_ID;
            if (!groupId) return;

            db.get(`SELECT pseudo, message_count FROM Membre ORDER BY message_count DESC LIMIT 1`, [], (err, row) => {
                if (err || !row || row.message_count === 0) return;

                const msg = `🏆 *MEMBRE DE LA SEMAINE* 🏆\n\nFélicitations à *${row.pseudo}* qui a été le membre le plus actif cette semaine avec *${row.message_count}* messages envoyés ! 🎉🔥\n\n_Les compteurs d'importance ont été remis à zéro._`;
                
                client.sendMessage(groupId, msg).catch(console.error);
                db.run(`UPDATE Membre SET message_count = 0`);
            });
        }, {
            timezone: "Africa/Douala"
        });
        console.log('Tâche cron pour le membre de la semaine activée (Dimanche 20:00).');
    } catch (err) {
        console.log('node-cron n\'est pas installé, la tâche cron ne démarrera pas.');
    }
};

async function syncGroupMembers(client, groupId) {
    try {
        console.log("🔄 Récupération des membres du groupe WhatsApp...");
        const chats = await client.getChats();
        const chat = chats.find(c => c.id._serialized === groupId);
        
        if (!chat || !chat.isGroup) {
            console.log("⚠️ Impossible de trouver le groupe dans le cache WhatsApp.");
            return;
        }

        console.log(`-> Groupe trouvé (${chat.name || 'Sans Nom'}). Nb participants : ${chat.participants.length}`);

        const db = require('../db/database');
        let count = 0;
        
        for (let participant of chat.participants) {
            const numero = participant.id.user;
            let pseudo = numero;

            try {
                const contact = await client.getContactById(participant.id._serialized);
                pseudo = contact.pushname || contact.name || numero;
            } catch (err) {}

            db.run(`INSERT INTO Membre (numero, pseudo) VALUES (?, ?)
                    ON CONFLICT(numero) DO UPDATE SET pseudo=excluded.pseudo`, 
                    [numero, pseudo], () => { count++; });
        }
        setTimeout(() => console.log(`✅ ${count} Membres du groupe synchronisés !`), 2000);
    } catch (e) {
        console.error("⚠️ Erreur lors de la synchronisation des membres:", e.message);
    }
}

module.exports = {
    client,
    startBot,
    syncGroupMembers,
    getQR: () => currentQR,
    isBotReady: () => botReady
};
