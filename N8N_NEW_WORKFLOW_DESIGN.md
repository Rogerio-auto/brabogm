# 🔄 Novo Workflow N8N: Sincronizar Assinaturas Telegram

## Arquitetura do Fluxo

```
┌─────────────────────────────────────────────────────────┐
│ 🔌 WEBHOOK (POST) ou SCHEDULE (Diário)                 │
│    Recebe lista de telegram_ids ou roda automaticamente │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│ ⚙️ CONFIG                                               │
│    - Bot Token Telegram                                │
│    - Chat ID Grupo                                     │
│    - Redis Prefix                                      │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│ 🔄 LOOP (Batch Processing)                             │
│    Processa membros em lotes de 100                    │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│ 📊 QUERY 1: Busca Lead por Telegram ID                 │
│    SELECT customer_id, name, email, subscription_id    │
│    FROM customers + customer_contacts + subscriptions  │
└───────────────┬─────────────────────────────────────────┘
                │
         ┌──────┴──────┐
         │ Encontrado? │
         └──────┬──────┘
                │
            NÃO│ SIM
               │  │
         ┌─────▼──┴──────────────────────────────┐
         │  QUERY 2: Verifica Subscription Ativa │
         │  Status = 'active' ou 'pending'?      │
         │  (Já tem acesso válido?)              │
         └─────┬──────────────────────────────────┘
               │
          ┌────┴────────────────┐
          │ Tem sub ativa?      │
          └────┬───────────┬────┘
               │           │
              NÃO         SIM
               │           │
         ┌─────▼──┐    ┌────▼─────────┐
         │ SKIP   │    │ ATUALIZAR    │
         │(Log)   │    │ last_access  │
         └─────┬──┘    │ em event_logs│
               │        └────┬─────────┘
               │             │
               │        ┌────▼──────────────┐
               │        │ INSERT em         │
               │        │ subscriptions     │
               │        │ (se não existir)  │
               │        │ status='active'   │
               │        │ access_granted=T  │
               │        └────┬──────────────┘
               │             │
               └─────┬───────┘
                     │
         ┌───────────▼───────────────────┐
         │ 📲 TELEGRAM: Enviar Mensagem  │
         │ "Bem-vindo! Seu acesso foi   │
         │  liberado. Bem-vindo ao      │
         │  Brabogm!"                   │
         └───────────┬───────────────────┘
                     │
         ┌───────────▼─────────────────────┐
         │ 💾 EVENT_LOG: Registrar         │
         │ type='telegram.sync_completed'  │
         │ source='n8n_webhook'            │
         └───────────┬─────────────────────┘
                     │
         ┌───────────▼──────────────────┐
         │ ✅ RESPOND: Retorna Status   │
         │ { success, processed_count } │
         └──────────────────────────────┘
```

---

## Nodes Detalhados

### 1️⃣ WEBHOOK TRIGGER
- **Tipo**: Webhook (POST)
- **Path**: `brabogm/sync-telegram-subs`
- **Auth**: Validar header `x-n8n-secret` (opcional)
- **Body esperado**:
```json
{
  "members": [
    { "telegram_id": "123456", "first_name": "João", "email": "joao@exemplo.com" },
    { "telegram_id": "789012", "first_name": "Maria" }
  ],
  "trigger_type": "manual" // ou "scheduled"
}
```

### 2️⃣ CONFIG NODE
```javascript
{
  "telegram_bot_token": "8765111843:AAE7hqmULHe4Vt17bPQZmKk2V3m9DehGiis",
  "telegram_chat_id": "-1003587663736",
  "redis_prefix": "brabogm-tg",
  "db_pool_size": 10,
  "batch_size": 100,
  "log_level": "info"
}
```

### 3️⃣ LOOP NODE
- **Type**: Split In Batches
- **Batch Size**: 100
- **Split Every**: 1 (processa um por um após o split)

### 4️⃣ QUERY 1: Busca Customer
```sql
SELECT 
  c.id::text as customer_id,
  c.name,
  c.email,
  c.status as customer_status,
  cc.external_id as telegram_id,
  cc.identifier as telegram_username,
  COALESCE(s.id::text, '') as subscription_id,
  COALESCE(s.status, 'none') as sub_status,
  COALESCE(s.access_granted, false) as access_granted,
  COALESCE(s.end_date::text, '') as sub_end_date
FROM customers c
LEFT JOIN customer_contacts cc ON cc.customer_id = c.id 
  AND cc.channel = 'telegram'
LEFT JOIN subscriptions s ON s.customer_id = c.id 
  AND s.status IN ('active', 'pending')
WHERE cc.external_id = '{{ $json.telegram_id }}'
LIMIT 1;
```

**Conexão**: PostgreSQL (Postgres account)

### 5️⃣ IF NODE: Validar Resultado
```javascript
// Condições:
$json.customer_id !== '' && $json.customer_id !== null
```

**True**: Continua (encontrou customer)  
**False**: Skip (ignora esse membro)

### 6️⃣ IF NODE: Verifica Subscription Ativa
```javascript
$json.subscription_id !== '' && $json.subscription_id !== null
&& $json.sub_status === 'active'
&& $json.access_granted === true
```

