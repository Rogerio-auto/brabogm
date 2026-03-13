#!/usr/bin/env bash
#===============================================================================
# DEPLOY BRABOGM APP
#===============================================================================
# Uso: sudo bash deploy_brabogm.sh
#
# Este script:
#   1. Clona/atualiza o repositório
#   2. Cria o database brabogm no PostgreSQL existente
#   3. Builda as imagens Docker (API + Web)
#   4. Faz deploy da stack (API + Web + PgAdmin)
#   5. A API roda migrations automaticamente no startup (drizzle-kit push)
#
# Pré-requisitos:
#   - Docker Swarm ativo
#   - Rede network_public existente
#   - Stack postgres rodando (postgres_postgres)
#   - Stack traefik rodando
#   - Arquivo /root/.deploy_credentials_<dominio> com credenciais do PG
#===============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_header()  { echo -e "\n${CYAN}════════════════════════════════════════════${NC}\n${BOLD}  $1${NC}\n${CYAN}════════════════════════════════════════════${NC}\n"; }
print_success() { echo -e "${GREEN}✔ $1${NC}"; }
print_error()   { echo -e "${RED}✖ $1${NC}"; }
print_info()    { echo -e "${CYAN}ℹ $1${NC}"; }
print_step()    { echo -e "${BOLD}→ $1${NC}"; }

generate_password() { openssl rand -base64 "$1" | tr -dc 'a-zA-Z0-9' | head -c "$1"; }

#-------------------------------------------------------------------------------
# CONFIGURAÇÃO
#-------------------------------------------------------------------------------
APP_DIR="/opt/brabogm"
REPO_URL="https://github.com/Rogerio-auto/brabogm.git"
REPO_BRANCH="copilot/create-fullstack-management-repo"

print_header "DEPLOY BRABOGM APP"

# Domínio base
read -p "  Domínio base (ex: brabogm.cloud): " BASE_DOMAIN
while [[ -z "$BASE_DOMAIN" ]]; do
    print_error "Domínio é obrigatório."
    read -p "  Domínio base: " BASE_DOMAIN
done

# Tenta carregar credenciais do PG do deploy anterior
CRED_FILE="/root/.deploy_credentials_${BASE_DOMAIN}"
if [[ -f "$CRED_FILE" ]]; then
    print_success "Credenciais encontradas: $CRED_FILE"
    source "$CRED_FILE"
    PG_USER="${POSTGRES_USER:-postgres}"
    PG_PASS="${POSTGRES_PASSWORD}"
else
    print_info "Arquivo de credenciais não encontrado. Informe manualmente:"
    read -p "  Usuário PostgreSQL [postgres]: " PG_USER
    PG_USER="${PG_USER:-postgres}"
    read -sp "  Senha PostgreSQL: " PG_PASS
    echo ""
fi

# Database do brabogm
PG_DB_BRABOGM="brabogm"

# Subdomínios
echo ""
print_info "Subdomínios padrão:"
echo -e "  ${GREEN}app.${BASE_DOMAIN}${NC}     → Painel Web + API"
echo -e "  ${GREEN}pgadmin.${BASE_DOMAIN}${NC}  → PgAdmin"
echo ""

read -p "  Subdomínio do painel [app]: " SUB_WEB
SUB_WEB="${SUB_WEB:-app}"
read -p "  Subdomínio do PgAdmin [pgadmin]: " SUB_PGADMIN
SUB_PGADMIN="${SUB_PGADMIN:-pgadmin}"

DOMAIN_WEB="${SUB_WEB}.${BASE_DOMAIN}"
DOMAIN_PGADMIN="${SUB_PGADMIN}.${BASE_DOMAIN}"

# JWT Secret
JWT_SECRET=$(generate_password 48)

# PgAdmin
read -p "  Email PgAdmin [admin@${BASE_DOMAIN}]: " PGADMIN_EMAIL
PGADMIN_EMAIL="${PGADMIN_EMAIL:-admin@${BASE_DOMAIN}}"
PGADMIN_PASSWORD=$(generate_password 16)
print_info "Senha PgAdmin gerada: ${PGADMIN_PASSWORD}"

