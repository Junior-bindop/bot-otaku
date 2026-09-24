FROM node:20-bullseye-slim

RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates procps libxss1 xvfb dbus dbus-x11 \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 \
    libxrandr2 libxshmfence1 fonts-liberation xdg-utils \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Force cache invalidation - v2
COPY package*.json ./
RUN npm install

COPY . .
COPY stickers ./stickers

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

EXPOSE 8080

CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1280x1024x24", "node", "src/api/server.js"]