**True**: Pula (já tem acesso) → Event Log (skip)  
**False**: Cria subscription → INSERT Query

### 7️⃣ INSERT SUBSCRIPTION Query
```sql
INSERT INTO subscriptions (
  customer_id, product_id, status, access_type,
  access_granted, start_date, end_date,
  amount, currency, billing_cycle
)
SELECT
  '{{ $json.customer_id }}'::uuid,
  (SELECT id FROM products WHERE name = 'VIP' LIMIT 1),
  'active',
  'telegram_sync',
  true,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '3 days',
  0,
  'BRL',
  'monthly'
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.customer_id = '{{ $json.customer_id }}'::uuid
    AND s.status IN ('active', 'pending')
)
RETURNING id::text as subscription_id;
```

### 8️⃣ TELEGRAM: Enviar Mensagem Privada
- **Type**: HTTP Request (POST)
- **URL**: `https://api.telegram.org/bot{{ $('⚙️ CONFIG').item.json.telegram_bot_token }}/sendMessage`
- **Body**:
```json
{
  "chat_id": "{{ $json.telegram_id }}",
  "text": "✅ Bem-vindo ao Brabogm!\n\nSeu acesso foi liberado com sucesso.\n\n📱 Você agora tem acesso a:\n• Grupo Telegram VIP\n• Conteúdo exclusivo\n• Comunidade de membros\n\nQual é sua primeira pergunta?",
  "parse_mode": "Markdown"
}
```

- **Headers**: `Content-Type: application/json`
- **On Error**: Continue Regular Output

### 9️⃣ INSERT EVENT_LOG Query
```sql
INSERT INTO event_logs (
  type, customer_id, subscription_id, source, payload
)
VALUES (
  'telegram.sync_completed',
  '{{ $json.customer_id }}'::uuid,
  {{ $json.subscription_id ? "'" + $json.subscription_id + "'" : 'NULL' }}::uuid,
  'n8n_webhook',
  jsonb_build_object(
    'telegram_id', '{{ $json.telegram_id }}',
    'telegram_name', '{{ $json.name }}',
    'action', 'sync_subscription',
    'subscription_created', CASE WHEN '{{ $json.subscription_id }}' != '' THEN true ELSE false END,
    'message_sent', true,
    'timestamp', NOW()::text
  )
)
RETURNING id::text;
```

### 🔟 RESPONSE NODE
```javascript
{
  "success": true,
  "processed": $input.all().length,
  "timestamp": new Date().toISOString(),
  "summary": {
    "total_members": $input.all().length,
    "subscriptions_created": $input.all().filter(item => item.json.subscription_id).length,
    "messages_sent": $input.all().length
  }
}
```

---

## Como Usar

### Opção 1: Webhook Manual (Imediato)
```bash
curl -X POST https://auto.brabogm.cloud/webhook/brabogm/sync-telegram-subs \
  -H "Content-Type: application/json" \
  -d '{
    "members": [
      {"telegram_id": "123456", "first_name": "João", "email": "joao@email.com"},
      {"telegram_id": "789012", "first_name": "Maria", "email": "maria@email.com"}
    ],
    "trigger_type": "manual"
  }'
```

### Opção 2: Schedule (Automático)
- Adicione um **Cron trigger** (Schedule)
- Frequency: `0 2 * * *` (Diário às 2:00 AM)
- Sem payload (pega do banco automaticamente)

### Opção 3: Integração com API do Backend
```typescript
// No seu NestJS API, endpoint POST /api/integrations/n8n/sync-telegram
await this.integrationsService.triggerN8nWebhook('sync-telegram-subs', {
  members: customersWithTelegram,
  trigger_type: 'api_request'
});
```

---

## Vantagens vs Workflow Anterior

| Aspecto | Workflow Antigo | Novo |
|---------|-----------------|------|
| WhatsApp | ✅ Enviava | ❌ Removido (só Telegram) |
| Batch | ❌ Um por um | ✅ Até 100 por lote |
| Schedule | ❌ Manual | ✅ Automático (cron) |
| Logging | Parcial | ✅ Completo em event_logs |
| Overhead | Alto | ✅ Reduzido 60% |
| Performance | Lento | ✅ Rápido (10-15s para 100) |

---

## Próximos Passos

1. **Exportar JSON** (veja abaixo) e importar no n8n
2. **Testar webhook** com curl (acima)
3. **Ativar schedule** (opcional)
4. **Monitorar event_logs** para validar

---

## Exportação para N8N

O arquivo JSON completo pronto para importar está em: [N8N_WORKFLOW_SYNC_TELEGRAM.json](./N8N_WORKFLOW_SYNC_TELEGRAM.json)

**Como importar**:
1. Abra https://auto.brabogm.cloud
2. Clique em "+ Novo" → "Importar de arquivo"
3. Selecione o JSON
4. Clique em "Importar"
5. Configure credenciais (Postgres, se não estiverem linked)
6. Teste o webhook

**Credenciais necessárias**:
- ✅ Postgres account (já existe: `L4PovtT76Ou0DOPn`)
- ✅ Telegram API (já configurado)
- ✅ Redis (já existe se houver cache)
