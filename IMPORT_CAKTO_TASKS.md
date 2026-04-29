# Refactor da Importação Cakto — Plano de Execução

> Documento vivo. Atualizar status de cada task à medida que for sendo concluída.
> Status: `[ ]` pendente · `[~]` em progresso · `[x]` concluído · `[!]` bloqueado

---

## Decisões consolidadas (do dono do negócio)

- **Produtos no escopo**: somente `BGM GREEN` (adesão) e `Brabogmvip Renovaçao` (renovação). Ambos mapeiam para o mesmo `productId` no DB. Nenhum outro produto será adicionado no horizonte previsível.
- **Produtos a ignorar**: `Brabogmvip secundario` e qualquer linha com `Tipo da Venda = orderbump` (inclui `Missões E Superodd`). Não criar customer, não criar subscription.
- **Produto desconhecido**: rejeitar import inteiro com erro explícito.
- **Duração**: fixa em **30 dias**, lida de `products.durationDays`. Admin não escolhe ciclo.
- **Cálculo de `endDate`**: `paidAt + 30 dias`, **sempre**. Sem `max(currentEndDate, paidAt)`. Fonte da verdade é o relatório.
- **Múltiplas compras do mesmo cliente**: ordenação ASC por `paidAt` garante que a última compra prevaleça (último `endDate` escrito vence).
- **Parcelado**: uma única linha por venda, ignorar `Parcelas` para fins de assinatura.
- **Reembolso**: `Data do Reembolso` preenchida → cancela a sub correspondente (`status='cancelled'`, `accessGranted=false`, `revokedAt = refundDate`).
- **Chargeback**: mesmo tratamento de reembolso.
- **Renovação órfã** (cliente renovou sem ter adesão registrada): **bloquear e exigir review manual**. Não criar sub silenciosamente.
- **Sweep final**: mantido (expira toda sub `active` com `endDate < now`). Também roda diariamente via cron.
- **Idempotência**: dedup por `saleId` cobrindo paid, refund e chargeback.
- **Validações**: header do TSV obrigatório; modo preview/dry-run obrigatório antes do commit.

---

## Fase 0 — Preparação

- [ ] **0.1** Verificar/garantir que existe um produto `BGM GREEN` em `products` com `durationDays = 30` e capturar seu UUID.
- [x] **0.2** Criar migration Drizzle para nova tabela `cakto_imports` (auditoria de imports).
- [x] **0.3** Criar migration Drizzle para nova tabela `cakto_import_events` com `saleId UNIQUE` (idempotência por linha).
- [x] **0.4** Criar migration Drizzle para nova tabela `cakto_orphan_renewals` (review manual de renovações órfãs).

---

## Fase 1 — Limpeza do contrato (CRÍTICO)

- [x] **1.1** Remover `productId`, `billingCycle`, `skipRefunded`, `importMode` da assinatura de `importCakto` no `customers.service.ts`.
- [x] **1.2** Remover os mesmos campos do DTO/controller (`customers.controller.ts`).
- [x] **1.3** Remover os mesmos campos da UI (`apps/web/src/components/ImportCaktoModal.tsx`).
- [x] **1.4** Substituir UI por: upload do arquivo + botão "Pré-visualizar" + tela de plano + botão "Confirmar importação".

---

## Fase 2 — Mapeamento e parser (CRÍTICO)

- [x] **2.1** Criar constante/módulo `cakto-product-mapping.ts` com whitelist:
  - `"BGM GREEN"` → `{ productSlug: 'bgm-green', flow: 'adhesion' }`
  - `"Brabogmvip Renovaçao"` → `{ productSlug: 'bgm-green', flow: 'renewal' }`
  - `"Brabogmvip secundario"` → `{ action: 'ignore', reason: 'out_of_scope' }`
  - `"Missões E Superodd"` → `{ action: 'ignore', reason: 'orderbump' }`
  - matching exato, case-insensitive, com `trim()` e normalização de espaços.
- [x] **2.2** Criar `CaktoFileParser`:
  - Validar header (46 colunas + nomes esperados). Rejeitar caso contrário.
  - Parsear cada linha em DTO tipado (`CaktoSaleRow`).
  - Validar com Zod: e-mail válido, `paidAt` parseável quando status=paid, `saleId` não vazio.
  - Retornar `{ valid: CaktoSaleRow[], malformed: { lineNumber, error }[] }`.
- [x] **2.3** Calcular SHA-256 do arquivo. Expor no resultado do parse.

---

## Fase 3 — Planner (CRÍTICO)

- [x] **3.1** Criar `CaktoImportPlanner` (puro, sem efeito colateral). Para cada linha válida, classifica em:
  - `Skip` (ignored.byProduct, ignored.byOrderbump, ignored.byStatus)
  - `Reject` (produto desconhecido — aborta o plano todo)
  - `Refund` (`Data do Reembolso` ou `Data do Chargeback` preenchidos)
  - `Adhesion` (BGM GREEN, status=paid)
  - `Renewal` (Brabogmvip Renovaçao, status=paid)
