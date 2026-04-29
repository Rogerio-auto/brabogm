# Como Importar o Workflow no n8n

## 🎯 O que o workflow faz

- **Trigger**: Webhook POST para ativar sincronização
- **Lógica**: Para cada telegram_id na payload:
  1. Busca customer + contacts + subscriptions no banco
  2. Se não tiver subscription ativa, cria uma
  3. Envia mensagem Telegram privada de boas-vindas
  4. Registra tudo em event_logs para auditoria
- **Sem WhatsApp**: Apenas Telegram, zero dependência de Z-API

---

## 📥 Passo 1: Exportar/Importar o JSON

### Opção A: Via Interface n8n (Recomendado)
1. Acesse `https://auto.brabogm.cloud`
2. Clique no menu (≡) → **Workflows** → **+ Create New**
3. Clique em **...** (canto superior direito) → **Import from file**
4. Selecione `N8N_WORKFLOW_SYNC_TELEGRAM.json`
5. Clique em **Import**

### Opção B: Via API (Advanced)
```bash
curl -X POST https://auto.brabogm.cloud/api/v1/workflows \
  -H "X-N8N-API-KEY: $N8N_APIKEY_MORAL" \
  -H "Content-Type: application/json" \
  -d @N8N_WORKFLOW_SYNC_TELEGRAM.json
```

---

## ✅ Passo 2: Verificar Conexões

Após importar, o workflow terá **placeholders** que você precisa conectar:

### 1️⃣ PostgreSQL Connection
- O workflow usa credencial ID: `L4PovtT76Ou0DOPn` (placeholder)
- **Você precisa**:
  1. No n8n, ir em **Settings** → **Credentials**
  2. Criar ou selecionar credencial PostgreSQL existente
  3. No workflow, abrir cada node PostgreSQL:
     - `🔍 Busca Customer`
     - `📝 Cria Subscription`
     - `💾 Log Event`
     - `📋 Log Skip (Not Found)`
  4. Em cada node, trocar a credencial para a sua

**Dados de Conexão PostgreSQL**:
```
Host: ${DB_HOST}
Port: ${DB_PORT}
Database: brabogm
User: ${DB_USER}
Password: ${DB_PASSWORD}
```

### 2️⃣ Telegram Bot Token
- Já está embutido no workflow: `8765111843:AAE7hqmULHe4Vt17bPQZmKk2V3m9DehGiis`
- ✅ Não precisa configurar (já funciona)

### 3️⃣ Webhook URL
- Após criar, o n8n gerará uma URL assim:
  ```
  https://auto.brabogm.cloud/webhook/brabogm-sync-telegram
  ```
- Copie essa URL para usar na chamada

---

## 🚀 Passo 3: Testar o Workflow

### Teste Manual via Webhook

```bash
curl -X POST https://auto.brabogm.cloud/webhook/brabogm-sync-telegram \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": 123456789,
    "action": "sync_subscription"
  }'
```

### Resposta Esperada
```json
{
  "success": true,
  "message": "Sync completed",
  "timestamp": "2024-04-15T10:30:00.000Z"
}
```

---

## ⏱️ Passo 4: Configurar Agendamento (Optional)

Se quiser que o workflow rode automaticamente:

1. Abra o workflow
2. Clique na aba **Settings** (engrenagem)
3. Procure por **"Trigger"** ou **"Schedule"**
4. Adicione um node **Schedule** (Cron):
   - **Pattern**: `0 2 * * *` (roda 2 AM UTC todo dia)
   - Conecte ao node **🔌 Webhook Sync**

Ou substitua o webhook trigger por um **Schedule** node diretamente.

---

## 📊 Passo 5: Monitorar Execuções

Após rodar o workflow:

1. No n8n, abra o workflow
2. Clique em **Executions** (histórico de rodadas)
3. Procure pela mais recente
4. Veja o log de cada node

**Verificar no Banco**:
```sql
-- Veja os últimos eventos de sync
SELECT * FROM event_logs 
WHERE type = 'telegram.sync_completed' 
ORDER BY created_at DESC 
LIMIT 10;

-- Verifique subscriptions criadas
SELECT c.name, s.status, s.access_granted, s.created_at
FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
WHERE s.access_type = 'telegram_sync'
ORDER BY s.created_at DESC;
```

---

## 🔄 Fluxo Completo do Workflow

```
Webhook Trigger
    ↓
CONFIG (telegram_bot_token, chat_id)
    ↓
🔄 Loop Members (processa cada telegram_id)
    ↓
🔍 Busca Customer (busca customer + subscription)
    ↓
✓ Customer Encontrado?
    ├─ Não → 📋 Log Skip (Not Found) → continue
    └─ Sim → Tem Sub Ativa?
           ├─ Sim → ⏭️ Skip (Já Ativo) → continue
           └─ Não → 📝 Cria Subscription
                   ↓
                   📲 Envia Telegram (bot message)
                   ↓
                   💾 Log Event (audit trail)
                   ↓
                   continue loop
    ↓
✅ Respond (webhook response)
```

---

## 🐛 Troubleshooting

### "PostgreSQL Connection Failed"
- Certifique-se que a credencial PostgreSQL está correta em **Settings → Credentials**
- Teste a conexão clicando no botão **"Test connection"**

### "Telegram Message Not Sent"
- Verifique se o Telegram bot token está ativo
- Use `curl` pra testar:
  ```bash
  curl https://api.telegram.org/bot8765111843:AAE7hqmULHe4Vt17bPQZmKk2V3m9DehGiis/getMe
  ```
- Deve retornar dados do bot

### "Webhook Not Working"
- Verifique se o workflow está ativado (toggle no canto superior)
- Teste a URL com `curl -v`
- Procure por status 404 ou 403

---

## 📌 Checklist Antes de Usar em Produção

- [ ] PostgreSQL connection testada e funcionando
- [ ] Telegram bot token validado
- [ ] Webhook URL acessível externamente
- [ ] Event logs sendo criados corretamente
- [ ] Pelo menos uma execução de teste bem-sucedida
- [ ] Documentação da URL do webhook compartilhada com time

---

## 🎓 Próximos Passos

1. **Testar em staging** com 5-10 telegram IDs
2. **Validar dados** em `event_logs` e `subscriptions`
3. **Configurar alertas** se falharem (Add error handler ao workflow)
4. **Agendar execução** via Schedule trigger ou webhook externo

---

## 📞 Contexto Técnico

- **Linguagem das Queries**: PostgreSQL (v12+)
- **Autenticação Telegram**: Já embutida (bot token)
- **Rate Limiting**: Telegram permite ~30 msgs/sec
- **Timeout Padrão**: 30s por request (configurável)

Qualquer dúvida, consulte:
- Logs do workflow (Executions tab)
- Event_logs table (`SELECT * FROM event_logs WHERE type LIKE 'telegram.%'`)
- Admin actions (para manual triggers)
