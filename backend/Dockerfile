FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

RUN bunx prisma generate

EXPOSE 3000

# DB schema is applied via Railway preDeployCommand (see railway.json) so the
# server can bind quickly and pass health checks. For local Docker, run:
#   docker run ... sh -c "bunx prisma db push && bun run src/index.ts"
CMD ["bun", "run", "src/index.ts"]
