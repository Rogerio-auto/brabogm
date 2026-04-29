-- ============================================================
-- SCRIPT: Auditoria de Leads sem Assinatura (Abr/2026)
-- Objetivo: Identificar customers com Telegram cadastrado mas
--           sem subscription ativa
-- ============================================================

-- 1️⃣ LEADS SEM ASSINATURA (com Telegram)
SELECT
  c.id::text as customer_id,
  c.name,
  c.email,
  c.status as customer_status,
  c.created_at,
  cc_tg.external_id as telegram_id,
  cc_tg.identifier as telegram_username,
  cc_wa.identifier as whatsapp_number,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status IN ('active', 'pending')) as active_subs,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'paid') as paid_payments,
  MAX(p.paid_at) as last_payment_date
FROM customers c
JOIN customer_contacts cc_tg 
  ON cc_tg.customer_id = c.id 
  AND cc_tg.channel = 'telegram'
LEFT JOIN customer_contacts cc_wa 
  ON cc_wa.customer_id = c.id 
  AND cc_wa.channel = 'whatsapp'
LEFT JOIN subscriptions s 
  ON s.customer_id = c.id
LEFT JOIN payments p 
  ON p.customer_id = c.id
GROUP BY c.id, c.name, c.email, c.status, c.created_at, 
         cc_tg.external_id, cc_tg.identifier, cc_wa.identifier
HAVING COUNT(DISTINCT s.id) FILTER (WHERE s.status IN ('active', 'pending')) = 0
ORDER BY c.created_at DESC;

-- 2️⃣ CONTAGEM POR STATUS
SELECT 
  c.status,
  COUNT(DISTINCT c.id) as total_customers,
  COUNT(DISTINCT cc_tg.customer_id) as with_telegram,
  COUNT(DISTINCT cc_wa.customer_id) as with_whatsapp,
  COUNT(DISTINCT CASE WHEN s.id IS NOT NULL AND s.status IN ('active', 'pending') THEN c.id END) as with_active_sub
FROM customers c
LEFT JOIN customer_contacts cc_tg ON cc_tg.customer_id = c.id AND cc_tg.channel = 'telegram'
LEFT JOIN customer_contacts cc_wa ON cc_wa.customer_id = c.id AND cc_wa.channel = 'whatsapp'
LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'pending')
GROUP BY c.status
ORDER BY total_customers DESC;

-- 3️⃣ EXPORT PARA N8N WEBHOOK (membros a sincronizar)
-- Use o resultado como payload para:
-- POST https://auto.brabogm.cloud/webhook/brabogm-import-tg
SELECT 
  jsonb_build_object(
    'members',
    jsonb_agg(
      jsonb_build_object(
        'user_id', cc.external_id,
        'first_name', c.name,
        'username', cc.identifier,
        'email', c.email
      )
    )
  ) as webhook_payload
FROM customers c
JOIN customer_contacts cc 
  ON cc.customer_id = c.id 
  AND cc.channel = 'telegram'
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.customer_id = c.id
    AND s.status IN ('active', 'pending')
    AND (s.end_date IS NULL OR s.end_date > CURRENT_DATE)
);

-- 4️⃣ PREVIEW: Primeiros 5 sem assinatura
SELECT
  c.name,
  c.email,
  cc_tg.external_id as telegram_id,
  cc_wa.identifier as whatsapp
FROM customers c
JOIN customer_contacts cc_tg 
  ON cc_tg.customer_id = c.id AND cc_tg.channel = 'telegram'
LEFT JOIN customer_contacts cc_wa 
  ON cc_wa.customer_id = c.id AND cc_wa.channel = 'whatsapp'
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.customer_id = c.id
    AND s.status IN ('active', 'pending')
)
LIMIT 5;

-- 5️⃣ CRIAR SUBSCRIPTIONS AUTOMATICAMENTE (para os que faltam)
-- ⚠️ Descomente e execute apenas após validar com os 5 acima!
/*
INSERT INTO subscriptions (
  customer_id, product_id, status, access_type,
  access_granted, start_date, end_date,
  amount, currency, billing_cycle
)
SELECT
  c.id,
  (SELECT id FROM products WHERE name = 'VIP' LIMIT 1) as product_id,
  'active' as status,
  'telegram_onboarding' as access_type,
  true as access_granted,
  CURRENT_DATE as start_date,
  CURRENT_DATE + INTERVAL '3 days' as end_date,
  0 as amount,
  'BRL' as currency,
  'monthly' as billing_cycle
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s
  WHERE s.customer_id = c.id
    AND s.status IN ('active', 'pending')
)
AND EXISTS (
  SELECT 1 FROM customer_contacts cc
  WHERE cc.customer_id = c.id AND cc.channel = 'telegram'
)
RETURNING c.id, subscription_id, customer_id;
*/