- [x] **3.2** Ordenar ações por `paidAt` ASC, tiebreaker `saleId` ASC.
- [x] **3.3** Para cada ação, anexar o efeito previsto (criar sub, estender, renovar, cancelar, órfão).
- [x] **3.4** Detecção de **renovação órfã**: simulação prévia (consultando DB) — clientes em `Renewal` sem adesão prévia em BGM GREEN nem registro anterior dentro do mesmo lote.
- [x] **3.5** Resultado do planner: `ImportPlan` com sumário + lista detalhada de ações + lista de órfãs + lista de erros/rejeições.

Observação: o preview agora já usa um `cakto-import-planner.ts` dedicado para classificar linhas e gerar sumário/lista de ações; ainda faltam consolidar a ordenação dentro do planner e ampliar o shape do plano para cobrir toda a taxonomia prevista na UI.

---

## Fase 4 — Endpoints preview/commit (CRÍTICO)

- [x] **4.1** Endpoint `POST /customers/import/cakto/preview`:
  - Recebe arquivo, parseia, planeja, retorna `ImportPlan` + `previewId` (cache em memória/Redis, TTL 10 min).
  - Persiste somente o necessário para a fila de review manual de renovações órfãs, além do cache do plano.
  - Se houver renovações órfãs ou produtos desconhecidos → resposta indica bloqueio (commit recusará).
- [x] **4.2** Endpoint `POST /customers/import/cakto/commit`:
  - Recebe `previewId`. Recupera plano do cache.
  - Bloquear se: produto desconhecido, renovações órfãs sem resolução manual.
  - Executa via `CaktoImportExecutor` (Fase 5).
  - Persiste registro em `cakto_imports` (status=in_progress → completed/failed).
  - Retorna sumário final.

Observação: a persistência em `cakto_imports` já está ligada ao fluxo atual de commit, mas o executor ainda não foi separado em `CaktoImportExecutor` nem ganhou lock global.
- [x] **4.3** Lock de import: 1 commit por vez (mutex em memória ou advisory lock no Postgres).

Observação: o lock atual está em memória no `CustomersService`, cobrindo commit e import direto; ainda pode evoluir para advisory lock no Postgres se a aplicação passar a rodar com múltiplas réplicas.

---

## Fase 5 — Executor (CRÍTICO)

- [x] **5.1** Criar `CaktoImportExecutor`. Para cada ação do plano:
  - Verificar `cakto_import_events.saleId` — se existe, marcar como `duplicate`, **nenhuma escrita**.
  - Senão, executar dentro de uma **transação por linha** e inserir o evento no fim (commit atômico por linha).
- [x] **5.2** Ação `Adhesion`:
  - Upsert customer por email.
  - Buscar sub do cliente para BGM GREEN.
  - Se existe → atualizar `endDate = paidAt + 30`, `status` recalculado, `accessGranted` recalculado. Conta como `extended`.
  - Se não existe → criar sub. Conta como `created`.
- [x] **5.3** Ação `Renewal`:
  - Upsert customer por email.
  - Buscar sub do cliente para BGM GREEN.
  - Se existe → atualizar `endDate = paidAt + 30`. Conta como `renewed`.
  - Se não existe → **não criar**. Inserir em `cakto_orphan_renewals` para review manual. Conta como `orphanRenewal`.
- [x] **5.4** Ação `Refund` (inclui chargeback):
  - Buscar sub por `externalId = saleId`.
  - Se encontrada e ativa → marcar `cancelled`, `revokedAt = refundDate ?? chargebackDate`, `accessGranted=false`. Conta como `cancelled`.
  - Se não encontrada → registrar como `refundOrphan`, não bloqueia.
- [x] **5.5** Ação `Skip`/`Reject`: registrar no contador apropriado, gravar `event_logs` mas **não tocar** em customer/sub.
- [x] **5.6** No fim do executor: rodar `expireOverdueSubscriptions()` (sweep).
- [x] **5.7** Persistir resumo final em `cakto_imports.summary` e um `event_logs` consolidado.

---

## Fase 6 — Sweeper desacoplado (IMPORTANTE)

- [x] **6.1** Extrair `expireOverdueSubscriptions()` para serviço próprio (`SubscriptionSweeperService`).
- [~] **6.2** Schedular execução diária via NestJS `@Cron` (ou n8n, conforme convenção do projeto). 03:00 UTC.
- [x] **6.3** Logar quantas subs foram expiradas a cada execução em `event_logs`.

Observação: o cron foi preparado para rodar via n8n no arquivo `wf_expire_overdue_subscriptions.json`, consumindo `POST /integrations/n8n/subscriptions/expire-overdue` com header `x-n8n-secret`. Ainda falta importar/ativar o workflow no ambiente n8n.

---

## Fase 7 — UI (IMPORTANTE)