echo ""
print_header "RESUMO"
echo -e "  ${BOLD}Painel:${NC}      https://${DOMAIN_WEB}"
echo -e "  ${BOLD}API:${NC}         https://${DOMAIN_WEB}/api"
echo -e "  ${BOLD}Swagger:${NC}     https://${DOMAIN_WEB}/api/docs"
echo -e "  ${BOLD}PgAdmin:${NC}     https://${DOMAIN_PGADMIN}"
echo -e "  ${BOLD}PG User:${NC}     ${PG_USER}"
echo -e "  ${BOLD}PG DB:${NC}       ${PG_DB_BRABOGM}"
echo ""

read -p "  Confirma deploy? (S/n): " CONFIRM
CONFIRM="${CONFIRM:-s}"
if [[ "${CONFIRM,,}" != "s" && "${CONFIRM,,}" != "y" ]]; then
    print_error "Cancelado."
    exit 1
fi

#-------------------------------------------------------------------------------
# 1. CLONAR/ATUALIZAR REPOSITÓRIO
#-------------------------------------------------------------------------------
print_header "1. REPOSITÓRIO"

if [[ -d "$APP_DIR" ]]; then
    print_step "Atualizando repositório..."
    cd "$APP_DIR"
    git fetch origin
    git reset --hard "origin/${REPO_BRANCH}"
    print_success "Repositório atualizado"
else
    print_step "Clonando repositório..."
    git clone -b "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
    print_success "Repositório clonado em $APP_DIR"
fi

#-------------------------------------------------------------------------------
# 2. CRIAR DATABASE BRABOGM NO POSTGRES
#-------------------------------------------------------------------------------
print_header "2. DATABASE"

print_step "Criando database '${PG_DB_BRABOGM}' se não existir..."

# Identifica o container do postgres
PG_CONTAINER=$(docker ps --filter "name=postgres_postgres" --format "{{.ID}}" | head -1)

if [[ -z "$PG_CONTAINER" ]]; then
    print_error "Container PostgreSQL não encontrado! A stack postgres está rodando?"
    exit 1
fi

docker exec "$PG_CONTAINER" psql -U "$PG_USER" -tc \
    "SELECT 1 FROM pg_database WHERE datname = '${PG_DB_BRABOGM}'" | grep -q 1 \
    || docker exec "$PG_CONTAINER" psql -U "$PG_USER" -c \
    "CREATE DATABASE ${PG_DB_BRABOGM} OWNER ${PG_USER};"

print_success "Database '${PG_DB_BRABOGM}' pronto"

#-------------------------------------------------------------------------------
# 3. CRIAR ARQUIVO .env
#-------------------------------------------------------------------------------
print_header "3. ENVIRONMENT"

cat > "$APP_DIR/.env" << EOF
# ── Brabogm App Environment ──
NODE_ENV=production

# ── Database ──
DATABASE_URL=postgresql://${PG_USER}:${PG_PASS}@postgres_postgres:5432/${PG_DB_BRABOGM}
PG_USER=${PG_USER}
PG_PASS=${PG_PASS}
PG_DB_BRABOGM=${PG_DB_BRABOGM}

# ── Auth ──
JWT_SECRET=${JWT_SECRET}

# ── Domains ──
DOMAIN_WEB=${DOMAIN_WEB}
DOMAIN_PGADMIN=${DOMAIN_PGADMIN}
FRONTEND_URL=https://${DOMAIN_WEB}

# ── PgAdmin ──
PGADMIN_EMAIL=${PGADMIN_EMAIL}
PGADMIN_PASSWORD=${PGADMIN_PASSWORD}

# ── Version ──
APP_VERSION=latest
EOF
chmod 600 "$APP_DIR/.env"
print_success ".env criado"

#-------------------------------------------------------------------------------
# 4. BUILD DAS IMAGENS
#-------------------------------------------------------------------------------
print_header "4. BUILD"

