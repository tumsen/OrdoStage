FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

RUN bunx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "bunx prisma db push && bun run src/index.ts"]
