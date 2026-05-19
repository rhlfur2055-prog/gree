FROM node:20-bookworm

# Chromium dependencies for Remotion (headless Chrome)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    libnss3 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libx11-6 \
    libx11-xcb1 libxcb1 libxext6 libxrender1 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Pre-bundle Remotion (warmup so first render is fast)
RUN node -e "require('@remotion/bundler').bundle({ entryPoint: require('path').join(__dirname,'src','index.ts') }).then(loc => console.log('bundle:', loc)).catch(e => { console.error(e); process.exit(1); })"

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
