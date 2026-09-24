const db = require('../db/database');
const R = require('./responses');
const { sendSticker } = require('./socialEngine');

// État global du quizz en cours
let activeQuizz = null;
let currentQuestion = null;
let answeredUsers = new Map();
let correctAnswerCount = 0;
let messageListener = null;
let firstCorrectDone = false;
let firstWrongDone = false;
let graceQuestion = null;
let participantsQuizz = new Set();

// Points selon l'ordre de réponse
const POINTS_MAP = [5, 4, 3, 2, 1];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Formater un classement général
function buildFinalRanking(scores, titre) {
    const medals = ['🥇', '🥈', '🥉'];
    let msg = `🏆 *CLASSEMENT FINAL - ${titre}*\n\n`;
    scores.forEach((s, i) => {
        const medal = medals[i] || `${i + 1}.`;
        msg += `${medal} *${s.nom_joueur}* : ${s.points} point${s.points > 1 ? 's' : ''}\n`;
    });
    return msg;
}

// Formater un classement par question
function buildQuestionRanking(results, questionIdx) {
    let msg = `📊 *Résultats - Question ${questionIdx}*\n\n`;
    results.forEach(r => {
        if (r.correct) {
            msg += `✅ *${r.nom}* : +${r.points}pt${r.points > 1 ? 's' : ''} (${r.order}${r.order === 1 ? 'er' : 'ème'})\n`;
        } else {
            msg += `❌ *${r.nom}* : 0pt\n`;
        }
    });
    return msg;
}

// Lancer une question
async function runQuestion(question, questionIdx, totalQuestions, client, groupId) {
    answeredUsers = new Map();
    correctAnswerCount = 0;
    currentQuestion = question;
    firstCorrectDone = false;
    firstWrongDone = false;
    graceQuestion = null;

    const reponses = await new Promise((resolve, reject) => {
        db.all('SELECT texte_reponse FROM ReponseValable WHERE question_id = ?', [question.id], (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(r => r.texte_reponse.toLowerCase().trim()));
        });
    });

    currentQuestion.reponsesValables = reponses;

    let msgQuestion = `❓ *Question ${questionIdx}/${totalQuestions}*\n\n${question.texte}\n\n`;
    if (question.type === 'QCM' && question.choix) {
        const choix = JSON.parse(question.choix || '[]');
        const lettres = ['A', 'B', 'C', 'D'];
        choix.forEach((c, i) => {
            msgQuestion += `${lettres[i]}. ${c}\n`;
        });
    }
    msgQuestion += `\n⏱ *${question.temps_imparti} secondes !*`;

    await client.sendMessage(groupId, msgQuestion);

    await sleep(question.temps_imparti * 1000);

    graceQuestion = { reponsesValables: reponses, type: question.type, choix: question.choix };
    currentQuestion = null;
    await sleep(3000);
    graceQuestion = null;

    await client.sendMessage(groupId, `⛔ *Terminé !*\n\n✅ La bonne réponse était : *${reponses[0]}*`);

    const results = [...answeredUsers.values()].sort((a, b) => a.order - b.order);
    const correctResults = results.filter(r => r.correct && r.points > 0);

    if (correctResults.length > 0) {
        let msgClassement = `📊 *Résultats de la question :*\n\n`;
        correctResults.forEach((r, idx) => {
            msgClassement += `${idx + 1}. ${r.nom} (+${r.points} pts)\n`;
        });
        await client.sendMessage(groupId, msgClassement);
    } else {
        await client.sendMessage(groupId, `📊 *Résultats de la question :*\n\nEverybody : 0 point 😭`);
    }
}

