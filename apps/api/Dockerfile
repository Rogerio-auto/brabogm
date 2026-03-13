# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all deps (workspace-aware)
RUN npm ci

# Copy source
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY tsconfig.base.json ./

# Build shared first, then API
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/api

# ── Stage 2: Production ────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install production deps only
RUN npm ci --omit=dev

# Install drizzle-kit for runtime schema push (needed by entrypoint)
RUN cd apps/api && npm install drizzle-kit@^0.20.9 --no-save

# Copy built shared package (needed at runtime for type references)
COPY --from=builder /app/packages/shared ./packages/shared

# Copy built API
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy drizzle config and migration files
COPY apps/api/drizzle.config.ts ./apps/api/
COPY apps/api/src/database/schema ./apps/api/src/database/schema
COPY tsconfig.base.json ./
COPY apps/api/tsconfig.json ./apps/api/

# Copy entrypoint
COPY apps/api/entrypoint.sh ./apps/api/
RUN chmod +x ./apps/api/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

ENTRYPOINT ["./apps/api/entrypoint.sh"]
