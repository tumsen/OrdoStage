FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

RUN bunx prisma generate

EXPOSE 3000

# Sync schema before listening. Railway deploy.startCommand overrides Dockerfile CMD,
# so railway.json must not set startCommand unless it includes this same sequence.
CMD ["sh", "-c", "bunx prisma db push && exec bun run src/index.ts"]
