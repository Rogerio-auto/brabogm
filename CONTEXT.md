# Contexto do Projeto — Brabogm

> Este arquivo serve como contexto completo para assistentes de desenvolvimento (IA ou humanos) entenderem o que foi construído, como está organizado e como trabalhar neste repositório.

---

## O que é este projeto?

**Brabogm** é um monorepo full stack para a **camada administrativa** de um sistema de assinaturas.

O ponto mais importante da arquitetura: **o motor principal do sistema NÃO está aqui**. Toda a automação, processamento de webhooks, regras de negócio pesadas e integrações com pagamentos (Cakto) rodam no **n8n** (self-hosted). Este repositório é apenas o **painel administrativo + API de gerenciamento**.

---

## Arquitetura geral

```
Cakto (gateway de pagamento)
        │  webhooks
        ▼
      n8n  ← motor principal: processa compras, renovações,
        │     cancelamentos, falhas, automações
        │  grava/atualiza dados no banco
        ▼
   PostgreSQL  ← banco compartilhado
        │
        ├─► NestJS API  ← lê e gerencia dados via REST
        │        │
        └─► React Web   ← painel admin consome a API
```

**Responsabilidades separadas:**

| Componente | Função |
|---|---|
| **n8n** | Motor: webhooks, automações, regras de negócio, escrita no banco |
| **API NestJS** | Camada administrativa: CRUD, ações manuais, disparar webhooks para o n8n |
| **React Web** | Painel visual: visualizar dados, executar ações administrativas |
| **PostgreSQL** | Banco único: escrito pelo n8n, lido/gerenciado pela API |

---

## Estrutura do monorepo

```
brabogm/
├── package.json              ← root: npm workspaces
├── tsconfig.base.json        ← tsconfig compartilhado
├── .env.example              ← variáveis de ambiente (template)
├── .gitignore
├── README.md                 ← instruções de uso
├── CONTEXT.md                ← este arquivo
│
├── packages/
│   └── shared/               ← tipos TypeScript compartilhados
│       ├── package.json      ← name: @brabogm/shared
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts      ← re-exporta tudo
│           └── types/
│               ├── common.ts        ← PaginationParams, PaginatedResponse, ApiResponse
│               ├── auth.ts          ← LoginRequest, LoginResponse, JwtPayload
│               ├── customer.ts      ← Customer, CreateCustomerDto, UpdateCustomerDto
│               ├── subscription.ts  ← Subscription, CreateSubscriptionDto, ...
│               ├── payment.ts       ← Payment, CreatePaymentDto, PaymentStatus, ...
│               ├── event-log.ts     ← EventLog, CreateEventLogDto, EventLogType
│               └── admin-action.ts  ← AdminAction, CreateAdminActionDto, AdminActionType
│
├── apps/
│   ├── api/                  ← NestJS (porta 3001)
│   │   ├── package.json      ← name: @brabogm/api
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   ├── drizzle.config.ts ← configuração do Drizzle Kit
│   │   └── src/
│   │       ├── main.ts           ← bootstrap, Swagger, CORS, ValidationPipe
│   │       ├── app.module.ts     ← AppModule com todos os módulos
│   │       ├── database/
│   │       │   ├── database.module.ts   ← @Global, token DATABASE_CONNECTION
│   │       │   ├── schema.ts            ← re-exporta schema/index
│   │       │   └── schema/
│   │       │       ├── index.ts
│   │       │       ├── users.ts
│   │       │       ├── customers.ts
│   │       │       ├── subscriptions.ts
│   │       │       ├── payments.ts
│   │       │       ├── event-logs.ts
│   │       │       └── admin-actions.ts
│   │       └── modules/
│   │           ├── auth/
│   │           ├── customers/
│   │           ├── subscriptions/
│   │           ├── payments/
│   │           ├── event-logs/
│   │           ├── admin-actions/
│   │           └── integrations/
│   │
│   └── web/                  ← React + Vite + TailwindCSS (porta 5173)
│       ├── package.json      ← name: @brabogm/web
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx            ← roteamento com react-router-dom
│           ├── index.css          ← @tailwind directives
│           ├── lib/
│           │   └── api.ts         ← instância axios com interceptor 401
│           ├── contexts/
│           │   └── AuthContext.tsx ← AuthProvider, useAuth hook
│           ├── components/
│           │   ├── Layout.tsx     ← sidebar + header + <Outlet>
│           │   ├── StatCard.tsx
│           │   ├── PageHeader.tsx
│           │   ├── StatusBadge.tsx
│           │   └── Table.tsx      ← tabela genérica com colunas configuráveis
│           └── pages/
│               ├── LoginPage.tsx
│               ├── DashboardPage.tsx
│               ├── CustomersPage.tsx
│               ├── SubscriptionsPage.tsx
│               ├── PaymentsPage.tsx
│               ├── EventLogsPage.tsx
│               └── AdminActionsPage.tsx
```

