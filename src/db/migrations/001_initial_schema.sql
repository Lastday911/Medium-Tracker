CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label_de TEXT NOT NULL,
  instruction TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_slug_format CHECK (slug ~ '^[a-z0-9_]+$')
);

CREATE TRIGGER categories_set_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS prompt_templates (
  id BIGSERIAL PRIMARY KEY,
  template_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  locale TEXT NOT NULL DEFAULT 'de',
  template_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prompt_templates_version_positive CHECK (version > 0),
  CONSTRAINT prompt_templates_unique UNIQUE (template_key, version)
);

CREATE UNIQUE INDEX prompt_templates_one_active_per_key_idx
ON prompt_templates (template_key)
WHERE is_active = TRUE;

CREATE TRIGGER prompt_templates_set_updated_at
BEFORE UPDATE ON prompt_templates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS output_schemas (
  id BIGSERIAL PRIMARY KEY,
  schema_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  schema_json JSONB NOT NULL,
  strict_mode BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT output_schemas_version_positive CHECK (version > 0),
  CONSTRAINT output_schemas_unique UNIQUE (schema_key, version)
);

CREATE UNIQUE INDEX output_schemas_one_active_per_key_idx
ON output_schemas (schema_key)
WHERE is_active = TRUE;

CREATE TRIGGER output_schemas_set_updated_at
BEFORE UPDATE ON output_schemas
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS model_policies (
  id BIGSERIAL PRIMARY KEY,
  model_id TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  supports_web_search BOOLEAN NOT NULL DEFAULT TRUE,
  search_context_size TEXT NOT NULL DEFAULT 'low',
  max_output_tokens INTEGER NOT NULL DEFAULT 1800,
  max_retry_output_tokens INTEGER NOT NULL DEFAULT 2600,
  enable_structured_output BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT model_policies_tokens_positive CHECK (max_output_tokens > 0),
  CONSTRAINT model_policies_retry_tokens_positive CHECK (max_retry_output_tokens > 0),
  CONSTRAINT model_policies_search_context CHECK (search_context_size IN ('low', 'medium', 'high'))
);

CREATE TRIGGER model_policies_set_updated_at
BEFORE UPDATE ON model_policies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS search_history (
  id BIGSERIAL PRIMARY KEY,
  category_slug TEXT NOT NULL,
  model_id TEXT NOT NULL,
  request_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_history_status_check CHECK (status IN ('success', 'error')),
  CONSTRAINT search_history_latency_non_negative CHECK (latency_ms IS NULL OR latency_ms >= 0)
);

CREATE INDEX search_history_created_at_idx
ON search_history (created_at DESC);

CREATE INDEX search_history_category_slug_idx
ON search_history (category_slug);

CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percent INTEGER NOT NULL DEFAULT 100,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feature_flags_rollout_range CHECK (rollout_percent BETWEEN 0 AND 100)
);

CREATE TRIGGER feature_flags_set_updated_at
BEFORE UPDATE ON feature_flags
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER app_settings_set_updated_at
BEFORE UPDATE ON app_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
