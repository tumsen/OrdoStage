FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

RUN bunx prisma generate

EXPOSE 3000

# Apply migrations then start. Railway injects DATABASE_URL at runtime (Postgres plugin).
# If you set a custom Start Command in the Railway dashboard, include:
#   bunx prisma migrate deploy && bun run start
CMD ["sh", "-c", "bunx prisma migrate deploy && exec bun run start"]