---

## Backend — `apps/api` (NestJS)

### Configuração geral

- **Prefixo global:** `/api`
- **Porta:** `3001` (via `PORT` no `.env`)
- **Swagger:** `http://localhost:3001/api/docs`
- **Validação global:** `ValidationPipe` com `whitelist: true`, `transform: true`
- **CORS:** habilitado para `FRONTEND_URL` (default: `http://localhost:5173`)
- **Config:** `@nestjs/config` carrega `../../.env` (relativo ao `apps/api`)

### Database Module

Arquivo: `src/database/database.module.ts`

- Módulo `@Global()` — disponível em toda a aplicação sem precisar importar
- Injeta o `Pool` do `pg` configurado com `DATABASE_URL`
- Cria instância `drizzle(pool, { schema })`
- Token de injeção: `DATABASE_CONNECTION` (string exportada como constante)
- Todos os services injetam via `@Inject(DATABASE_CONNECTION) private readonly db: any`

### Módulos

#### `auth`
- **Controller:** `POST /api/auth/login`, `GET /api/auth/me`
- **Login flow:** `LocalAuthGuard` → `LocalStrategy` → `AuthService.validateUser()` → retorna JWT
- **Proteção de rotas:** `JwtAuthGuard` (extends `AuthGuard('jwt')`)
- **JWT payload:** `{ sub: userId, email, role }`
- **bcryptjs** para hash de senha
- **Método `seedDefaultAdmin()`:** cria `admin@brabogm.com` / `admin123` se não existir (deve ser chamado manualmente ou num script de seed)

#### `customers`
- `GET /api/customers?page=1&limit=20` — lista paginada
- `GET /api/customers/:id`
- `POST /api/customers`
- `PATCH /api/customers/:id`
- `DELETE /api/customers/:id`
- Todos os endpoints requerem **JWT**
- Retorno paginado: `{ data, total, page, limit, totalPages }`

#### `subscriptions`
- `GET /api/subscriptions?page=1&limit=20`
- `GET /api/subscriptions/:id`
- `POST /api/subscriptions`
- `PATCH /api/subscriptions/:id`
- Todos os endpoints requerem **JWT**

#### `payments`
- `GET /api/payments?page=1&limit=20`
- `GET /api/payments/:id`
- `POST /api/payments`
- `PATCH /api/payments/:id/status` — atualiza status, seta `paidAt` automaticamente se status = `'paid'`
- Todos os endpoints requerem **JWT**

#### `event-logs`
- `GET /api/event-logs?page=1&limit=20` — requer JWT
- `GET /api/event-logs/:id` — requer JWT
- `POST /api/event-logs` — **sem autenticação** (usado pelo n8n ou internamente)

