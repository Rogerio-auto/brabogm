# 🚀 Quick Start: Do Zero ao Telegram Sync em 10 Minutos

## Pré-requisitos Checklist
- [ ] Acesso ao n8n em `https://auto.brabogm.cloud`
- [ ] Credencial PostgreSQL já configurada no n8n (Settings → Credentials)
- [ ] `.env.local` com DB_HOST, DB_USER, DB_PASSWORD (ou psql configurado)
- [ ] Curl instalado (ou Postman)

---

## 🎬 Cenário 1: Importar o Workflow (5 min)

### Via Interface
```
1. Abra https://auto.brabogm.cloud/
2. Clique em "+ Create New" → "Import from file"
3. Selecione: N8N_WORKFLOW_SYNC_TELEGRAM.json
4. Clique: "Import"
5. Você verá um workflow com 12 nodes conectados
6. Clique no canto superior direito: Toggle ON (para ativar)
```

### Via CLI (Advanced)
```bash
# Copiar o JSON e fazer upload via API
curl -X POST https://auto.brabogm.cloud/api/v1/workflows \
  -H "X-N8N-API-KEY: $N8N_APIKEY_MORAL" \
  -H "Content-Type: application/json" \
  -d @N8N_WORKFLOW_SYNC_TELEGRAM.json
```

---

## 🔌 Cenário 2: Conectar PostgreSQL (3 min)

1. **Abra o workflow** (clique nele depois de importar)
2. **Clique em cada node PostgreSQL**:
   - 🔍 Busca Customer
   - 📝 Cria Subscription
   - 💾 Log Event
   - 📋 Log Skip

3. **Para cada node**:
   ```
   - Clique no selector de credencial (dropdown)
   - Selecione sua credencial PostgreSQL
   - Clique "Test connection" (deve virar ✅ verde)
   - Clique "Save" (canto inferior direito do modal)
   ```

4. **Clique no botão "Save" do workflow** (canto superior direito)

---

## ✅ Cenário 3: Teste Simples (2 min)

### Via Webhook Direto

```bash
# 1. Copiar a webhook URL do workflow
#    (botão 🔗 no node "🔌 Webhook Sync")

# 2. Testar com curl
curl -X POST \
  https://auto.brabogm.cloud/webhook/brabogm-sync-telegram \
  -H "Content-Type: application/json" \
  -d '{"telegram_id": 123456, "action": "sync_test"}'

# 3. Esperado: {"success": true, "message": "Sync completed", "timestamp": "..."}
```

### Via Dashboard n8n

```
1. Abra o workflow
2. Clique em "Executions" (aba histórica)
3. Veja a última execução
4. Expanda cada node para ver o que passou por ele
5. Procure por erros (nodes com ❌ vermelho)
```

---

## 🔍 Cenário 4: Validar no Banco (2 min)

### Verifique os Eventos de Sync

```bash
# Via psql
psql -h $DB_HOST -U $DB_USER -d brabogm -c "
SELECT 
  type, 
  customer_id, 
  (payload->>'telegram_id')::text as tg_id,
  created_at
FROM event_logs 
WHERE type LIKE 'telegram.sync%'
ORDER BY created_at DESC 
LIMIT 10;
"
```

**Esperado na saída**:
```
type                  | customer_id | tg_id     | created_at
----------------------|-------------|-----------|-------------------
telegram.sync_completed | 550e8... | 123456    | 2025-04-15 10:30:00
```

### Verifique as Subscriptions Criadas

```bash
psql -h $DB_HOST -U $DB_USER -d brabogm -c "
SELECT 
  c.name, 
  s.status, 
  s.access_granted,
  s.access_type,
  s.created_at
FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
WHERE s.access_type = 'telegram_sync'
ORDER BY s.created_at DESC 
LIMIT 10;
"
```

**Esperado**:
```
name | status | access_granted | access_type    | created_at
-----|--------|----------------|----------------|-------------------
João | active | true           | telegram_sync  | 2025-04-15 10:30:00
```

---

## 🔧 Cenário 5: Usar o Script de Teste (Interativo)

```bash
# Rodar o script
bash test_n8n_sync.sh

# Menu:
# 1) Testar webhook (sem payload)
# 2) Sincronizar um telegram_id específico
# 3) Listar customers com Telegram
# 4) Ver últimos eventos de sync
# 5) Sair
```

### Exemplo: Sincronizar um ID Específico

```bash
bash test_n8n_sync.sh
# Escolha: 2
# Digite: 987654321
# Resultado: Webhook chamado + resposta JSON
```

---

## 📊 Cenário 6: Verificar Tudo em Produção

### Rodar uma Sincronização Manual com logging

