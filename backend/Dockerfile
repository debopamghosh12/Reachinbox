# Production image for the API (and, with RUN_WORKER_IN_API=true, the worker).
# Used by Railway (see railway.json); works with plain `docker build` too.
FROM node:22-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install first (cached until package*.json or the schema changes).
# Dev dependencies stay: `tsc` builds the app and the `prisma` CLI runs
# `migrate deploy` on every start. postinstall runs `prisma generate`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
# Same steps as `npm run start:prod`: apply pending migrations, then start
# the compiled server on $PORT. `exec` makes node PID 1, so Railway's SIGTERM
# reaches it directly and the graceful shutdown (in-flight sends) runs.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/src/server.js"]
