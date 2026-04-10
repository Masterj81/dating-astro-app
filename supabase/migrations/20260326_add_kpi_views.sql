CREATE OR REPLACE VIEW public.promo_campaign_kpi_summary
WITH (security_invoker = true)
AS
SELECT
  c.code,
  c.platform,
  c.billing_cycle,
  c.reward_type,
  c.active,
  COUNT(r.*) AS total_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'pending') AS pending_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'checkout_completed') AS checkout_completed_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'consumed') AS consumed_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'failed') AS failed_redemptions,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE r.status = 'consumed') / NULLIF(COUNT(r.*), 0),
    2
  ) AS consumed_rate_pct,
  MIN(r.created_at) AS first_redemption_at,
  MAX(r.created_at) AS latest_redemption_at
FROM public.promo_campaigns c
LEFT JOIN public.promo_campaign_redemptions r
  ON r.campaign_code = c.code
 AND r.platform = c.platform
GROUP BY
  c.code,
  c.platform,
  c.billing_cycle,
  c.reward_type,
  c.active;

CREATE OR REPLACE VIEW public.promo_campaign_kpi_daily
WITH (security_invoker = true)
AS
SELECT
  DATE_TRUNC('day', r.created_at)::date AS day,
  r.campaign_code,
  r.platform,
  COUNT(*) AS total_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'pending') AS pending_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'checkout_completed') AS checkout_completed_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'consumed') AS consumed_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'failed') AS failed_redemptions
FROM public.promo_campaign_redemptions r
GROUP BY
  DATE_TRUNC('day', r.created_at)::date,
  r.campaign_code,
  r.platform;

CREATE OR REPLACE VIEW public.subscription_kpi_summary
WITH (security_invoker = true)
AS
SELECT
  source,
  tier,
  status,
  cancel_at_period_end,
  COUNT(*) AS total_subscriptions,
  COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at > NOW()) AS not_expired_subscriptions,
  MIN(created_at) AS first_subscription_at,
  MAX(created_at) AS latest_subscription_at
FROM public.subscriptions
GROUP BY
  source,
  tier,
  status,
  cancel_at_period_end;

CREATE OR REPLACE VIEW public.promo_subscription_kpi_summary
WITH (security_invoker = true)
AS
SELECT
  r.campaign_code,
  r.platform,
  s.source AS subscription_source,
  s.tier,
  s.status AS subscription_status,
  COUNT(*) AS total_users
FROM public.promo_campaign_redemptions r
JOIN public.subscriptions s
  ON s.user_id = r.user_id
WHERE r.status = 'consumed'
GROUP BY
  r.campaign_code,
  r.platform,
  s.source,
  s.tier,
  s.status;