print_step "Buildando imagem da API..."
docker build -t brabogm-api:latest -f apps/api/Dockerfile .
print_success "brabogm-api:latest buildada"

print_step "Buildando imagem da Web..."
docker build -t brabogm-web:latest -f apps/web/Dockerfile .
print_success "brabogm-web:latest buildada"

#-------------------------------------------------------------------------------
# 5. DEPLOY DA STACK
#-------------------------------------------------------------------------------
print_header "5. DEPLOY"

print_step "Deployando stack brabogm..."

# Export vars for docker stack
export DOMAIN_WEB DOMAIN_PGADMIN PG_USER PG_PASS PG_DB_BRABOGM JWT_SECRET
export PGADMIN_EMAIL PGADMIN_PASSWORD APP_VERSION=latest

docker stack deploy -c docker-compose.yml brabogm
sleep 10
print_success "Stack brabogm deployada!"

#-------------------------------------------------------------------------------
# 6. SALVAR CREDENCIAIS
#-------------------------------------------------------------------------------
BRABOGM_CRED="/root/.brabogm_credentials_${BASE_DOMAIN}"
cat > "$BRABOGM_CRED" << EOF
#==============================================================================
# CREDENCIAIS BRABOGM - ${BASE_DOMAIN}
# Gerado em: $(date '+%Y-%m-%d %H:%M:%S')
#==============================================================================
DOMAIN_WEB=${DOMAIN_WEB}
DOMAIN_PGADMIN=${DOMAIN_PGADMIN}

DATABASE_URL=postgresql://${PG_USER}:${PG_PASS}@postgres_postgres:5432/${PG_DB_BRABOGM}

JWT_SECRET=${JWT_SECRET}

PGADMIN_EMAIL=${PGADMIN_EMAIL}
PGADMIN_PASSWORD=${PGADMIN_PASSWORD}
EOF
chmod 600 "$BRABOGM_CRED"

#-------------------------------------------------------------------------------
# 7. HEALTH CHECK
#-------------------------------------------------------------------------------
print_header "6. HEALTH CHECK"

sleep 5
SERVICES=("brabogm_api" "brabogm_web" "brabogm_pgadmin")
ALL_OK=true

for svc in "${SERVICES[@]}"; do
    RUNNING=$(docker service ls --filter "name=${svc}" --format "{{.Replicas}}" 2>/dev/null || echo "0/0")
    if echo "$RUNNING" | grep -q "1/1"; then
        print_success "${svc}: ${RUNNING}"
    else
        print_error "${svc}: ${RUNNING} (pode estar iniciando...)"
        ALL_OK=false
    fi
done

#-------------------------------------------------------------------------------
# RESUMO FINAL
#-------------------------------------------------------------------------------
echo ""
print_header "🎉 DEPLOY BRABOGM CONCLUÍDO!"
echo ""
echo -e "  ${BOLD}Painel Web:${NC}     https://${DOMAIN_WEB}"
echo -e "  ${BOLD}API:${NC}            https://${DOMAIN_WEB}/api"
echo -e "  ${BOLD}Swagger Docs:${NC}   https://${DOMAIN_WEB}/api/docs"
echo -e "  ${BOLD}PgAdmin:${NC}        https://${DOMAIN_PGADMIN}"
echo -e "  ${BOLD}PgAdmin Login:${NC}  ${PGADMIN_EMAIL} / ${PGADMIN_PASSWORD}"
echo ""
echo -e "  ${BOLD}Credenciais:${NC}    ${BRABOGM_CRED}"
echo ""
print_info "A API roda migrations automaticamente no startup."
print_info "Para atualizar: sudo bash ${APP_DIR}/deploy_brabogm.sh"
echo ""
print_info "DNS necessários (Tipo A para IP do servidor):"
echo -e "  ${BOLD}${SUB_WEB}.${BASE_DOMAIN}${NC}      → IP do servidor"
echo -e "  ${BOLD}${SUB_PGADMIN}.${BASE_DOMAIN}${NC}   → IP do servidor"
echo ""
