#!/bin/bash
# Script para testar o workflow de sincronização de Telegram

set -e

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Brabogm Telegram Sync Workflow Tester ===${NC}\n"

# 1. Verificar se curl está disponível
if ! command -v curl &> /dev/null; then
    echo -e "${RED}❌ curl não está instalado${NC}"
    exit 1
fi

# 2. Definir variáveis
WEBHOOK_URL="https://auto.brabogm.cloud/webhook/brabogm-sync-telegram"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-brabogm_user}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="brabogm"

# 3. Menu de teste
echo -e "${YELLOW}Escolha uma opção:${NC}"
echo "1) Testar webhook (sem payload)"
echo "2) Sincronizar um telegram_id específico"
echo "3) Listar customers com Telegram (para pegar IDs)"
echo "4) Ver últimos eventos de sync no banco"
echo "5) Sair"
echo ""
read -p "Digite sua escolha (1-5): " choice

case $choice in
    1)
        echo -e "\n${YELLOW}📡 Testando webhook...${NC}"
        RESPONSE=$(curl -s -X POST "$WEBHOOK_URL" \
          -H "Content-Type: application/json" \
          -d '{"action":"test","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}')
        
        if echo "$RESPONSE" | grep -q "success"; then
            echo -e "${GREEN}✅ Webhook respondeu com sucesso${NC}"
            echo "Resposta: $RESPONSE"
        else
            echo -e "${RED}❌ Webhook retornou erro${NC}"
            echo "Resposta: $RESPONSE"
            exit 1
        fi
        ;;
    
    2)
        read -p "Digite o telegram_id a sincronizar: " TELEGRAM_ID
        
        if [[ ! "$TELEGRAM_ID" =~ ^[0-9]+$ ]]; then
            echo -e "${RED}❌ telegram_id inválido (deve ser número)${NC}"
            exit 1
        fi
        
        echo -e "\n${YELLOW}📡 Sincronizando telegram_id: $TELEGRAM_ID${NC}"
        RESPONSE=$(curl -s -X POST "$WEBHOOK_URL" \
          -H "Content-Type: application/json" \
          -d '{
            "telegram_id": '$TELEGRAM_ID',
            "action": "sync_subscription",
            "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
          }')
        
        echo "Resposta: $RESPONSE"
        
        if echo "$RESPONSE" | grep -q "success"; then
            echo -e "${GREEN}✅ Sincronização iniciada${NC}"
        else
            echo -e "${RED}❌ Erro na sincronização${NC}"
        fi
        ;;
    
    3)
        echo -e "\n${YELLOW}📋 Customers com Telegram no banco${NC}"
        echo "Conectando ao banco em $DB_HOST:$DB_PORT..."
        
        if [[ -z "$DB_PASSWORD" ]]; then
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
            SELECT 
              c.id,
              c.name,
              cc.external_id as telegram_id,
              cc.identifier as username,
              COALESCE(s.status, 'SEM SUB') as subscription_status
            FROM customers c
            LEFT JOIN customer_contacts cc ON cc.customer_id = c.id AND cc.channel = 'telegram'
            LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'pending')
            WHERE cc.external_id IS NOT NULL
            ORDER BY c.created_at DESC
            LIMIT 20;"
        else
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
            SELECT 
              c.id,
              c.name,
              cc.external_id as telegram_id,
              cc.identifier as username,
              COALESCE(s.status, 'SEM SUB') as subscription_status
            FROM customers c
            LEFT JOIN customer_contacts cc ON cc.customer_id = c.id AND cc.channel = 'telegram'
            LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'pending')
            WHERE cc.external_id IS NOT NULL
            ORDER BY c.created_at DESC
            LIMIT 20;"
        fi
        ;;
    
    4)
        echo -e "\n${YELLOW}📊 Últimos eventos de sincronização${NC}"
        echo "Conectando ao banco em $DB_HOST:$DB_PORT..."
        
        if [[ -z "$DB_PASSWORD" ]]; then
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
            SELECT 
              type,
              customer_id,
              source,
              (payload->>'telegram_id')::text as telegram_id,
              CASE 
                WHEN payload->>'subscription_created' = 'true' THEN '✅ Criada'
                WHEN type = 'telegram.sync_skipped' THEN '⏭️ Pulada'
                ELSE '📝 Log'
              END as acao,
              created_at
            FROM event_logs
            WHERE type LIKE 'telegram.%'
            ORDER BY created_at DESC
            LIMIT 20;"
        else
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
            SELECT 
              type,
              customer_id,
              source,
              (payload->>'telegram_id')::text as telegram_id,
              CASE 
                WHEN payload->>'subscription_created' = 'true' THEN '✅ Criada'
                WHEN type = 'telegram.sync_skipped' THEN '⏭️ Pulada'
                ELSE '📝 Log'
              END as acao,
              created_at
            FROM event_logs
            WHERE type LIKE 'telegram.%'
            ORDER BY created_at DESC
            LIMIT 20;"
        fi
        ;;
    
    5)
        echo -e "${GREEN}Saindo...${NC}"
        exit 0
        ;;
    
    *)
        echo -e "${RED}❌ Opção inválida${NC}"
        exit 1
        ;;
esac

echo -e "\n${GREEN}✅ Operação concluída${NC}"
