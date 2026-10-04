# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm prisma generate && pnpm build

# Minimal toolchain to run `prisma migrate deploy` at container start, pinned to the
# exact prisma and dotenv versions resolved by the app's lockfile.
FROM base AS migrator
WORKDIR /opt/migrate
COPY prisma ./prisma
COPY prisma.config.ts pnpm-workspace.yaml package.json /tmp/app/
COPY --from=deps /app/node_modules/prisma/package.json /tmp/versions/prisma.json
COPY --from=deps /app/node_modules/dotenv/package.json /tmp/versions/dotenv.json
# Reuse the app's pinned pnpm (corepack would otherwise fetch the latest major).
RUN cp /tmp/app/prisma.config.ts /tmp/app/pnpm-workspace.yaml ./ \
  && node -e 'const p=require("/tmp/app/package.json");require("fs").writeFileSync("package.json",JSON.stringify({name:"cabas-migrate",private:true,packageManager:p.packageManager}))' \
  && pnpm add --save-exact "prisma@$(node -p 'require("/tmp/versions/prisma.json").version')" "dotenv@$(node -p 'require("/tmp/versions/dotenv.json").version')"

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown node:node /data/uploads
COPY --from=migrator --chown=node:node /opt/migrate /opt/migrate
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
