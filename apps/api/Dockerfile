# Production image for the API on Bun (Spec: AWS ECS Fargate).
# Build from the repository root:  docker build -f apps/api/Dockerfile -t workforce-api .
FROM oven/bun:1.4.2 AS build
WORKDIR /repo
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
RUN bun install --frozen-lockfile --ignore-scripts
COPY packages/core packages/core
COPY apps/api apps/api
RUN cd apps/api && bun build src/main.ts --target=bun --outdir=dist --packages=external

FROM oven/bun:1.4.2-slim
# Bun keeps each app's dependencies in that app's own node_modules (symlinked into the
# root store), so the runtime image mirrors the repository layout.
WORKDIR /repo
ENV NODE_ENV=production PORT=3000
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/core ./packages/core
COPY --from=build /repo/apps/api ./apps/api
WORKDIR /repo/apps/api
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD bun -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# Migrations run as a one-off task before deploy: bun src/db/migrate.ts
CMD ["bun", "dist/main.js"]
