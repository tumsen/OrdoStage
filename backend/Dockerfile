FROM oven/bun:1-alpine
WORKDIR /app

ENV CI=true

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --silent

COPY . .

RUN bunx prisma generate --no-hints

EXPOSE 3000

# Apply migrations then start. Railway injects DATABASE_URL at runtime (Postgres plugin).
# If you set a custom Start Command in the Railway dashboard, include:
#   bunx prisma migrate deploy && bun run start
CMD ["sh", "-c", "bunx prisma migrate deploy && exec bun run start"]
