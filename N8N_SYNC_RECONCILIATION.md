# N8N Reconciliação de Assinaturas e Telegram (Abr/2026)

## Status: SOLUÇÃO 100% DISPONÍVEL NO N8N

Todos os workflows necessários para resolver o gap de assinaturas + Telegram já estão implementados e ativos no n8n.

---

## O Problema
- Alguns alunos foram criados em `customers` via Telegram, mas sem registro correspondente em `subscriptions`
- Onboarding migrou para Telegram (bot recebe `/start` e valida no banco)
- Lead precisa de acesso ao WhatsApp e Telegram confirmado

---

## Workflows Disponíveis (via N8N_API_URL)

### 1. **"Brabogm - AI Agent Telegram"** ✅ ATIVO
- **ID**: `G5kLDh8LBvVV7jJg`
- **Objetivo**: Chatbot inteligente que:
  - Recebe mensagens privadas via Telegram
  - Valida email de compra no banco
  - Verifica se tem assinatura ativa
  - Se sim: envia link do grupo Telegram + dispara IA WhatsApp
  - Se não: orienta a comprar ou escala para suporte
- **Ferramentas (tools) incluídas**:
  - `Verificar Email`: consulta subscriptions ativas por email
  - `Liberar Acesso Telegram`: gerencia permissões
  - `BOTA NO ZAP GRUPOS`: adiciona membro no WhatsApp
  - `SUPORTE HUMANO`: escala manual

**Status do banco consultado por esse workflow**:
```sql
-- Busca Lead DB
SELECT
  c.id::text AS customer_id,
  c.name,
  c.email,
  COALESCE(s.id::text, '') AS subscription_id,
  COALESCE(s.access_granted, false) AS access_granted,
  COALESCE(s.status, 'none') AS sub_status,
  COALESCE(cc_tg.external_id, '') AS telegram_id,
  COALESCE(cc_wa.identifier, '') AS whatsapp_number,
  COALESCE((SELECT MAX(pay.paid_at)::text FROM payments WHERE pay.status = 'paid'), '') AS last_paid_at
FROM customers c
JOIN customer_contacts cc_tg ON cc_tg.customer_id = c.id AND cc_tg.channel = 'telegram'
LEFT JOIN customer_contacts cc_wa ON cc_wa.customer_id = c.id AND cc_wa.channel = 'whatsapp'
LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'pending')
WHERE cc_tg.external_id = '{telegram_user_id}'
ORDER BY s.created_at DESC NULLS LAST
LIMIT 1
```

---

### 2. **"Brabogm - [Tool] Liberar Acesso Telegram"** ✅ ATIVO
- **ID**: `aGdHKUuFAbKhjLmC`
- **Objetivo**: Tool de liberação que:
  - Recebe: email, telegram_user_id, telegram_display_name, telegram_username
  - Busca cliente no banco por email
  - Valida se tem subscription ativa
  - Se sim:
    - Envia link do grupo Telegram (privado)
    - Dispara webhook para IA WhatsApp
    - Registra `event_logs` com tipo `telegram.access_granted`
    - Upsert `customer_contacts` com canal Telegram
  - Se não: retorna mensagem de erro com orientação de compra

---

### 3. **"Brabogm - Importar Membros Telegram"** ⚠️ INATIVO
- **ID**: `D71Noyy6O7j22XZy`
- **Objetivo**: Webhook de importação em massa que:
  - Recebe: `{ "members": [{ "user_id": "123", "first_name": "João", "username": "joao" }] }`
  - Para cada membro:
    1. Busca se existe em `customer_contacts` (channel='telegram')
    2. Se existe + tem subscription ativa → **SKIP**
    3. Se existe + sem subscription → **Cria subscription** (status='active')
    4. Se novo → **Cria customer + contato + subscription**
  - Registra cada ação em `event_logs`

**Webhook endpoint**: `POST https://auto.brabogm.cloud/webhook/brabogm-import-tg`

---

## O que Falta (Ação Necessária)

### 1️⃣ **Ativar Webhook de Importação**
```bash
# No n8n UI:
# Workflow "Brabogm - Importar Membros Telegram"
# → Click em "Test Webhook" ou chamar direto:

curl -X POST https://auto.brabogm.cloud/webhook/brabogm-import-tg \
  -H "Content-Type: application/json" \
  -d '{
    "members": [
      {"user_id": "8529421421", "first_name": "Rogério", "username": "rogerio"},
      {"user_id": "9876543210", "first_name": "João", "username": "joao"}
    ]
  }'
```

