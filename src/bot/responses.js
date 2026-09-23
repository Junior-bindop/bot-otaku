// =============================================================
//  FICHIER DE CONFIGURATION DES MESSAGES ET STICKERS DU BOT
//  Modifie ce fichier pour personnaliser tous les messages !
//  Pour les stickers : place les fichiers .webp dans le dossier
//  /stickers/ à la racine du projet.
// =============================================================

module.exports = {

    // ───────────────────────────────────────────
    //  PENDANT LE QUIZZ
    // ───────────────────────────────────────────

    // Premier à donner une bonne réponse à une question
    QUIZ_FIRST_CORRECT: (nom, points) =>
        `*Bien joué, t'es ultra rapide 😵💫*`,
    QUIZ_FIRST_CORRECT_STICKER: 'quiz_first_correct',

    // Premier à répondre MAIS avec une mauvaise réponse
    QUIZ_FIRST_WRONG: (nom) =>
        `*À force de vouloir courir trop vite, tu as oublié d'attacher tes lacets 🤭*`,
    QUIZ_FIRST_WRONG_STICKER: 'quiz_first_wrong',

    // A donné la bonne réponse après la fin du temps
    QUIZ_CORRECT_TOO_LATE: (nom) =>
        `*Hélas... 🙃, le temps est écoulé ⌛*`,
    QUIZ_CORRECT_TOO_LATE_STICKER: 'quiz_too_late',

    // ───────────────────────────────────────────
    //  ARRIVÉE / DÉPART
    // ───────────────────────────────────────────

    // Nouveau membre dans le groupe (message 1)
    WELCOME: (nom) =>
        `@${nom} Bienvenue dans notre groupe 🤗, tu peux remplir cette fiche ? Histoire de faire connaissance... 👇🏾`,
    WELCOME_STICKER: 'welcome',

    // Nouveau membre dans le groupe (message 2 : fiche otaku)
    WELCOME_FICHE: (nom) =>
        `╭─── 🎌 𝐅𝐈𝐂𝐇𝐄 𝐎𝐓𝐀𝐊𝐔 🎌 ───╮\n👤 Prénom / Surnom :\n🎂 Âge :\n📍 Quartier / Ville :\n🍥 Anime préféré :\n📖 Manga préféré :\n🎮 Jeu préféré :\n❤️ Personnage préféré :\n🔥 Top 3 anime/manga :\n✨ Un truc à savoir sur toi: \n╰─── ⛩️ 𝐘𝐎𝐑𝐎𝐒𝐇𝐈𝐊𝐔 ! ⛩️ ───╯\n@${nom}`,

    // Membre qui quitte le groupe
    GOODBYE: (nom) =>
        `*Adieu @${nom}...*\n*Ton sacrifice ne sera pas vain. "Sasageyo ✊🏾"*`,

    // ───────────────────────────────────────────
    //  INTERACTIONS
    // ───────────────────────────────────────────

    // Quelqu'un mentionne le bot avec @
    BOT_MENTION: () =>
        `*T'inquiète, je vais gérer ça... 🥱 plus... tard... 😴*`,
    BOT_MENTION_STICKER: 'bot_mention',

    // Salutation (salut / hello / bonjour / bonsoir)
    GREETING: (nom) =>
        `*Salut 🤗, moi je vais bien et toi ?*`,
    GREETING_STICKER: 'greeting',

    // Emoji doigt d'honneur 🖕
    MIDDLE_FINGER: (nom) =>
        `*Oh... 😒*\n*C'est pas très gentil ça... 🤧*`,
    MIDDLE_FINGER_STICKER: 'middle_finger',

    // @tous dans un message
    GROUP_MENTION: () =>
        `*Shiori par ci...🙄 shiori par là... 🙄*\n*Débrouillez vous sans moi ...😤*`,

    // Sondage envoyé dans le groupe
    POLL: () =>
        `*Je suis trop canon pour participer à ça...😘*`,
    POLL_STICKER: 'poll',

    // Membre spécial mentionné
    SPECIAL_MEMBER_GROUP: () =>
        `*Il est sûrement occupé tu sais... je lui passerai le message. 🙃*`,
    SPECIAL_MEMBER_GROUP_STICKER: 'special_member',
    SPECIAL_MEMBER_DM: () =>
        `📩 Hey ! Tu viens d'être mentionné dans le groupe OTAKU QUIZZ ! Va jeter un œil 👀`,
};