#### `admin-actions`
- `GET /api/admin-actions?page=1&limit=20` — requer JWT
- `GET /api/admin-actions/:id` — requer JWT
- `POST /api/admin-actions` — requer JWT
  - Cria a ação com `status: 'processing'`
  - Se `type === 'trigger_n8n_workflow'`, chama `IntegrationsService.triggerN8nWebhook('admin-action', ...)`
  - Atualiza status para `'completed'` ou `'failed'`
  - `adminId` é extraído do JWT (`req.user.id`)

#### `integrations`
- `POST /api/integrations/n8n/ingest` — **sem autenticação JWT**
  - Valida header `x-n8n-secret` contra `N8N_WEBHOOK_SECRET` do `.env`
  - Loga o body recebido
  - Retorna `{ received: true, timestamp }`
- `POST /api/integrations/n8n/trigger` — sem autenticação (interno)
  - Body: `{ event: string, payload: any }`
  - Chama `POST {N8N_BASE_URL}/webhook/brabogm/{event}`
  - Header `x-brabogm-secret` com o `N8N_WEBHOOK_SECRET`
  - Timeout de 10s, falha silenciosa (retorna `{ triggered: false }`)

### Schema do banco (Drizzle ORM)

Localização: `apps/api/src/database/schema/`

#### `users`
```
id          uuid PK (auto)
name        varchar(255) NOT NULL
email       varchar(255) UNIQUE NOT NULL
password_hash text NOT NULL
role        varchar(50) DEFAULT 'admin'
created_at  timestamp DEFAULT NOW
updated_at  timestamp DEFAULT NOW
```

#### `customers`
```
id          uuid PK (auto)
name        varchar(255) NOT NULL
email       varchar(255) UNIQUE NOT NULL
phone       varchar(50)
document    varchar(50)
status      varchar(50) DEFAULT 'active'   ← active | inactive | blocked
external_id varchar(255)                    ← ID externo (Cakto, etc.)
metadata    jsonb
created_at  timestamp DEFAULT NOW
updated_at  timestamp DEFAULT NOW
```

#### `subscriptions`
```
id            uuid PK (auto)
customer_id   uuid FK → customers.id NOT NULL
plan_id       varchar(255) NOT NULL
plan_name     varchar(255) NOT NULL
status        varchar(50) DEFAULT 'pending'  ← active|cancelled|expired|pending|suspended|trial
start_date    timestamp NOT NULL
end_date      timestamp
trial_end_date timestamp
amount        numeric(10,2) NOT NULL
currency      varchar(10) DEFAULT 'BRL'
billing_cycle varchar(50) NOT NULL
external_id   varchar(255)
metadata      jsonb
created_at    timestamp DEFAULT NOW
updated_at    timestamp DEFAULT NOW
```

#### `payments`
```
id              uuid PK (auto)
subscription_id uuid FK → subscriptions.id NOT NULL
customer_id     uuid FK → customers.id NOT NULL
amount          numeric(10,2) NOT NULL
currency        varchar(10) DEFAULT 'BRL'
status          varchar(50) DEFAULT 'pending'  ← pending|processing|paid|failed|refunded|cancelled
method          varchar(50)  ← credit_card|debit_card|pix|boleto|bank_transfer
external_id     varchar(255)
gateway_response jsonb
paid_at         timestamp
due_date        timestamp
metadata        jsonb
created_at      timestamp DEFAULT NOW
updated_at      timestamp DEFAULT NOW
```

#### `event_logs`
```
id              uuid PK (auto)
type            varchar(100) NOT NULL   ← subscription.created, payment.received, etc.
customer_id     uuid (nullable, sem FK hard)
subscription_id uuid (nullable)
payment_id      uuid (nullable)
source          varchar(50) DEFAULT 'api'  ← api|n8n|webhook|admin
payload         jsonb
metadata        jsonb
created_at      timestamp DEFAULT NOW
```
> Nota: `event_logs` é append-only, sem `updated_at`.

