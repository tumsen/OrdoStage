# Build context = repo root
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy webapp package.json and install dependencies
COPY webapp/package.json ./
RUN bun install

# Copy webapp source
COPY webapp/ .

# Build the Vite app (VITE_BACKEND_URL must be set as a Railway build variable)
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

RUN bun run build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
