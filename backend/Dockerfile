FROM oven/bun:1-alpine AS base
WORKDIR /app

# Copy root lockfile and root package.json (Bun monorepo)
COPY bun.lock package.json ./

# Copy backend package.json for dependency install
COPY backend/package.json ./backend/

# Install backend dependencies (Bun walks up to find bun.lock at /app)
RUN cd backend && bun install --frozen-lockfile

# Copy backend source (includes prisma/ directory)
COPY backend/ ./backend/

# Generate Prisma client
RUN cd backend && bunx prisma generate

EXPOSE 3000

# On startup: push schema to PostgreSQL then start server
CMD ["sh", "-c", "cd /app/backend && bunx prisma db push && bun run src/index.ts"]