#### `admin_actions`
```
id              uuid PK (auto)
type            varchar(100) NOT NULL  ← cancel_subscription|trigger_n8n_workflow|...
admin_id        uuid NOT NULL          ← ID do usuário que executou
customer_id     uuid (nullable)
subscription_id uuid (nullable)
payment_id      uuid (nullable)
status          varchar(50) DEFAULT 'pending'  ← pending|processing|completed|failed
payload         jsonb
result          jsonb  ← resultado ou erro
notes           text
created_at      timestamp DEFAULT NOW
updated_at      timestamp DEFAULT NOW
```

### Drizzle Kit

Arquivo: `apps/api/drizzle.config.ts`

```ts
// schema: './src/database/schema/index.ts'
// out: './drizzle'
// driver: 'pg'
// dbCredentials.connectionString: process.env.DATABASE_URL
```

Comandos:
```bash
cd apps/api
npm run db:generate   # gera migration SQL
npm run db:migrate    # executa migrations
npm run db:studio     # abre Drizzle Studio (GUI)
```

---

## Frontend — `apps/web` (React + Vite + TailwindCSS)

### Stack

- **React 18** com TypeScript
- **Vite 5** como bundler
- **TailwindCSS 3** para estilos
- **react-router-dom v6** para roteamento
- **react-query v3** para data fetching e cache
- **axios** para chamadas HTTP

### Roteamento

```
/login            → LoginPage (pública)
/                 → DashboardPage (protegida)
/customers        → CustomersPage (protegida)
/subscriptions    → SubscriptionsPage (protegida)
/payments         → PaymentsPage (protegida)
/event-logs       → EventLogsPage (protegida)
/admin-actions    → AdminActionsPage (protegida)
```

Rotas protegidas usam o componente `ProtectedRoute` que verifica `isAuthenticated` do `AuthContext`. Se não autenticado, redireciona para `/login`.

### Autenticação

- `AuthContext` (`src/contexts/AuthContext.tsx`) gerencia o estado global de auth
- Token JWT salvo em `localStorage` (chave `token`)
- Dados do usuário salvos em `localStorage` (chave `user`)
- `useAuth()` hook expõe: `user`, `isAuthenticated`, `isLoading`, `login()`, `logout()`
- `api.ts` (axios) tem interceptor que redireciona para `/login` em respostas 401

### API Client

`src/lib/api.ts`

```ts
baseURL = VITE_API_URL ? `${VITE_API_URL}/api` : '/api'
// fallback para /api usa o proxy do Vite (aponta para localhost:3001)
```

O Vite em dev faz proxy: `/api → http://localhost:3001`

### Componentes reutilizáveis

| Componente | Descrição |
|---|---|
| `Layout.tsx` | Shell com sidebar (dark, responsiva), header, `<Outlet>` para rotas filhas |
| `StatCard.tsx` | Card de estatística com título, valor, ícone e cor configurável |
| `PageHeader.tsx` | Cabeçalho de página com título, descrição e slot para ação |
| `StatusBadge.tsx` | Badge colorido para status (`active`, `paid`, `failed`, etc.) |
| `Table.tsx` | Tabela genérica tipada com colunas configuráveis, loading state, empty state |

### Páginas

| Página | O que faz |
|---|---|
| `LoginPage` | Formulário de login, chama `useAuth().login()`, redireciona em sucesso |
| `DashboardPage` | 4 stat cards com totais + cards explicativos da arquitetura |
| `CustomersPage` | Tabela de clientes com status badge |
| `SubscriptionsPage` | Tabela de assinaturas com valor, ciclo, status |
| `PaymentsPage` | Tabela de pagamentos com método, status, data de pagamento |
| `EventLogsPage` | Tabela de logs com source badge colorido por origem |
| `AdminActionsPage` | Tabela + formulário para criar nova ação (abre com botão "+ New Action") |

### TailwindCSS

- Config em `apps/web/tailwind.config.js`
- Content scoped para `./index.html` e `./src/**/*.{js,ts,jsx,tsx}`
- Cor customizada `primary` (shades 50–900 em azul)
- Design escuro no sidebar (`bg-gray-900`), claro no conteúdo

