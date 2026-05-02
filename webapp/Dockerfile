# Build context = Git repository ROOT (not webapp/).
# Railway: set this service "Root Directory" to "." so COPY backend/... works.
# The webapp imports ../../../backend/src/types (shared Zod); those paths resolve
# only when backend/src/types.ts exists next to webapp/ (monorepo layout).
FROM oven/bun:1-alpine AS builder

WORKDIR /workspace

RUN mkdir -p backend/src
COPY backend/src/types.ts backend/src/types.ts

WORKDIR /workspace/webapp
COPY webapp/package.json ./
RUN bun install

COPY webapp/ .

ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

RUN bun run build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM nginx:stable-bullseye

RUN apt-get update && apt-get install -y gettext-base && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/webapp/dist /usr/share/nginx/html
COPY --from=builder /workspace/webapp/nginx.conf /etc/nginx/conf.d/default.conf.template

EXPOSE 8080
CMD ["/bin/sh", "-c", "envsubst '${BACKEND_URL} ${BACKEND_HOST}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
