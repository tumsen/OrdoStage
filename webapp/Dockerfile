# ── Build stage ──────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Copy root lockfile and root package.json (Bun monorepo)
COPY bun.lock package.json ./

# Copy webapp package.json for dependency install
COPY webapp/package.json ./webapp/

# Install webapp dependencies (Bun walks up to find bun.lock at /app)
RUN cd webapp && bun install --frozen-lockfile

# Copy webapp source
COPY webapp/ ./webapp/

# The webapp imports types from the backend
COPY backend/src/ ./backend/src/

# Build the Vite app (VITE_BACKEND_URL set at Railway build time)
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

RUN cd webapp && bun run build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/webapp/dist /usr/share/nginx/html
COPY --from=builder /app/webapp/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
