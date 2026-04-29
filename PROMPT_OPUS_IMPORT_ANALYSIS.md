# Prompt Curador — Análise Completa da Funcionalidade de Importação Cakto

> Passe este prompt integralmente ao Claude Opus 4.7. Ele contém todo o contexto necessário para uma análise exaustiva.

---

## Contexto do Sistema

Você está analisando um sistema SaaS interno de gestão de assinantes chamado **Brabogm**. É um monorepo com:

- **Backend**: NestJS + Drizzle ORM + PostgreSQL
- **Frontend**: React 18 + Vite + TailwindCSS
- **Plataforma de vendas**: Cakto (gateway de pagamentos brasileiro)
- **Automação**: n8n (cria assinaturas via webhook quando uma venda é feita na Cakto)

O sistema gerencia **clientes** (`customers`) e suas **assinaturas** (`subscriptions`). A Cakto não tem integração nativa com o sistema — vendas entram via webhook n8n em tempo real, mas também existe a necessidade de **importar relatórios históricos exportados da Cakto** em formato TSV (tab-separated).

---

## O Problema Central

A funcionalidade de importação (`importCakto`) precisa ser o **mecanismo de reconciliação definitivo** entre o que a Cakto registrou e o que está no banco de dados. Não é apenas "criar registros que faltam" — é garantir que o estado do banco seja uma representação fiel e correta da realidade comercial.

---

## Estrutura Real do Arquivo Cakto

O arquivo exportado é um TSV com 46 colunas. Segue o mapeamento completo dos índices:

```
0  = ID da Venda
1  = Status da Venda
2  = URL de Checkout
3  = Produto
4  = Checkout
5  = Venda Pai
6  = Assinatura
7  = Período da Assinatura
8  = Tipo da Venda
9  = Id da Oferta
10 = Oferta
11 = Valor Base do Produto
12 = Desconto
13 = Valor Pago pelo Cliente
14 = Taxas
15 = Juros Adicional de Parcelamento
16 = Motivo de Recusa
17 = Cupom de desconto
18 = Porcentagem de desconto
19 = Motivo do reembolso
20 = Comissão
21 = Método de Pagamento
22 = Parcelas
23 = Tipo do Produto
24 = Afiliado
25-30 = UTM params + tracking
33 = Data da Venda
34 = Data de Agendamento do Pagamento
35 = Data de Pagamento
36 = Data estimada de Liberação
37 = Data do Reembolso
38 = Data do Chargeback
39 = Data de Cancelamento do Pagamento
40 = Nome do Cliente
41 = Email do Cliente
42 = Telefone do Cliente
43 = Data de Nascimento do Cliente
44 = Tipo de Documento do Cliente
45 = Número do Documento do Cliente
```

---

## Dados Reais do Arquivo de Produção (xls.txt, exportado em 2026-04-29)

```
TOTAL DE LINHAS    = 679
STATUS=paid        = 581
COM REEMBOLSO      = 34 (campo "Data do Reembolso" preenchido)

TIPOS DE VENDA (col 8):
  main       = 665
  orderbump  = 14
  [IMPORTANTE: Cakto NUNCA exporta "renewal" no campo Tipo da Venda]

PRODUTOS (col 3):
  BGM GREEN            = 557   → produto principal (adesão)
  Brabogmvip secundario = 83   → produto desconhecido (ver perguntas abaixo)
  Brabogmvip Renovaçao  = 25   → produto de renovação (nome contém "Renova")
  Missões E Superodd    = 14   → orderbump (todos os 14 orderbumps)
```

**Amostra de linhas BGM GREEN (adesões):**
```
ID=3AfFGk7 | TIPO=main | PAGO=2026-04-29 12:45:42 | LIB_EST=2026-04-30 12:44:58 | PRODUTO=BGM GREEN
ID=VvdacNd | TIPO=main | PAGO=2026-04-29 10:59:45 | LIB_EST=2026-04-30 10:59:24 | PRODUTO=BGM GREEN
```

**Amostra de linhas Renovação:**
```
ID=6wHKHlo | TIPO=main | VENDAPAI= | PAGO=2026-04-29 13:00:58 | LIB_EST=2026-04-30 13:00:13 | PRODUTO=Brabogmvip Renovaçao
ID=8r5ySta | TIPO=main | VENDAPAI= | PAGO=2026-04-26 5:23:39  | LIB_EST=2026-04-27 5:23:05  | PRODUTO=Brabogmvip Renovaçao
```

**Observação crítica sobre as datas:**
- `Data de Pagamento` = quando o pagamento aconteceu
- `Data estimada de Liberação` = **sempre ~1 dia depois** do pagamento
  - Esta data é o prazo de compensação bancária, **não** a data de fim da assinatura
  - A duração da assinatura NÃO está no arquivo da Cakto — precisa ser inferida ou configurada externamente

---

## Schema do Banco de Dados

### `customers`
```sql
id uuid PK
name varchar
email varchar UNIQUE
document varchar
status varchar ('active' | 'inactive')
externalId varchar
createdAt timestamp
updatedAt timestamp
```

