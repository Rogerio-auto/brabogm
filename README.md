# Brabogm — Subscription Management Platform

A full-stack monorepo for managing customer subscriptions, payments, and automations via n8n.

## Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| API       | NestJS + Drizzle ORM + PostgreSQL |
| Frontend  | React + Vite + TailwindCSS        |
| Auth      | JWT + Passport.js                 |
| Automation| n8n (self-hosted)                 |
| Package   | npm workspaces                    |

## Project Structure

```
brabogm/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # React frontend
├── packages/
│   └── shared/       # Shared TypeScript types
├── .env.example
├── package.json      # npm workspaces root
└── tsconfig.base.json
```

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your database URL and secrets
```

### 3. Set up PostgreSQL
```bash
# Create database
createdb brabogm

# Run migrations (from apps/api)
cd apps/api && npm run db:migrate
```

### 4. Start development
```bash
# Both API and Web
npm run dev

# API only
npm run dev:api

# Web only
npm run dev:web
```

## API Endpoints

| Method | Path                        | Description            |
|--------|-----------------------------|------------------------|
| POST   | /api/auth/login             | Login                  |
| GET    | /api/auth/me                | Current user           |
| GET    | /api/customers              | List customers         |
| POST   | /api/customers              | Create customer        |
| GET    | /api/subscriptions          | List subscriptions     |
| POST   | /api/subscriptions          | Create subscription    |
| GET    | /api/payments               | List payments          |
| POST   | /api/payments               | Create payment         |
| GET    | /api/event-logs             | List event logs        |
| POST   | /api/event-logs             | Create event log       |
| GET    | /api/admin-actions          | List admin actions     |
| POST   | /api/admin-actions          | Execute admin action   |
| POST   | /api/integrations/n8n/ingest| Receive data from n8n  |
| POST   | /api/integrations/n8n/trigger| Trigger n8n workflow  |

Swagger docs: `http://localhost:3001/api/docs`

## Default Admin

After running migrations:
- **Email:** admin@brabogm.com
- **Password:** admin123

> Change this in production!

## n8n Integration

Configure in `.env`:
```
N8N_BASE_URL=http://localhost:5678
N8N_WEBHOOK_SECRET=your-secret
```

The API will call `POST {N8N_BASE_URL}/webhook/brabogm/{event}` when admin actions are triggered.
