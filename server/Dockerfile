FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --chmod=755 server/docker-entrypoint.sh /usr/local/bin/dragonbane-entrypoint

EXPOSE 3000
ENTRYPOINT ["dragonbane-entrypoint"]