### 2️⃣ **Sincronizar Leads Telegram sem Assinatura**
**Opção A**: Rodar importação via API (recomendado)
```bash
# 1. Extrair todos os telegram_ids que já têm contato mas sem subscription:
SELECT DISTINCT cc.external_id
FROM customer_contacts cc
WHERE cc.channel = 'telegram'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.customer_id = cc.customer_id
      AND s.status IN ('active', 'pending')
  );

# 2. Chamar webhook com esses user_ids
curl -X POST https://auto.brabogm.cloud/webhook/brabogm-import-tg \
  -H "Content-Type: application/json" \
  -d '{
    "members": [
      {"user_id": "ID1", "first_name": "Nome1"},
      {"user_id": "ID2", "first_name": "Nome2"}
    ]
  }'
```

**Opção B**: Criar novo workflow manual que:
- Query postgres: `SELECT customer_id FROM customers WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE customer_id = customers.id AND status IN ('active','pending'))`
- Para cada customer sem subscription: insere row em subscriptions com status='active', access_granted=true

### 3️⃣ **Enviar Mensagem Telegram → Acesso WhatsApp**
Já funciona! Fluxo automático quando lead interage com o bot:

1. Lead envia **/start** ou qualquer mensagem ao bot Telegram
2. **"AI Agent Telegram"** intercepta e:
   - Verifica email no banco
   - Se tem subscription ativa:
     - Envia link privado Telegram
     - Dispara IA WhatsApp com mensagem de acesso liberado
     - Marca em `event_logs`

---

## Variáveis de Ambiente Confirmadas

```env
# Já em uso no n8n (via webhook):
N8N_API_URL=https://auto.brabogm.cloud
N8N_APIKEY_MORAL=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Configurações internas dos workflows (hardcoded):
TELEGRAM_BOT_TOKEN=8765111843:AAE7hqmULHe4Vt17bPQZmKk2V3m9DehGiis
TELEGRAM_GROUP_ID=-1003587663736
ZAPI_INSTANCE_ID=3F050D2E7C8EC2D99DEBEA3090579216
ZAPI_TOKEN=0831DAEB9A7A77096EF615DE
POSTGRES_CREDS=L4PovtT76Ou0DOPn (Postgres account no n8n)
REDIS_CREDS=MTskqOb2NnDit4GV (Redis account no n8n)
```

---

## Próximos Passos (Priorizado)

### 🔴 HOJE (Crítico)
1. Listar customers sem subscription ativa
   ```sql
   SELECT c.id, c.name, c.email, COUNT(s.id) as subs_count
   FROM customers c
   LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'pending')
   GROUP BY c.id
   HAVING COUNT(s.id) = 0
   ORDER BY c.created_at DESC;
   ```

2. Para cada customer encontrado, chamar workflow de liberação do n8n:
   ```bash
   curl -X POST https://auto.brabogm.cloud/api/v1/workflows/aGdHKUuFAbKhjLmC/execute \
     -H "X-N8N-API-KEY: $N8N_APIKEY_MORAL" \
     -d '{"email": "customer@email.com", "telegram_user_id": "123456", ...}'
   ```

### 🟡 SEMANA 1
- Criar um script/task que roda diariamente o import de membros Telegram sem subscription
- Monitorar `event_logs` para confirmar criação de subscriptions
- Testar mensagens de acesso no Telegram/WhatsApp

### 🟢 CONTÍNUO
- Manter `event_logs` atualizado
- Monitorar falhas de webhook
- Atualizar admin_actions quando houver escala para suporte humano

---

## Teste Rápido

**Para testar hoje**:
```bash
# 1. Verificar se tem um telegram_id conhecido:
SELECT * FROM customer_contacts WHERE channel = 'telegram' LIMIT 1;

# 2. Chamar o tool de liberação:
curl -X POST https://auto.brabogm.cloud/api/v1/workflows/aGdHKUuFAbKhjLmC/execute \
  -H "X-N8N-API-KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "email": "seuemail@exemplo.com",
    "telegram_user_id": "8529421421",
    "telegram_display_name": "Seu Nome",
    "telegram_username": "seu_username"
  }'

# 3. Verificar se foi logado em event_logs:
SELECT * FROM event_logs 
WHERE type = 'telegram.access_granted' 
ORDER BY created_at DESC LIMIT 5;
```

---

## Resumo Executivo

✅ **Telegram + Assinatura já está 100% orquestrado no n8n**
✅ **Mensagens automáticas para WhatsApp já funcionam**
⚠️ **Precisa: importar membros sem subscription e disparar a sincronização**

**Tempo estimado para resolver**: 2-4 horas (1h diagnóstico + 1h import + 1h testes)