### `subscriptions`
```sql
id uuid PK
customerId uuid FK → customers.id
productId uuid FK → products.id
status varchar ('pending' | 'active' | 'expired' | 'cancelled' | 'suspended')
accessType varchar ('paid' | 'trial' | 'manual')
accessGranted boolean
startDate timestamp
endDate timestamp
trialEndDate timestamp
revokedAt timestamp
cancelledAt timestamp
amount numeric
currency varchar
billingCycle varchar ('monthly' | 'quarterly' | 'semiannual' | 'yearly')
externalId varchar  ← usado para dedup por ID da Venda Cakto
metadata jsonb
createdAt timestamp
updatedAt timestamp
```

### `products`
```sql
id uuid PK
name varchar
slug varchar
durationDays integer
```

---

## Implementação Atual (customers.service.ts — método importCakto)

A assinatura atual do método:

```typescript
async importCakto(
  fileBuffer: Buffer,
  productId: string,          // UUID do produto no DB — selecionado manualmente pelo admin
  billingCycle: string,       // 'monthly' | 'quarterly' | 'semiannual' | 'yearly' — selecionado manualmente
  skipRefunded: boolean,      // se true, pula linhas com reembolso sem processá-las
  importMode: 'auto' | 'force_new' | 'force_renewal',
): Promise<{
  total: number;
  imported: number;
  renewed: number;
  expired: number;
  cancelled: number;
  skipped: number;
  duplicates: number;
  errors: Array<{ saleId: string; error: string }>;
}>
```

**Lógica atual resumida (por ordem de execução para cada linha):**

1. Extrai campos da linha
2. Detecta `isRenovacaoProduct = /renova/i.test(productName)` → saleType = 'renewal'
3. Detecta `isOrderbump` → skipa se Tipo da Venda = 'orderbump'
4. Se tem reembolso:
   - Se `skipRefunded=true` → skipa
   - Se `skipRefunded=false` → depois do upsert do cliente, cancela todas as subs ativas dele
5. Pula se `status !== 'paid'` e não tem reembolso
6. Calcula `endDate = paidAt + durationDays` (onde durationDays vem do billingCycle selecionado pelo admin)
7. Calcula `effectiveStatus = endDate < now ? 'expired' : 'active'`
8. Faz dedup por `externalId` (saleId)
9. Faz upsert atômico do cliente (`INSERT ON CONFLICT (email) DO UPDATE`)
10. **Fluxo RENEWAL**: busca sub existente por parentSaleId → fallback: sub mais recente do cliente em qualquer produto → estende endDate
11. **Fluxo MAIN/UPSELL**: busca sub existente do cliente para aquele productId → se existe, estende; se não existe, cria nova
12. **Sweep final**: `UPDATE subscriptions SET status='expired' WHERE status='active' AND endDate <= now`

**Resultado da UI**: 7 contadores: Total / Novos / Renovados / Expirados / Cancelados / Ignorados / Duplicados

---

## Limitações e Ambiguidades Conhecidas

1. **Um productId para tudo**: o admin seleciona um único produto no formulário de importação. Mas o arquivo tem 4 produtos diferentes. Linhas de "Brabogmvip secundario" e "Brabogmvip Renovaçao" seriam todas mapeadas para o mesmo productId selecionado. R= Esse relatório é geral de todos os produtos, então deve ter a opção do usuário não precisar selecionar o produto.

2. **"Brabogmvip secundario"**: não sabemos o que é este produto. São 83 linhas com status paid. É um produto separado com acesso diferente? É um segundo acesso do mesmo cliente? É um produto interno (ex: acesso de indicados)? A lógica atual vai criar uma sub nova para cada um desses 83, todos linkados ao mesmo productId que o admin escolheu. R= Esse produto, pode ser desconsiderado, não precisa importar ou criar ele no banco de dados nem o registro dos leads (se for o caso)

3. **Duração da assinatura não está no arquivo**: a `Data estimada de Liberação` é apenas clearing bancário (~1 dia). A duração real (30/90/180/365 dias) é configurada pelo admin no formulário. Se o admin errar esse campo, todas as datas ficam erradas.

4. **Venda Pai sempre vazio para renovações**: no arquivo real, renovações têm `Tipo da Venda=main` e `Venda Pai=""`. O sistema detecta renovações pelo nome do produto (`/renova/i`). A busca por `parentSaleId` nunca vai encontrar nada — o fallback sempre vai direto ao "sub mais recente do cliente".

5. **Extensão de endDate para renovações**: a lógica atual usa `max(endDate atual, paidAt) + durationDays`. Se um cliente que expirou em março renova em abril, o base será `paidAt` de abril → endDate = abril + 30 dias. Mas se um cliente que ainda está ativo em junho renova em abril, o base será o endDate de junho → endDate = junho + 30 dias. Essa lógica faz sentido? Está alinhada com o modelo de negócio? R= Não! Deve ser considerado a data de pagamento mais 30 dias e marcar o endDate com a soma de +30 dias a partir da tada de pagamento independente do que está registrado no banco de dados, a fonte da verdade vem do relatório 

