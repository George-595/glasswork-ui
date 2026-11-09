# base-app production image. One Node process serves the built client (dist/)
# and the API on port 8787.
#
# Build context is apps/ (the npm workspace root), so the lockfile, .npmrc and
# the shared packages are all visible. From apps/:
#   docker build -f base-app/Dockerfile -t base-app .
#   docker run -p 8787:8787 --env-file base-app/.env base-app
#
# The base image is pinned by digest (node:24.22.1-bookworm-slim). It was
# published on 21 Oct 2026, inside the 7-day quarantine of apps/ENGINEERING.md
# section 3, as the security fix for the eMudhra intermediate CA key compromise
# (20 Oct 2026): 24.22.1 removes emSign ECC Root CA - G3 from Node's bundled root
# store, which 24.20.0 trusted. George's exception is recorded in
# the quarantine allowlist at the time. Otherwise bump the pin only once the new tag
# is at least 7 days old.

FROM node:24.22.1-bookworm-slim@sha256:eb37f58646a901dc7727cf448cae36daaefaba79de33b5058dab79aa4c04aefb AS base
WORKDIR /app

# deps: every workspace's manifest, then the full install (build needs devDeps).
FROM base AS deps
COPY .npmrc package.json package-lock.json ./
COPY packages/colors/package.json packages/colors/
COPY packages/ui/package.json packages/ui/
COPY base-app/package.json base-app/
RUN npm ci

# build: the full source (filtered by apps/.dockerignore) plus the installed deps.
FROM deps AS build
COPY . .
RUN npm run build -w @apps/base-app

# runtime: production dependencies only, then the server and the built client.
FROM base AS runtime
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    ALLOW_NON_LOOPBACK=true \
    PUBLIC_HOSTS=localhost
COPY .npmrc package.json package-lock.json ./
COPY packages/colors/package.json packages/colors/
COPY packages/ui/package.json packages/ui/
COPY base-app/package.json base-app/
RUN npm ci --omit=dev \
    && npm cache clean --force
# the server reads the email colours from @apps/colors (server/services/mail-templates.ts)
COPY --from=build /app/packages/colors/src ./packages/colors/src
COPY --from=build /app/base-app/server ./base-app/server
COPY --from=build /app/base-app/shared ./base-app/shared
COPY --from=build /app/base-app/lib ./base-app/lib
COPY --from=build /app/base-app/fixtures ./base-app/fixtures
COPY --from=build /app/base-app/dist ./base-app/dist

WORKDIR /app/base-app
# uploaded files (UPLOADS_DIR, default ./data/uploads): writable by the non-root user. Mount a
# volume here, or the files go with the container.
RUN mkdir -p data/uploads && chown -R node:node data
VOLUME /app/base-app/data/uploads
USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 8787) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "server/main.ts"]