// Gérer les réponses entrantes
function handleMessage(client, groupId, quizzId) {
    messageListener = async (msg) => {
        if (msg.from !== groupId) return;

        const senderId = msg.author || msg.from;
        if (!senderId) return;

        if (!msg.body) return;
        const texteReponse = msg.body.trim().toLowerCase();
        if (!texteReponse) return;

        if (!currentQuestion && graceQuestion && !answeredUsers.has(senderId)) {
            const repG = graceQuestion.reponsesValables || [];
            const lettres = ['a', 'b', 'c', 'd'];
            let lateCorrect = repG.some(r => texteReponse === r);
            if (!lateCorrect && graceQuestion.type === 'QCM' && graceQuestion.choix) {
                const choix = JSON.parse(graceQuestion.choix || '[]');
                const li = lettres.indexOf(texteReponse);
                if (li !== -1 && choix[li]) lateCorrect = repG.some(r => choix[li].toLowerCase().trim() === r);
            }
            if (lateCorrect) {
                let nom = senderId.split('@')[0];
                try { const c = await msg.getContact(); nom = c.pushname || c.name || nom; } catch (e) {}
                await client.sendMessage(msg.from, R.QUIZ_CORRECT_TOO_LATE(nom), { quotedMessageId: msg.id._serialized });
                await sendSticker(client, msg, R.QUIZ_CORRECT_TOO_LATE_STICKER);
            }
            return;
        }

        if (!currentQuestion) return;

        if (answeredUsers.has(senderId)) return;

        let nom = senderId.split('@')[0];
        try {
            const contact = await msg.getContact();
            nom = contact.pushname || contact.name || nom;
        } catch (e) {
            nom = (msg._data && msg._data.notifyName) ? msg._data.notifyName : nom;
        }

        db.run(`INSERT INTO Membre (numero, pseudo) VALUES (?, ?) ON CONFLICT(numero) DO UPDATE SET pseudo=excluded.pseudo`, [senderId, nom]);

        if (!participantsQuizz.has(senderId)) {
            participantsQuizz.add(senderId);
            db.run(`UPDATE Membre SET batailles = batailles + 1 WHERE numero = ?`, [senderId]);
        }

        const reponsesValables = currentQuestion.reponsesValables || [];
        const lettres = ['a', 'b', 'c', 'd'];

        let isCorrect = reponsesValables.some(rep => texteReponse === rep);

        if (!isCorrect && currentQuestion.type === 'QCM' && currentQuestion.choix) {
            const choix = JSON.parse(currentQuestion.choix || '[]');
            const letterIndex = lettres.indexOf(texteReponse);
            if (letterIndex !== -1 && choix[letterIndex]) {
                isCorrect = reponsesValables.some(rep => choix[letterIndex].toLowerCase().trim() === rep);
            }
        }

        let points = 0;
        let order = null;

        if (isCorrect) {
            order = correctAnswerCount + 1;
            points = POINTS_MAP[correctAnswerCount] || 0;
            correctAnswerCount++;

            if (!firstCorrectDone) {
                firstCorrectDone = true;
                await client.sendMessage(msg.from, R.QUIZ_FIRST_CORRECT(nom, points), { quotedMessageId: msg.id._serialized });
                await sendSticker(client, msg, R.QUIZ_FIRST_CORRECT_STICKER);
            }

            db.get(`SELECT id FROM Score WHERE quizz_id = ? AND numero_joueur = ?`, [quizzId, senderId], (err, row) => {
                if (row) {
                    db.run(`UPDATE Score SET points = points + ? WHERE id = ?`, [points, row.id]);
                } else {
                    db.run(`INSERT INTO Score (quizz_id, numero_joueur, nom_joueur, points) VALUES (?, ?, ?, ?)`, [quizzId, senderId, nom, points]);
                }
            });
        } else {
            if (!firstWrongDone && !firstCorrectDone) {
                firstWrongDone = true;
                await client.sendMessage(msg.from, R.QUIZ_FIRST_WRONG(nom), { quotedMessageId: msg.id._serialized });
                await sendSticker(client, msg, R.QUIZ_FIRST_WRONG_STICKER);
            }
        }

        answeredUsers.set(senderId, { nom, correct: isCorrect, points, order });
    };

    client.on('message', messageListener);
}