- [x] **7.1** Refazer `ImportCaktoModal.tsx` em duas etapas:
  - Step 1: Upload + "Pré-visualizar".
  - Step 2: Tela de plano:
    - Sumário (todos os contadores: `total`, `imported`, `renewed`, `expired`, `cancelled`, `skipped`, `duplicates`, `orphanRenewals`, `errors`).
    - Aviso se `cancelled > 10` exigindo confirmação dupla (checkbox obrigatório antes do commit).
    - Bloqueio de commit quando houver `orphanRenewal > 0`.
    - Botão "Confirmar importação" → chama `/commit`.
- [x] **7.2** Após commit, mostrar relatório final com link para histórico (Fase 8).

---

## Fase 8 — Histórico e auditoria (IMPORTANTE)

- [x] **8.1** Página `apps/web/src/pages/CaktoImportsPage.tsx` listando `cakto_imports`.
- [x] **8.2** Drilldown com sumário, plano e logs por linha de cada import.
- [x] **8.3** Endpoint `GET /customers/import/cakto/history` paginado.
- [x] **8.4** Endpoint `GET /customers/import/cakto/:id` com detalhe.

---

## Fase 9 — Renovações órfãs (IMPORTANTE)

- [x] **9.1** Página `apps/web/src/pages/OrphanRenewalsPage.tsx`.
- [x] **9.2** Endpoint para listar pendentes.
- [x] **9.3** Ações disponíveis por órfã:
  - "Aprovar como adesão" → cria sub com `startDate=paidAt`, `endDate=paidAt+30`, `metadata.orphanRenewal=true`.
  - "Rejeitar" → marca como descartada, registra motivo.
- [x] **9.4** Endpoint `POST /customers/orphan-renewals/:id/resolve`.

---

## Fase 10 — Logs e observabilidade (IMPORTANTE)

- [x] **10.1** Logger estruturado (JSON) em todas as decisões do executor: `{ importId, saleId, action, customerEmail, productCaktoName, paidAt, endDate, durationMs }`.
- [x] **10.2** Cada decisão também grava em `event_logs` com tipo `cakto_import.*`.
- [x] **10.3** `cakto_imports` registra: admin, fileName, fileHash, fileSize, startedAt, finishedAt, status, summary jsonb, planSnapshot jsonb.
- [x] **10.4** Detecção de re-import: ao subir arquivo com hash já presente em import concluído, avisar no preview.

Observação: o resumo consolidado do import já grava em `event_logs` com tipo `cakto_import.summary`, e várias decisões por linha já escrevem `cakto_import.*`; ainda falta fechar cobertura total para duplicados e alguns caminhos de erro.

---

## Fase 11 — Testes (CRÍTICO)

- [x] **11.1** Testes unitários `CaktoFileParser`: header inválido, header válido, e-mails inválidos, datas malformadas, encoding UTF-8 com acentos.
- [x] **11.2** Testes unitários `CaktoImportPlanner`: cada classificação, ordenação, detecção de órfãs, produto desconhecido.
- [x] **11.3** Testes de integração `CaktoImportExecutor`:
  - Adesão nova.
  - Renovação sobre adesão existente (renewed).
  - Orderbump ignorado.
  - Duplicata (sem mutação).
  - Refund cancela sub.
  - Sweep executado uma vez ao final.
  - Erro por linha não aborta o run todo.
- [ ] **11.4** Teste E2E preview→commit no arquivo real `xls.txt` (sandbox), conferindo contadores.

---

## Fase 12 — Migração de dados existentes (CRÍTICO antes do go-live)

- [ ] **12.1** Backup do banco de produção.
- [ ] **12.2** Rodar preview do `xls.txt` em ambiente de staging com cópia do banco de produção. Validar contadores.
- [ ] **12.3** Reconciliar manualmente quaisquer discrepâncias antes do commit em produção.
- [ ] **12.4** Executar commit em produção em janela de baixo tráfego.
- [ ] **12.5** Auditoria pós-import: contar subs ativas vs. esperado.

---

## Fase 13 — Nice-to-have (pós go-live)

- [ ] **13.1** Worker assíncrono (BullMQ) para arquivos > 1000 linhas.
- [ ] **13.2** Métricas Prometheus por import.
- [ ] **13.3** Persistir `metadata.installments`, `metadata.coupon`, `metadata.utm`, `metadata.caktoClearingDate` para análises futuras.
- [ ] **13.4** Tabela `cakto_product_mappings` editável via admin (substitui constante hardcoded).
- [ ] **13.5** Notificação por e-mail/Slack quando houver renovações órfãs pendentes.

---

## Convenções

- Todo código novo deve ter typing estrito (sem `any`).
- Toda regra de negócio nova deve ter teste cobrindo.
- Toda escrita no banco deve ser idempotente.
- Logs em JSON estruturado, nunca string concatenada.
- Mensagens de erro em PT-BR para o admin, EN nos logs internos.
