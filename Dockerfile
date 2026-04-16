FROM oven/bun:1-alpine AS base
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY backend/package.json ./backend/

# Install backend dependencies
RUN cd backend && bun install --frozen-lockfile

# Copy backend source
COPY backend/ ./backend/

# Switch Prisma provider to PostgreSQL for production
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' backend/prisma/schema.prisma

# Generate Prisma client
RUN cd backend && bunx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "cd /app/backend && bunx prisma db push && bun run src/index.ts"]