---

## Pacote compartilhado — `packages/shared`

Tipos TypeScript puros (sem runtime, só tipos). Usado pelos dois apps via path alias:

```json
// tsconfig.json de cada app
"paths": {
  "@brabogm/shared": ["../../packages/shared/src/index.ts"]
}
```

**Tipos exportados:**

- `Customer`, `CreateCustomerDto`, `UpdateCustomerDto`, `CustomerStatus`
- `Subscription`, `CreateSubscriptionDto`, `UpdateSubscriptionDto`, `SubscriptionStatus`
- `Payment`, `CreatePaymentDto`, `PaymentStatus`, `PaymentMethod`
- `EventLog`, `CreateEventLogDto`, `EventLogType`
- `AdminAction`, `CreateAdminActionDto`, `AdminActionType`, `AdminActionStatus`
- `LoginRequest`, `LoginResponse`, `JwtPayload`
- `PaginationParams`, `PaginatedResponse<T>`, `ApiResponse<T>`

---

## Variáveis de ambiente

Arquivo: `.env.example` (na raiz do monorepo)

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/brabogm

# API
PORT=3001
NODE_ENV=development
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=7d

# n8n Integration
N8N_BASE_URL=http://localhost:5678
N8N_WEBHOOK_SECRET=change-me-in-production

# Frontend (para o Vite)
VITE_API_URL=http://localhost:3001
```

O arquivo `.env` (sem o `.example`) é ignorado pelo `.gitignore`.

A API carrega `.env` relativo à sua posição com `envFilePath: '../../.env'` — ou seja, o `.env` deve ficar na **raiz do monorepo**.

---

## Scripts de desenvolvimento

Na raiz (via npm workspaces):

```bash
npm run dev          # API + Web ao mesmo tempo (usa concurrently)
npm run dev:api      # só a API (porta 3001)
npm run dev:web      # só o frontend (porta 5173)
npm run build        # build shared → api → web
npm run build:api
npm run build:web
```

Na API:
```bash
npm run db:generate  # gera migrations com Drizzle Kit
npm run db:migrate   # executa migrations
npm run db:studio    # GUI visual do banco
npm run test         # Jest (ainda sem testes escritos)
```

---

## Admin padrão

Após rodar as migrations, existe o método `AuthService.seedDefaultAdmin()` que pode ser chamado para criar o usuário inicial:

```
Email:    admin@brabogm.com
Senha:    admin123
```

⚠️ **Trocar em produção.**

---

## Integração com n8n

### Contexto operacional atual (Abr/2026)

- O onboarding foi migrado para Telegram para ativação de acessos.
- Parte dos alunos já existe em `customers`, mas sem registro correspondente em `subscriptions`.
- O lead precisa iniciar conversa com o bot para o Telegram ser capturado e vinculado ao aluno.
- É necessário sincronizar periodicamente para corrigir assinaturas ausentes e manter consistência entre bot, n8n e banco.

### Variáveis obrigatórias para sincronização

```env
N8N_API_URL=https://auto.brabogm.cloud
N8N_APIKEY_MORAL=define-in-secret-manager
```

> Segurança: manter a chave real fora do repositório (secret manager / variável de ambiente no servidor).

### Como o n8n envia dados para esta API

```http
POST /api/integrations/n8n/ingest
Headers:
  x-n8n-secret: <N8N_WEBHOOK_SECRET>
  Content-Type: application/json
