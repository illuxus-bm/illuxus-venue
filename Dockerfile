# syntax=docker/dockerfile:1.7
# Illuxus Venues API: AWS ECS / App Runner / EC2, Fly, Render, any container host.
#   docker build -t illuxus-venues-api .
#   docker run -p 8787:8787 --env-file server/.env illuxus-venues-api

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY server/prisma ./server/prisma
RUN npm ci --no-audit --no-fund
COPY server ./server
RUN npm run api:build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0
WORKDIR /app
# Non-root: the official image ships a `node` user.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/server/prisma ./server/prisma
COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts ./
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null || exit 1
# The server handles SIGTERM itself (drains requests, closes DB connections),
# so it runs fine as PID 1. Use `docker run --init` if you add child processes.
CMD ["node", "server/dist/src/server.js"]
