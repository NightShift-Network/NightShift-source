FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node server.js ./
COPY --chown=node:node public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]