```bash
#!/bin/bash

echo "🚀 Sincronizando leads Telegram..."

# 1. Encontrar customers sem subscription
psql -h $DB_HOST -U $DB_USER -d brabogm -t -c "
SELECT DISTINCT cc.external_id
FROM customers c
JOIN customer_contacts cc ON cc.customer_id = c.id AND cc.channel = 'telegram'
LEFT JOIN subscriptions s ON s.customer_id = c.id 
  AND s.status IN ('active', 'pending')
  AND (s.end_date IS NULL OR s.end_date > CURRENT_DATE)
WHERE s.id IS NULL
LIMIT 5;
" | while read telegram_id; do
  echo "📲 Processando: $telegram_id"
  
  # 2. Chamar webhook para cada um
  RESPONSE=$(curl -s -X POST \
    https://auto.brabogm.cloud/webhook/brabogm-sync-telegram \
    -H "Content-Type: application/json" \
    -d "{\"telegram_id\": $telegram_id}")
  
  # 3. Validar resposta
  if echo "$RESPONSE" | grep -q "success"; then
    echo "✅ OK: $telegram_id"
  else
    echo "❌ ERRO: $telegram_id"
  fi
done

echo "✅ Sincronização completa!"
```

---

## 🛑 Cenário 7: Troubleshooting Rápido

### Webhook retorna erro 404

```bash
# 1. Verificar se workflow está ativado
#    (no n8n UI, procure pelo toggle no topo)

# 2. Se não estiver ativado, clique para ativar

# 3. Testar novamente
curl -X POST https://auto.brabogm.cloud/webhook/brabogm-sync-telegram \
  -H "Content-Type: application/json" \
  -d '{"telegram_id": 123}'
```

### PostgreSQL Connection Error

```bash
# 1. Abra qualquer node PostgreSQL do workflow

# 2. Clique no selector de credencial

# 3. Clique em "Test connection"
#    Se falhar, edite a credencial:
#    - Host correto?
#    - Port correto (5432)?
#    - Username correto?
#    - Password correto?
#    - Database = "brabogm"?

# 4. Teste manualmente
psql -h $DB_HOST -p 5432 -U $DB_USER -d brabogm -c "SELECT 1;"
```

### Telegram Message não enviada

```bash
# 1. Verificar se o bot token está ativo
curl https://api.telegram.org/bot8765111843:AAE7hqmULHe4Vt17bPQZmKk2V3m9DehGiis/getMe

# 2. Deve retornar:
# {"ok":true,"result":{"id":8765111843,"is_bot":true,"first_name":"Brabogm Bot",...}}

# 3. Se retornar {"ok":false}, o token expirou

# 4. Atualizar o token no workflow:
#    - Abra node "📲 Envia Telegram"
#    - Procure por "bot{{ $('⚙️ CONFIG').item.json.telegram_bot_token }}"
#    - Substitua o token no node "⚙️ CONFIG"
```

---

## 🎯 Cenário 8: Ativar Sincronização Automática (Optional)

Se quiser que rode **todo dia às 2 AM UTC**:

```
1. Abra o workflow
2. Clique no node "🔌 Webhook Sync"
3. Delete esse node (ou disable)
4. Clique no botão "+" do lado esquerdo
5. Procure por "Schedule" (ou "Cron")
6. Adicione um Schedule node:
   - Pattern: "0 2 * * *"
   - Conecte ao node "⚙️ CONFIG"
7. Clique "Save"
```

Agora roda automaticamente todo dia!

---

## 📋 Checklist Final

- [ ] Workflow importado no n8n
- [ ] PostgreSQL connection testada ✅
- [ ] Webhook testado com sucesso
- [ ] Event_logs mostra registros
- [ ] Subscriptions foram criadas
- [ ] Telegram message foi recebida
- [ ] Script test_n8n_sync.sh rodou sem erros
- [ ] Time foi notificada
- [ ] URL do webhook documentada
- [ ] Backup do workflow feito

---

## 📞 Commands de Referência

### Webhook URL (copie daqui)
```
https://auto.brabogm.cloud/webhook/brabogm-sync-telegram
```

### Test Curl
```bash
curl -X POST https://auto.brabogm.cloud/webhook/brabogm-sync-telegram \
  -H "Content-Type: application/json" \
  -d '{"telegram_id": 123456, "action": "sync"}'
```

### Ver Eventos
```bash
psql -h $DB_HOST -U $DB_USER -d brabogm -c "
SELECT * FROM event_logs 
WHERE type LIKE 'telegram.sync%' 
ORDER BY created_at DESC LIMIT 20;"
```

### Ver Subscriptions Criadas
```bash
psql -h $DB_HOST -U $DB_USER -d brabogm -c "
SELECT c.name, s.status, s.access_type, s.created_at
FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
WHERE s.access_type = 'telegram_sync'
ORDER BY s.created_at DESC;"
```

---

## 🎓 Importante

- **Não delete o workflow** — é o seu motor de sync
- **Não mude o webhook path** — o n8n gera a URL automaticamente
- **Faça backup** — Settings → Export workflow a cada mudança
- **Monitore** — Executions tab mostra tudo que acontece
- **Teste em staging** — Com 5-10 IDs antes de produção

---

**Status**: ✅ Ready to Use  
**Tempo Estimado**: 15 min (incluindo testes)  
**Suporte**: Ver N8N_WORKFLOW_INSTALL.md para detalhes completos
