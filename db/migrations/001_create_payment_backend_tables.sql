CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS payment_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL,
  product_name text NOT NULL,
  website text NOT NULL,
  stripe_price_id text NOT NULL,
  success_redirect_url text NOT NULL,
  cancel_redirect_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_products_product_code_website_unique UNIQUE (product_code, website),
  CONSTRAINT payment_products_product_code_not_empty CHECK (length(trim(product_code)) > 0),
  CONSTRAINT payment_products_product_name_not_empty CHECK (length(trim(product_name)) > 0),
  CONSTRAINT payment_products_website_not_empty CHECK (length(trim(website)) > 0),
  CONSTRAINT payment_products_stripe_price_id_not_empty CHECK (length(trim(stripe_price_id)) > 0)
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference text NOT NULL,
  product_code text NOT NULL,
  website text NOT NULL,
  customer_email text,
  status text NOT NULL DEFAULT 'pending',
  stripe_session_id text,
  stripe_payment_intent_id text,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_redirect_url text NOT NULL,
  cancel_redirect_url text NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_orders_order_reference_unique UNIQUE (order_reference),
  CONSTRAINT payment_orders_product_fk FOREIGN KEY (product_code, website)
    REFERENCES payment_products (product_code, website)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT payment_orders_status_check CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  CONSTRAINT payment_orders_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT payment_orders_order_reference_not_empty CHECK (length(trim(order_reference)) > 0),
  CONSTRAINT payment_orders_product_code_not_empty CHECK (length(trim(product_code)) > 0),
  CONSTRAINT payment_orders_website_not_empty CHECK (length(trim(website)) > 0),
  CONSTRAINT payment_orders_currency_check CHECK (currency = lower(currency) AND length(currency) = 3),
  CONSTRAINT payment_orders_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS payment_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_logs_stripe_event_id_unique UNIQUE (stripe_event_id),
  CONSTRAINT payment_webhook_logs_stripe_event_id_not_empty CHECK (length(trim(stripe_event_id)) > 0),
  CONSTRAINT payment_webhook_logs_event_type_not_empty CHECK (length(trim(event_type)) > 0),
  CONSTRAINT payment_webhook_logs_processed_at_check CHECK (
    (processed = false AND processed_at IS NULL)
    OR (processed = true AND processed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS payment_products_website_active_idx
  ON payment_products (website, active);

CREATE INDEX IF NOT EXISTS payment_products_stripe_price_id_idx
  ON payment_products (stripe_price_id);

CREATE INDEX IF NOT EXISTS payment_orders_website_status_created_at_idx
  ON payment_orders (website, status, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_orders_product_code_idx
  ON payment_orders (product_code);

CREATE INDEX IF NOT EXISTS payment_orders_customer_email_idx
  ON payment_orders (customer_email)
  WHERE customer_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_orders_stripe_session_id_idx
  ON payment_orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_orders_stripe_payment_intent_id_idx
  ON payment_orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_orders_metadata_gin_idx
  ON payment_orders USING gin (metadata);

CREATE INDEX IF NOT EXISTS payment_webhook_logs_processed_created_at_idx
  ON payment_webhook_logs (processed, created_at);

CREATE INDEX IF NOT EXISTS payment_webhook_logs_event_type_created_at_idx
  ON payment_webhook_logs (event_type, created_at DESC);
