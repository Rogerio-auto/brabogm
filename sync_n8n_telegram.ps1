#!/usr/bin/env pwsh
# ============================================================
# SCRIPT: Sincronização N8N de Leads Telegram sem Assinatura
# Objetivo: Detectar e sincronizar membros sem subscription
# ============================================================

param(
    [switch]$DryRun = $false,
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$N8nApiUrl = $env:N8N_API_URL,
    [string]$N8nApiKey = $env:N8N_APIKEY_MORAL
)

$ErrorActionPreference = "Stop"

Write-Host "🔍 N8N Telegram Sync - Iniciando..." -ForegroundColor Cyan

# 1️⃣ Validar variáveis
if (-not $DatabaseUrl -or -not $N8nApiUrl -or -not $N8nApiKey) {
    Write-Host "❌ Erro: Variáveis de ambiente não definidas." -ForegroundColor Red
    Write-Host "   Defina: DATABASE_URL, N8N_API_URL, N8N_APIKEY_MORAL" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Variáveis carregadas" -ForegroundColor Green
Write-Host "   DB: $(($DatabaseUrl.Split('@')[1] -split '/')[0])" -ForegroundColor Gray
Write-Host "   N8N URL: $N8nApiUrl" -ForegroundColor Gray

# 2️⃣ Query de leads sem assinatura
$query = @"
SELECT 
  c.id::text as customer_id,
  c.name,
  c.email,
  cc_tg.external_id as telegram_id,
  cc_tg.identifier as telegram_username,
  cc_wa.identifier as whatsapp_number,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status IN ('active', 'pending')) as active_subs
FROM customers c
JOIN customer_contacts cc_tg 
  ON cc_tg.customer_id = c.id AND cc_tg.channel = 'telegram'
LEFT JOIN customer_contacts cc_wa 
  ON cc_wa.customer_id = c.id AND cc_wa.channel = 'whatsapp'
LEFT JOIN subscriptions s ON s.customer_id = c.id
GROUP BY c.id, c.name, c.email, cc_tg.external_id, cc_tg.identifier, cc_wa.identifier
HAVING COUNT(DISTINCT s.id) FILTER (WHERE s.status IN ('active', 'pending')) = 0
ORDER BY c.created_at DESC;
"@

Write-Host "`n📊 Consultando banco de dados..." -ForegroundColor Cyan

try {
    # Executar query com PostgreSQL
    $pgConnectionString = $DatabaseUrl -replace "^postgresql://", "postgres://"
    $pgConnectionString = $pgConnectionString -replace "^postgres://", "Host=127.0.0.1;Port=5432;Username=postgres;Password=;Database=brabogm;"
    
    # Simplificado: usar psql se disponível
    $members = @()
    
    # Tentar com psql
    if (Get-Command psql -ErrorAction SilentlyContinue) {
        $pgpassfile = "$env:TEMP\.pgpass"
        $pgpass = $DatabaseUrl -match "([^:]+):([^@]+)@([^:]+):(\d+)/(.+)$"
        if ($pgpass) {
            $user, $pass, $host, $port, $db = $Matches[1,2,3,4,5]
            Add-Content -Path $pgpassfile -Value "$host`:$port`:$db`:$user`:$pass" -Force
            attrib +h $pgpassfile
            
            $result = psql -h $host -U $user -d $db -c $query -t -A -F "|"
            $members = $result -split "`n" | Where-Object { $_ } | ForEach-Object {
                $parts = $_ -split "\|"
                @{
                    customer_id = $parts[0]
                    name = $parts[1]
                    email = $parts[2]
                    telegram_id = $parts[3]
                    telegram_username = $parts[4]
                    whatsapp_number = $parts[5]
                    active_subs = [int]$parts[6]
                }
            }
            
            Remove-Item $pgpassfile -Force -ErrorAction SilentlyContinue
        }
    }
    
    if ($members.Count -eq 0) {
        Write-Host "⚠️  Nenhum membro sem assinatura encontrado" -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host "✅ Encontrados $($members.Count) membros sem assinatura" -ForegroundColor Green
    Write-Host "`n📋 Lista:" -ForegroundColor Cyan
    $members | ForEach-Object {
        Write-Host "   • $($_.name) ($($_.email)) - TG:$($_.telegram_id)" -ForegroundColor Gray
    }
    
} catch {
    Write-Host "❌ Erro ao consultar banco: $_" -ForegroundColor Red
    Write-Host "`n💡 Fallback: Execute manualmente:" -ForegroundColor Yellow
    Write-Host "   psql \$DATABASE_URL < audit_missing_subscriptions.sql" -ForegroundColor Gray
    exit 1
}

# 3️⃣ Preparar payload para N8N webhook
$payload = @{
    members = $members | ForEach-Object {
        @{
            user_id = $_.telegram_id
            first_name = $_.name
            username = $_.telegram_username
            email = $_.email
        }
    }
} | ConvertTo-Json -Depth 10

Write-Host "`n📤 Preparando payload para n8n..." -ForegroundColor Cyan
Write-Host "   Tamanho: $($payload.Length) bytes" -ForegroundColor Gray
Write-Host "   Membros: $($payload | ConvertFrom-Json | Select-Object -ExpandProperty members | Measure-Object | Select-Object -ExpandProperty Count)" -ForegroundColor Gray

if ($DryRun) {
    Write-Host "`n🔄 DRY RUN: Payload pronto (sem enviar)" -ForegroundColor Yellow
    Write-Host "   Para executar de verdade, remova -DryRun:" -ForegroundColor Gray
    Write-Host "   .\sync_n8n_telegram.ps1" -ForegroundColor Gray
    exit 0
}

# 4️⃣ Chamar webhook n8n
Write-Host "`n🚀 Sincronizando com n8n..." -ForegroundColor Cyan

try {
    $headers = @{
        "Content-Type" = "application/json"
        "X-N8N-API-KEY" = $N8nApiKey
    }
    
    $response = Invoke-RestMethod `
        -Uri "$N8nApiUrl/webhook/brabogm-import-tg" `
        -Method Post `
        -Headers $headers `
        -Body $payload `
        -TimeoutSec 30
    
    Write-Host "✅ Webhook disparado com sucesso!" -ForegroundColor Green
    Write-Host "   Resposta: $($response | ConvertTo-Json)" -ForegroundColor Gray
    
    Write-Host "`n📊 Resumo:" -ForegroundColor Cyan
    Write-Host "   ✓ Processados: $($members.Count) membros" -ForegroundColor Green
    Write-Host "   ✓ Assinaturas serão criadas automaticamente no n8n" -ForegroundColor Green
    Write-Host "   ✓ Mensagens Telegram/WhatsApp serão enviadas" -ForegroundColor Green
    
    Write-Host "`n💾 Verificar resultado em:" -ForegroundColor Yellow
    Write-Host "   SELECT * FROM event_logs WHERE type = 'telegram.access_granted' OR type LIKE '%import%' ORDER BY created_at DESC LIMIT 20;" -ForegroundColor Gray
    
} catch {
    Write-Host "❌ Erro ao chamar webhook: $_" -ForegroundColor Red
    Write-Host "`n💡 Verifique:" -ForegroundColor Yellow
    Write-Host "   1. N8N_API_URL está correto: $N8nApiUrl" -ForegroundColor Gray
    Write-Host "   2. N8N_APIKEY_MORAL tem permissão para executar webhooks" -ForegroundColor Gray
    Write-Host "   3. Workflow 'Brabogm - Importar Membros Telegram' está ativo" -ForegroundColor Gray
    exit 1
}
