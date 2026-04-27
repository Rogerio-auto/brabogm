# 🚀 RUNBOOK: Resolver Leads Telegram sem Assinatura (Hoje)

## Situação
✅ Workflows 100% prontos no n8n  
⚠️ Gap: Alguns customers tem telegram_id mas sem subscription_id no banco  
🎯 Objetivo: Sincronizar automaticamente em **2 minutos**

---

## PASSO 1: Carregar as Variáveis de Ambiente (2 min)

```powershell
# Abra um PowerShell e rode:
Set-Location "c:\Users\roger\Desktop\Rogerio\Jobs\Brabogm\App\brabogm"

# Carregue o .env.local
$vars = Get-Content .env.local | Where-Object { $_ -and -not $_.StartsWith('#') }
foreach ($line in $vars) {
    $name, $value = $line -split '=', 2
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

# Valide:
Write-Host "N8N_API_URL: $env:N8N_API_URL"
Write-Host "DATABASE_URL: $(($env:DATABASE_URL -split '@')[1] -split '/')[0]"
```

---

## PASSO 2: Auditoria (Verificar Quantos Faltam) - 1 min

### Opção A: Via DBeaver ou psql (mais rápido)

```bash
# Se tem PostgreSQL instalado:
psql $DATABASE_URL < audit_missing_subscriptions.sql
```

### Opção B: Via PowerShell

```powershell
$query = @"
SELECT COUNT(*) as sem_assinatura
FROM customers c
JOIN customer_contacts cc_tg ON cc_tg.customer_id = c.id AND cc_tg.channel = 'telegram'
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.customer_id = c.id AND s.status IN ('active', 'pending')
);
"@

# Executar (requer psql instalado)
psql $env:DATABASE_URL -c $query
```

**Esperado**: Deve retornar um número > 0 (exemplo: 5, 12, 23)

---

## PASSO 3: Preview dos Membros (Validar Antes) - 1 min

```sql
-- Cole isso no DBeaver/psql
SELECT
  c.name,
  c.email,
  cc_tg.external_id as telegram_id,
  cc_wa.identifier as whatsapp
FROM customers c
JOIN customer_contacts cc_tg ON cc_tg.customer_id = c.id AND cc_tg.channel = 'telegram'
LEFT JOIN customer_contacts cc_wa ON cc_wa.customer_id = c.id AND cc_wa.channel = 'whatsapp'
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.customer_id = c.id AND s.status IN ('active', 'pending')
)
LIMIT 5;
```

**Esperado**: Lista com nomes, emails, IDs do Telegram

---

## PASSO 4: SINCRONIZAR ✅ (30 segundos - O IMPORTANTE)

### Opção A: Rodar o Script PowerShell (Recomendado)

```powershell
# No PowerShell, na pasta do projeto:
.\sync_n8n_telegram.ps1 -DryRun:$false
```

**Resultado esperado**:
```
✅ Webhook disparado com sucesso!
   Processados: 12 membros
   ✓ Assinaturas serão criadas automaticamente no n8n
   ✓ Mensagens Telegram/WhatsApp serão enviadas
```

### Opção B: Chamar Webhook Manualmente (curl)

```bash
# Prepare o payload
curl -X POST https://auto.brabogm.cloud/webhook/brabogm-import-tg \
  -H "Content-Type: application/json" \
  -d '{
    "members": [
      {"user_id": "8529421421", "first_name": "Rogério", "username": "rogerio"},
      {"user_id": "9876543210", "first_name": "João", "username": "joao"}
    ]
  }'
```

**Resposta esperada**:
```json
{
  "success": true,
  "message": "Import completed"
}
```

---

## PASSO 5: Validar Sincronização ✅ (1 min)

### No banco de dados:

```sql
-- Subscriptions criadas:
SELECT c.name, s.id, s.status, s.created_at
FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
WHERE s.created_at > NOW() - INTERVAL '5 minutes'
ORDER BY s.created_at DESC
LIMIT 10;
```

**Esperado**: Novas subscriptions com status='active' criadas agora

```sql
-- Eventos registrados:
SELECT type, customer_id, source, created_at
FROM event_logs
WHERE type LIKE '%telegram%' OR type LIKE '%import%'
ORDER BY created_at DESC
LIMIT 20;
```

**Esperado**: Logs de `telegram.access_granted` ou `telegram.import_completed`

### Verificar Telegram (Manual)

1. Abra seu bot do Telegram (@brabogm_bot ou similar)
2. Envie uma mensagem qualquer
3. O bot deve responder com status de acesso

---

## PASSO 6: Enviar Mensagens (Automático)

Quando um lead interage com o bot Telegram:

1. **Bot recebe mensagem** → Workflow "AI Agent Telegram" ativa
2. **Valida email no banco** → Encontra a subscription que acabou de criar
3. **Acesso confirmado** → Envia:
   - Link privado do grupo Telegram
   - Mensagem no WhatsApp com status de liberação
4. **Event log gravado** → Rastreabilidade completa

---

## ⏱️ Cronograma

| Ação | Tempo | Status |
|------|-------|--------|
| Carregar ENV | 2 min | ✅ |
| Auditoria | 1 min | ✅ |
| Preview | 1 min | ✅ |
| **SINCRONIZAR** | **30 seg** | **🎯 AQUI** |
| Validar BD | 1 min | ✅ |
| Testar Telegram | 2 min | ✅ |
| **TOTAL** | **~8 min** | **✅** |

---

## 🆘 Se Algo der Errado

### Erro: "Webhook não encontrado"
```
→ Workflow "Brabogm - Importar Membros Telegram" não está ativo
→ Ative em: https://auto.brabogm.cloud/workflows
→ Ou consulte: N8N_SYNC_RECONCILIATION.md
```

### Erro: "Invalid API Key"
```
→ N8N_APIKEY_MORAL expirou ou incorreta
→ Copie nova chave de: https://auto.brabogm.cloud/settings/api/tokens
→ Atualize em: .env.local
```

### Erro: "Connection refused"
```
→ Database_URL incorreta ou PostgreSQL down
→ Teste: psql $DATABASE_URL -c "SELECT 1"
→ Se falhar, reinicie PostgreSQL na VPS
```

### Erro: "0 members found"
```
→ Nenhum customer com telegram_id encontrado
→ Isso é OK - significa problema já resolvido
→ Ou: Execute a auditoria (PASSO 2) para confirmar
```

---

## 📋 Checklist Final

- [ ] Carreguei .env.local com N8N_APIKEY_MORAL
- [ ] Validei que DATABASE_URL está correto
- [ ] Rodei o preview e vi pelo menos 1 customer
- [ ] Executei `sync_n8n_telegram.ps1` com sucesso
- [ ] Validei que subscriptions foram criadas
- [ ] Testei mensagem no Telegram (ou vou testar)
- [ ] Confirmei event_logs com novos registros

---

## 🎯 Próximos Passos (Depois)

1. **Monitor automático**: Colocar script em cron/Task Scheduler diário
2. **Alertas**: Notificação se houver falha na sincronização
3. **Relatório**: Dashboard com contagem de sincronizações
4. **Cleanup**: Remover assinaturas antigas/duplicadas

---

## 📚 Documentação Complementar

- [N8N_SYNC_RECONCILIATION.md](N8N_SYNC_RECONCILIATION.md) - Diagrama completo
- [audit_missing_subscriptions.sql](audit_missing_subscriptions.sql) - Queries completas
- [sync_n8n_telegram.ps1](sync_n8n_telegram.ps1) - Automação completa

---

**Autor**: GitHub Copilot  
**Data**: 27 de Abril, 2026  
**Status**: ✅ Pronto para produção
