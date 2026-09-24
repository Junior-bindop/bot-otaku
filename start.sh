#!/bin/bash
set -e

echo "=== DÉMARRAGE DU BOT ==="
echo "Contenu du dossier /app/stickers :"
ls -la /app/stickers/ || echo "❌ Dossier stickers introuvable"

# Si les stickers sont absents, on les récupère depuis GitHub
if [ ! -f /app/stickers/greeting.webp ]; then
    echo "⚠️  Stickers manquants, téléchargement depuis GitHub..."
    mkdir -p /app/stickers
    cd /tmp
    wget -q https://github.com/Junior-bindop/bot-otaku/archive/refs/heads/main.zip -O repo.zip
    unzip -q repo.zip
    cp -r bot-otaku-main/stickers/* /app/stickers/ 2>/dev/null || echo "❌ Échec copie"
    echo "✅ Stickers copiés :"
    ls -la /app/stickers/
fi

echo "=== Lancement du bot ==="
exec node src/api/server.js
