# Build context = repo root
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY webapp/package.json ./
RUN bun install

COPY webapp/ .

ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

RUN bun run build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM nginx:alpine
RUN apk add --no-cache bash

COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf.template

EXPOSE 8080
CMD ["/bin/sh", "-c", "envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
