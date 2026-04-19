FROM oven/bun:1-alpine AS base
WORKDIR /app

# Quieter CI installs (fewer lines Railway labels as warnings); reproducible backend lockfile.
ENV CI=true

COPY package.json bun.lock ./
COPY backend/package.json backend/bun.lock ./backend/

RUN cd backend && bun install --frozen-lockfile --silent

COPY backend/ ./backend/

# Switch Prisma provider to PostgreSQL for production
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' backend/prisma/schema.prisma

# Remove SQLite-only PRAGMA calls that crash on PostgreSQL
RUN sed -i '/PRAGMA/d' backend/src/prisma.ts && sed -i '/initSqlitePragmas/d' backend/src/prisma.ts

# Generate Prisma client
RUN cd backend && bunx prisma generate --no-hints

EXPOSE 3000

CMD ["sh", "-c", "cd /app/backend && bunx prisma migrate deploy && exec bun run src/index.ts"]
