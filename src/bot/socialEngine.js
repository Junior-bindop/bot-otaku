// =============================================================
//  MOTEUR SOCIAL DU BOT
//  Gère toutes les interactions sociales en dehors du quizz
// =============================================================

const path = require('path');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');
const R = require('./responses');

// Regex pour les salutations (commence par un de ces mots)
const GREETINGS_REGEX = /^(salut|hello|bonjour|bonsoir)\b/i;

// Regex pour le doigt d'honneur (toutes variantes avec skin tones)
const MIDDLE_FINGER_REGEX = /\u{1F595}/u;

// Suivi du tag du membre spécial (pour le délai de 5 min)
let specialMemberPendingMsg = null; // { msgId, timer }

// ─────────────────────────────────────────────────────────────
//  HELPER : Envoi d'un sticker en RÉPONSE à un message
// ─────────────────────────────────────────────────────────────
async function sendSticker(client, msg, stickerName) {
    if (!stickerName) return;
    try {
        const stickerPath = path.join(__dirname, '../../stickers', `${stickerName}.webp`);
        if (!fs.existsSync(stickerPath)) {
            console.log(`[STICKER] Fichier absent : ${stickerPath}`);
            return;
        }
        const media = MessageMedia.fromFilePath(stickerPath);
        // Envoyer en tant que réponse au message (méthode forte)
        await client.sendMessage(msg.from, media, { sendMediaAsSticker: true, quotedMessageId: msg.id._serialized });
    } catch (e) {
        console.error(`[STICKER] Erreur envoi "${stickerName}":`, e.message);
    }
}

// ─────────────────────────────────────────────────────────────
//  HANDLER PRINCIPAL : Réactions aux messages du groupe
// ─────────────────────────────────────────────────────────────
async function handleSocialMessage(msg, client, groupId) {
    // Seulement dans le groupe configuré
    if (msg.from !== groupId) return;

    const body = msg.body || '';
    const sender = msg.author || msg.from;
    if (!sender) return;

    // Récupération du pseudo pour les textes simples
    let nom = sender.split('@')[0];
    try {
        const contact = await msg.getContact();
        nom = contact.pushname || contact.name || nom;
    } catch (e) {
        nom = (msg._data && msg._data.notifyName) ? msg._data.notifyName : nom;
    }

    const mentions = msg.mentionedIds || [];
    const botInfo = client.info;
    const botNumber = botInfo ? botInfo.wid._serialized : null;

    // ── Vérifier si le membre spécial répond au message où il a été tagué ──
    const specialNumber = process.env.SPECIAL_MEMBER_NUMBER;
    if (specialMemberPendingMsg && sender === specialNumber && msg.hasQuotedMsg) {
        try {
            const quoted = await msg.getQuotedMessage();
            if (quoted && quoted.id && quoted.id._serialized === specialMemberPendingMsg.msgId) {
                clearTimeout(specialMemberPendingMsg.timer);
                specialMemberPendingMsg = null;
                console.log('[SOCIAL] Membre spécial a répondu, commande annulée.');
                return;
            }
        } catch (e) { /* pas grave */ }
    }

    // ── 1. Bot mentionné (@bot) ──────────────────────────────
    if (botNumber && mentions.includes(botNumber)) {
        await client.sendMessage(msg.from, R.BOT_MENTION(), { quotedMessageId: msg.id._serialized });
        await sendSticker(client, msg, R.BOT_MENTION_STICKER);
        return;
    }

    // ── 2. Sondage ───────────────────────────────────────────
    if (msg.type === 'poll_creation') {
        await client.sendMessage(msg.from, R.POLL(), { quotedMessageId: msg.id._serialized });
        await sendSticker(client, msg, R.POLL_STICKER);
        return;
    }

    // ── 3. Doigt d'honneur 🖕 (toutes variantes) ────────────
    if (MIDDLE_FINGER_REGEX.test(body)) {
        await client.sendMessage(msg.from, R.MIDDLE_FINGER(nom), { quotedMessageId: msg.id._serialized });
        await sendSticker(client, msg, R.MIDDLE_FINGER_STICKER);
        return;
    }

    // ── 4. @tous (nombreuses mentions simultanées) ───────────
    const jidList = (msg._data && msg._data.mentionedJidList) ? msg._data.mentionedJidList : [];
    if (jidList.length >= 5) {
        await client.sendMessage(msg.from, R.GROUP_MENTION(), { quotedMessageId: msg.id._serialized });
        return;
    }

    // ── 5. Membre spécial mentionné (via texte ~Bi𝖓i_𝕵𝖗) ───────────
    if (body.includes('~Bi𝖓i_𝕵𝖗') && specialNumber) {
        const originalMsgId = msg.id._serialized;
        
        const timer = setTimeout(async () => {
            try {
                await client.sendMessage(msg.from, R.SPECIAL_MEMBER_GROUP(), { quotedMessageId: originalMsgId });
                await sendSticker(client, msg, R.SPECIAL_MEMBER_GROUP_STICKER);
                
                try {
                    await client.sendMessage(specialNumber, R.SPECIAL_MEMBER_DM());
                } catch (e) {}
            } catch (e) {}
            specialMemberPendingMsg = null;
        }, 5 * 60 * 1000); // 5 minutes

        if (specialMemberPendingMsg) {
            clearTimeout(specialMemberPendingMsg.timer);
        }

        specialMemberPendingMsg = { msgId: originalMsgId, timer };
        console.log('[SOCIAL] Membre spécial tagué (texte), timer de 5 min lancé.');
        return;
    }

    // ── 6. Salutation (commence par salut/bonjour...) ─────────
    if (GREETINGS_REGEX.test(body.trim())) {
        await client.sendMessage(msg.from, R.GREETING(nom), { quotedMessageId: msg.id._serialized });
        await sendSticker(client, msg, R.GREETING_STICKER);
        return;
    }
}

