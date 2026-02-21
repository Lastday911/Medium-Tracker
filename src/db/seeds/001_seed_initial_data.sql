-- Kategorien aus aktueller Hardcodierung
INSERT INTO categories (slug, label_de, instruction, is_active, sort_order)
VALUES
  (
    'general_trends',
    'Allgemeine KI-Trends',
    'Fokussiere auf uebergreifende Durchbrueche, neue Modellfaehigkeiten, wichtige Releases und echte Trendverschiebungen im KI-Oekosystem.',
    TRUE,
    10
  ),
  (
    'engineering_research',
    'KI-Engineering & Forschung',
    'Fokussiere auf technische KI-Themen wie Architektur-Entscheidungen, Inferenz-Optimierung, Evaluierung, Forschungsergebnisse und konkrete Engineering-Herausforderungen.',
    TRUE,
    20
  ),
  (
    'business_strategy',
    'KI in Business & Produktivitaet',
    'Fokussiere auf KI-Einsatz in Unternehmen: Produktstrategie, Workflows, ROI, Operationalisierung, Governance in Teams und messbare Business-Implikationen.',
    TRUE,
    30
  )
ON CONFLICT (slug)
DO UPDATE SET
  label_de = EXCLUDED.label_de,
  instruction = EXCLUDED.instruction,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- Prompt-Template Version 1
UPDATE prompt_templates
SET is_active = FALSE
WHERE template_key = 'topic_search_base';

INSERT INTO prompt_templates (template_key, version, locale, template_text, is_active)
VALUES (
  'topic_search_base',
  1,
  'de',
  $$Du bist ein Research-Assistent fuer Medium-Autoren.
Nutze Websuche fokussiert auf die letzten Wochen und liefere NUR {{topic_count}} trendende KI-Themen.
Fokus-Kategorie: {{category_label}}.
{{category_instruction}}
Bleibe strikt in dieser Kategorie und mische keine anderen Kategorie-Schwerpunkte.
Die Themen sollen anspruchsvoll und erklaerungsbeduerftig sein (nicht trivial).
Jedes Thema braucht klare journalistische Einordnung fuer Medium.$$,
  TRUE
)
ON CONFLICT (template_key, version)
DO UPDATE SET
  locale = EXCLUDED.locale,
  template_text = EXCLUDED.template_text,
  is_active = EXCLUDED.is_active;

UPDATE prompt_templates
SET is_active = FALSE
WHERE template_key = 'topic_search_base'
  AND version <> 1;

-- Output-Schema Version 1
UPDATE output_schemas
SET is_active = FALSE
WHERE schema_key = 'medium_tracker_topics';

INSERT INTO output_schemas (schema_key, version, schema_json, strict_mode, is_active)
VALUES (
  'medium_tracker_topics',
  1,
  $$
  {
    "type": "object",
    "additionalProperties": false,
    "required": ["topics", "best_recommendation"],
    "properties": {
      "topics": {
        "type": "array",
        "minItems": 5,
        "maxItems": 5,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "title",
            "why_now",
            "complexity",
            "audience_potential",
            "article_angles"
          ],
          "properties": {
            "title": { "type": "string" },
            "why_now": { "type": "string" },
            "complexity": { "type": "string" },
            "audience_potential": { "type": "string" },
            "article_angles": {
              "type": "array",
              "minItems": 3,
              "maxItems": 3,
              "items": { "type": "string" }
            }
          }
        }
      },
      "best_recommendation": {
        "type": "object",
        "additionalProperties": false,
        "required": ["topic_title", "headline", "summary", "focus_points"],
        "properties": {
          "topic_title": { "type": "string" },
          "headline": { "type": "string" },
          "summary": { "type": "string" },
          "focus_points": {
            "type": "array",
            "minItems": 4,
            "maxItems": 4,
            "items": { "type": "string" }
          }
        }
      }
    }
  }
  $$::jsonb,
  TRUE,
  TRUE
)
ON CONFLICT (schema_key, version)
DO UPDATE SET
  schema_json = EXCLUDED.schema_json,
  strict_mode = EXCLUDED.strict_mode,
  is_active = EXCLUDED.is_active;

