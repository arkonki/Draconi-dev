FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
RUN apk add --no-cache postgresql16-client
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY package.json ./application-package.json
COPY server ./server
COPY --chmod=755 server/docker-entrypoint.sh /usr/local/bin/dragonbane-entrypoint

EXPOSE 3000 3100
ENTRYPOINT ["dragonbane-entrypoint"]