Body: { "event": "subscription.renewed", "data": { ... } }
```

Atualmente o endpoint só loga e retorna `{ received: true }`. Para processamento real, expand o `IntegrationsService.ingestFromN8n()`.

### Como o painel dispara ações no n8n

Ao criar um `AdminAction` com `type: "trigger_n8n_workflow"`:

1. A ação é salva no banco com `status: 'processing'`
2. `IntegrationsService.triggerN8nWebhook('admin-action', payload)` é chamado
3. O n8n recebe em: `POST {N8N_BASE_URL}/webhook/brabogm/admin-action`
4. Header `x-brabogm-secret` é enviado para autenticar
5. A ação é atualizada para `'completed'` ou `'failed'`

Também existe o endpoint direto (sem criar um AdminAction):

```http
POST /api/integrations/n8n/trigger
Body: { "event": "nome-do-evento", "payload": { ... } }
```

### Ajuste funcional recomendado (Telegram como canal principal)

- Atualizar o workflow de `admin-actions` no n8n para priorizar `telegram` como canal de comunicação com o aluno.
- Quando o bot receber o contato, persistir/atualizar `customer_contacts.channel = 'telegram'`.
- Na sincronização, para cada `customer` sem assinatura ativa, consultar fonte de verdade no n8n e criar/atualizar `subscriptions`.
- Registrar resultado da sincronização em `event_logs` para auditoria e suporte.

---

## O que foi feito ✅

- [x] Monorepo com npm workspaces (`apps/*`, `packages/*`)
- [x] `packages/shared` com todos os tipos TypeScript das entidades
- [x] NestJS API com 7 módulos: auth, customers, subscriptions, payments, event-logs, admin-actions, integrations
- [x] Autenticação JWT com Passport.js (local strategy + jwt strategy)
- [x] Drizzle ORM configurado com schema para todas as 6 tabelas
- [x] Todos os endpoints REST com paginação
- [x] Swagger/OpenAPI em `/api/docs`
- [x] Integração bidirecional com n8n (receber e disparar)
- [x] Frontend React com Vite + TailwindCSS
- [x] Todas as 7 páginas do painel (login + 6 protegidas)
- [x] Componentes reutilizáveis: Layout, Table, StatusBadge, StatCard, PageHeader
- [x] Contexto de autenticação com persistência em localStorage
- [x] Proxy Vite para a API em desenvolvimento
- [x] `.env.example`, `.gitignore`, `README.md`

## O que ainda NÃO foi feito / próximos passos sugeridos 🔲

- [ ] **Migrations SQL** — ainda não foram geradas (rodar `db:generate` + `db:migrate`)
- [ ] **Seed do admin** — `AuthService.seedDefaultAdmin()` precisa ser chamado (criar script ou chamar no bootstrap)
- [ ] **Testes** — infraestrutura de Jest está nas `devDependencies`, mas sem testes escritos
- [ ] **Lógica real de ingest do n8n** — `ingestFromN8n()` só loga, não persiste dados
- [ ] **Formulários de criação** — as páginas de listagem não têm modais/forms para criar registros (só AdminActions tem)
- [ ] **Filtros e busca** — endpoints têm paginação, mas sem filtros por status/data/nome
- [ ] **Página de detalhe** — sem páginas de detalhe individual por entidade
- [ ] **Refresh de token** — JWT expira e redireciona para login, sem silent refresh
- [ ] **Variável `FRONTEND_URL`** — está hardcoded no CORS do `main.ts`, não está no `.env.example`
- [ ] **Roles/permissões** — estrutura pronta (campo `role` no JWT e no banco), mas sem guards por role
- [ ] **Docker / docker-compose** — não criado
- [ ] **CI/CD** — não configurado

---

## Convenções de código

- **TypeScript strict** em todos os pacotes
- **Drizzle ORM:** queries encadeadas (fluent API), sem SQL raw
- **NestJS:** um Service por módulo, um Controller por módulo, DTOs com `class-validator`
- **React:** componentes funcionais, hooks, sem classes
- **State:** `react-query` para dados remotos, `useState`/`useContext` para estado local de UI
- **CSS:** apenas classes Tailwind, sem CSS customizado exceto o `index.css` com as diretivas
- **Nomes de arquivos:** kebab-case (`event-logs.service.ts`), exceto componentes React (PascalCase)
- **Exports:** named exports em módulos, default export em componentes React e páginas
- **Sem comentários inline** exceto onde explicitamente necessário