// ─────────────────────────────────────────────────────────────
//  ARRIVÉE D'UN NOUVEAU MEMBRE
// ─────────────────────────────────────────────────────────────
async function handleGroupJoin(notification, client, groupId) {
    if (notification.chatId !== groupId) return;
    try {
        for (const id of notification.recipientIds) {
            let contact = null;
            let numero = id.split('@')[0];
            
            try {
                contact = await client.getContactById(id);
            } catch (e) { /* fallback */ }

            // Pour faire un vrai TAG WhatsApp, il faut passer l'objet contact dans l'option 'mentions'
            // et utiliser @numero dans le texte
            
            // Message 1 : Bienvenue
            await client.sendMessage(groupId, R.WELCOME(numero), { mentions: contact ? [contact] : [] });
            
            // Sticker
            try {
                const stickerPath = path.join(__dirname, '../../stickers', `${R.WELCOME_STICKER}.webp`);
                if (fs.existsSync(stickerPath)) {
                    const media = MessageMedia.fromFilePath(stickerPath);
                    await client.sendMessage(groupId, media, { sendMediaAsSticker: true });
                }
            } catch (e) {}

            // Message 2 : Fiche Otaku
            await client.sendMessage(groupId, R.WELCOME_FICHE(numero), { mentions: contact ? [contact] : [] });
        }
    } catch (e) {
        console.error('[SOCIAL] Erreur handleGroupJoin:', e.message);
    }
}

// ─────────────────────────────────────────────────────────────
//  DÉPART D'UN MEMBRE
// ─────────────────────────────────────────────────────────────
async function handleGroupLeave(notification, client, groupId) {
    if (notification.chatId !== groupId) return;
    try {
        for (const id of notification.recipientIds) {
            let contact = null;
            let numero = id.split('@')[0];
            try {
                contact = await client.getContactById(id);
            } catch (e) { /* fallback */ }

            await client.sendMessage(groupId, R.GOODBYE(numero), { mentions: contact ? [contact] : [] });
        }
    } catch (e) {
        console.error('[SOCIAL] Erreur handleGroupLeave:', e.message);
    }
}

module.exports = { handleSocialMessage, handleGroupJoin, handleGroupLeave, sendSticker };
