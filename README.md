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
N8N_WEBHOOK_ADMIN_ACTION=https://auto.brabogm.cloud/webhook/brabogm/admin-action
N8N_WEBHOOK_NEW_LEAD=https://auto.brabogm.cloud/webhook/brabogm/new-lead
N8N_API_URL=https://auto.brabogm.cloud
N8N_APIKEY_MORAL=define-in-secret-manager
```

The API will call `POST {N8N_BASE_URL}/webhook/brabogm/{event}` when admin actions are triggered.

### Sync via n8n API (Telegram onboarding)

Current operation requires a sync flow because onboarding was migrated to Telegram and some users were created without subscription records.

Recommended checklist:
- Keep `N8N_API_URL` and `N8N_APIKEY_MORAL` in runtime secrets (do not commit real keys).
- Ensure Telegram identity is persisted in `customer_contacts` (`channel = telegram`) when the lead contacts the bot.
- Run an n8n reconciliation flow that finds customers without subscription and creates/updates `subscriptions`.
- Register each reconciliation action in `event_logs` and `admin_actions` for traceability.

Suggested reconciliation criteria:
- `customers` exists and has Telegram contact.
- No active row in `subscriptions` for that customer.
- n8n workflow confirms external source state and upserts subscription in PostgreSQL.
