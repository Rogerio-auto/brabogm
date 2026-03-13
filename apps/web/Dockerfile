# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install all deps
RUN npm ci

# Copy source
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

# Build shared first, then Web
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/web

# ── Stage 2: Nginx ─────────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy built SPA
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Custom nginx config for SPA routing + API proxy
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