// Lancer un quizz complet
async function runQuizz(quizz, client, groupId) {
    activeQuizz = quizz;
    participantsQuizz.clear();

    db.run(`UPDATE Quizz SET statut = 'EN_COURS' WHERE id = ?`, [quizz.id]);

    await client.sendMessage(groupId,
        `🔥 *LE QUIZZ COMMENCE !*\n\n🏆 *${quizz.titre}*\n\nPréparez-vous à répondre ! Le premier à donner la bonne réponse gagne 5 points ! ⚔️`
    );
    await sleep(3000);

    const questions = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM Question WHERE quizz_id = ? ORDER BY id ASC', [quizz.id], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });

    handleMessage(client, groupId, quizz.id);

    for (let i = 0; i < questions.length; i++) {
        await client.sendMessage(groupId, `⏳ *Tenez-vous prêts, je balance dans 10 secondes !*`);
        await sleep(10000);

        await runQuestion(questions[i], i + 1, questions.length, client, groupId);

        if (i < questions.length - 1) {
            await sleep(30000);
        }
    }

    if (messageListener) {
        client.removeListener('message', messageListener);
        messageListener = null;
    }

    await sleep(60000);
    
    const scores = await new Promise((resolve, reject) => {
        db.all(
            `SELECT nom_joueur, SUM(points) as points FROM Score WHERE quizz_id = ? GROUP BY numero_joueur ORDER BY points DESC`,
            [quizz.id],
            (err, rows) => { if (err) return reject(err); resolve(rows); }
        );
    });

    if (scores.length > 0) {
        let msgFinal = `🏆 *CLASSEMENT GÉNÉRAL DU QUIZZ* 🏆\n\n`;
        scores.forEach((s, idx) => {
            const medaille = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎗️';
            msgFinal += `${medaille} ${s.nom_joueur} : *${s.points} pts*\n`;
        });
        await client.sendMessage(groupId, msgFinal);
    } else {
        await client.sendMessage(groupId, `🤡 *Fin du quizz !*\n\nIncroyable... absolument personne n'a marqué de points ce soir !`);
    }

    await sleep(2000);
    await client.sendMessage(groupId, `🎉 *Fin des hostilités !*\n\nMerci à tous pour votre participation ! Ne vous découragez pas si vous n'avez pas gagné cette fois-ci, continuez d'apprendre et le prochain quizz sera le vôtre ! 💪🔥\nOn se capte pour la prochaine bataille !`);

    db.run(`UPDATE Quizz SET statut = 'TERMINE' WHERE id = ?`, [quizz.id]);
    activeQuizz = null;
}

// Scheduler : vérifie toutes les minutes si un quizz doit démarrer
function startEngine(client, groupId) {
    console.log('🎮 Moteur de Quizz démarré - Vérification toutes les 60 secondes');

    setInterval(async () => {
        if (activeQuizz) return;

        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const localNow = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

        db.all(
            `SELECT * FROM Quizz WHERE statut = 'EN_ATTENTE' ORDER BY date_planifiee ASC`,
            [],
            async (err, quizzs) => {
                if (err) {
                    console.error('Erreur requête quizz:', err.message);
                    return;
                }
                if (!quizzs || quizzs.length === 0) return;

                const quizz = quizzs.find(q => {
                    if (!q.date_planifiee) return false;
                    const dateQuizz = q.date_planifiee.substring(0, 16);
                    return dateQuizz <= localNow;
                });

                if (!quizz) return;

                console.log(`🚀 Démarrage du quizz : ${quizz.titre} (prévu le ${quizz.date_planifiee})`);
                try {
                    await runQuizz(quizz, client, groupId);
                } catch (e) {
                    console.error('Erreur moteur quizz:', e);
                    activeQuizz = null;
                    if (messageListener) {
                        client.removeListener('message', messageListener);
                        messageListener = null;
                    }
                }
            }
        );
    }, 60 * 1000);
}

module.exports = { startEngine };