UPDATE output_schemas
SET is_active = FALSE
WHERE schema_key = 'medium_tracker_topics'
  AND version <> 1;

-- Modell-Policies als Startpunkt
INSERT INTO model_policies (
  model_id,
  enabled,
  priority,
  supports_web_search,
  search_context_size,
  max_output_tokens,
  max_retry_output_tokens,
  enable_structured_output
)
VALUES
  ('gpt-5.2', TRUE, 1, TRUE, 'low', 1800, 2600, TRUE),
  ('gpt-5-mini', TRUE, 2, TRUE, 'low', 1800, 2600, TRUE),
  ('gpt-5-nano', TRUE, 3, TRUE, 'low', 1800, 2600, TRUE),
  ('gpt-5.1', TRUE, 4, TRUE, 'low', 1800, 2600, TRUE),
  ('gpt-5', TRUE, 5, TRUE, 'low', 1800, 2600, TRUE),
  ('gpt-4.1', TRUE, 6, TRUE, 'low', 1800, 2600, TRUE)
ON CONFLICT (model_id)
DO UPDATE SET
  enabled = EXCLUDED.enabled,
  priority = EXCLUDED.priority,
  supports_web_search = EXCLUDED.supports_web_search,
  search_context_size = EXCLUDED.search_context_size,
  max_output_tokens = EXCLUDED.max_output_tokens,
  max_retry_output_tokens = EXCLUDED.max_retry_output_tokens,
  enable_structured_output = EXCLUDED.enable_structured_output;

-- App-Einstellungen
INSERT INTO app_settings (setting_key, value_json, description)
VALUES
  ('default_topic_category', '"general_trends"'::jsonb, 'Standard-Kategorie fuer Suchen.'),
  ('prompt_template_key', '"topic_search_base"'::jsonb, 'Aktiver Prompt-Template-Schluessel fuer die Themensuche.'),
  ('output_schema_key', '"medium_tracker_topics"'::jsonb, 'Aktiver Output-Schema-Schluessel fuer strukturierte Antworten.'),
  ('model_timeout_ms', '30000'::jsonb, 'Timeout fuer Modell-Laden in Millisekunden.'),
  ('search_timeout_ms', '120000'::jsonb, 'Timeout fuer Topic-Suche in Millisekunden.'),
  ('topic_count', '5'::jsonb, 'Anzahl Themen pro Ergebnis.'),
  ('article_angles_count', '3'::jsonb, 'Anzahl Artikelwinkel pro Thema.'),
  ('focus_points_count', '4'::jsonb, 'Anzahl Fokuspunkte der Top-Empfehlung.')
ON CONFLICT (setting_key)
DO UPDATE SET
  value_json = EXCLUDED.value_json,
  description = EXCLUDED.description;

-- Feature-Flags
INSERT INTO feature_flags (flag_key, enabled, rollout_percent, config_json, description)
VALUES
  ('admin_write_enabled', FALSE, 0, '{}'::jsonb, 'Rollout fuer Admin-Schreibzugriff auf Konfiguration (Read-only solange deaktiviert).'),
  ('dynamic_config_enabled', TRUE, 100, '{}'::jsonb, 'Schaltet DB-basierte Laufzeitkonfiguration frei.'),
  ('history_enabled', TRUE, 100, '{}'::jsonb, 'Schaltet Suchhistorie-Endpunkte und UI frei.'),
  ('category_admin_enabled', TRUE, 100, '{}'::jsonb, 'Schaltet Kategorieverwaltung im Admin-Bereich frei.')
ON CONFLICT (flag_key)
DO UPDATE SET
  enabled = EXCLUDED.enabled,
  rollout_percent = EXCLUDED.rollout_percent,
  config_json = EXCLUDED.config_json,
  description = EXCLUDED.description;