6. **Crédito em cartão parcelado**: o arquivo tem campo `Parcelas`. Se alguém pagou BGM GREEN em 12x, esse pagamento aparece como uma única linha com `Parcelas=12` ou como 12 linhas separadas? Qual é o comportamento correto para parcelado? R= Com uma unica linha somente, e não deve interferir na assinatura os pagamentos parcelados.

7. **Importações múltiplas do mesmo arquivo**: o dedup por saleId funciona para linhas paid sem reembolso. Mas se uma linha de reembolso é importada duas vezes, ela vai cancelar a sub e depois tentar cancelar de novo (que vai ser um no-op, mas conta como +1 cancelled).

8. **O sweep final é perigoso?**: após o import, o sistema expira TODAS as subs ativas com endDate < now — independentemente de terem vindo do arquivo ou não. Isso inclui subs criadas manualmente por admin, subs de trial, etc. É intencional? R= Sim, é intencional

9. **Produto "BGM GREEN" no DB**: qual é o `billingCycle` correto para BGM GREEN? Mensal? Trimestral? O admin precisa saber isso antes de importar. Não há validação no formulário que impeça selecionar o ciclo errado. R= É 30 dias por padrão na importação

10. **Fluxo MAIN existente por email+productId**: quando um cliente "paid" já tem uma sub para aquele produto, o sistema ESTENDE o endDate (como se fosse renovação). Mas pode ser que o cliente simplesmente comprou duas vezes erroneamente. Essa extensão automática é sempre correta? R= Se existir registro de multiplas compras no relatório para o mesmo cliente, sempre deve ser considerado a compra mais recente, assim é garantido que o registro desse cliente está atualizado no banco de dados, esse comportamento estou considerando que o cliente não cometeu por erro, comprar duas vezes, e sim intencionalmente.

---

## O Que Precisa Ser Analisado

Faça uma análise completa e honesta dos seguintes aspectos:

### 1. Modelo de dados e endDate
- A `Data estimada de Liberação` deveria ser usada de alguma forma para calcular o endDate, ou o billingCycle selecionado pelo admin é o único mecanismo correto?
- Existe alguma forma de inferir a duração da assinatura a partir do arquivo?
- O campo `Período da Assinatura` (col 7) poderia ter essa informação?

### 2. Multi-produto
- Como o sistema deveria lidar com arquivos que contêm múltiplos produtos?
- Faz sentido permitir importar tudo com um único productId selecionado?
- Alternativa: mapeamento produto Cakto → produto DB no formulário de importação?

### 3. "Brabogmvip secundario"
- Dado que são 83 linhas, isso é relevante demais para ignorar
- Que perguntas deveriam ser feitas ao dono do negócio para entender o que fazer com esse produto?
- Como a lógica deveria tratar esse produto até que haja clareza?

### 4. Renovações e extensão de endDate
- A lógica de `max(current endDate, paidAt) + durationDays` é semanticamente correta?
- O que deveria acontecer se um cliente paga pela renovação mas já está expirado há 3 meses?
- E se a renovação chega no meio do ciclo ativo (ex: renova no mês 1 de 12)?

### 5. Dedup e idempotência
- O dedup atual (por saleId) é suficiente para garantir idempotência?
- O que acontece se o mesmo arquivo for importado 3 vezes?
- Linhas de reembolso importadas duas vezes — é problemático?

### 6. Sweep final
- O sweep que expira todas as subs ativas com endDate < now é uma operação segura?
- Deveria ser restrita apenas às subs criadas via import (metadata.source = 'cakto_import')?
- Deveria ser uma operação separada (não acoplada ao import)?

### 7. Cartão de crédito parcelado
- Como parcelamento deveria ser tratado?
- Uma venda de 12x cria 1 sub de 12 meses ou 12 subs de 1 mês cada?

### 8. Lacunas de validação
- Que validações estão faltando no formulário de importação?
- O admin deveria ser alertado de algo antes de confirmar a importação?
- Deveria haver um modo "dry run" (simular sem gravar) antes do import real?

### 9. Ordem de processamento
- As linhas são ordenadas por `Data de Pagamento ASC`. Isso é suficiente para garantir que adesões sejam processadas antes de renovações?
- O que acontece se uma renovação aparecer antes da adesão no arquivo?

### 10. Arquitetura geral
- A abordagem atual (um endpoint que faz tudo: parse, reconciliação, sweep) é sustentável?
- Que refatorações de design fariam sentido à medida que o volume cresce?
- Que métricas/logs seriam necessários para auditar o que aconteceu em cada import?

---

## Formato Esperado da Resposta

Estruture sua análise em seções. Para cada questão:

1. **Diagnóstico**: o que está acontecendo hoje / qual é o risco ou lacuna
2. **Recomendação**: o que deveria ser feito, com justificativa
3. **Impacto**: se não for corrigido, o que pode dar errado em produção

Ao final, produza:
- Uma **lista priorizada de mudanças** (crítico / importante / nice-to-have)
- Uma **especificação funcional** resumida do que o import deveria fazer, escrita como requisitos, não como código

Seja direto. Não repita contexto desnecessariamente. Se uma questão não tem resposta clara sem mais informações do dono do negócio, diga explicitamente quais perguntas precisam ser feitas antes de implementar.
