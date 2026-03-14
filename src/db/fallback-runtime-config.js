const DEFAULT_CATEGORIES = [
  {
    slug: "general_trends",
    label: "Allgemeine KI-Trends",
    instruction:
      "Fokussiere auf uebergreifende Durchbrueche, neue Modellfaehigkeiten, wichtige Releases und echte Trendverschiebungen im KI-Oekosystem.",
    sortOrder: 10
  },
  {
    slug: "engineering_research",
    label: "KI-Engineering & Forschung",
    instruction:
      "Fokussiere auf technische KI-Themen wie Architektur-Entscheidungen, Inferenz-Optimierung, Evaluierung, Forschungsergebnisse und konkrete Engineering-Herausforderungen.",
    sortOrder: 20
  },
  {
    slug: "business_strategy",
    label: "KI in Business & Produktivitaet",
    instruction:
      "Fokussiere auf KI-Einsatz in Unternehmen: Produktstrategie, Workflows, ROI, Operationalisierung, Governance in Teams und messbare Business-Implikationen.",
    sortOrder: 30
  }
];

const DEFAULT_PROMPT_TEMPLATE = {
  key: "topic_search_base",
  version: 1,
  templateText: [
    "Du bist ein Research-Assistent fuer Medium-Autoren.",
    "Nutze Websuche fokussiert auf die letzten Wochen und liefere NUR {{topic_count}} trendende KI-Themen.",
    "Fokus-Kategorie: {{category_label}}.",
    "{{category_instruction}}",
    "Bleibe strikt in dieser Kategorie und mische keine anderen Kategorie-Schwerpunkte.",
    "Die Themen sollen anspruchsvoll und erklaerungsbeduerftig sein (nicht trivial).",
    "Jedes Thema braucht klare journalistische Einordnung fuer Medium."
  ].join("\n")
};

const DEFAULT_OUTPUT_SCHEMA = {
  key: "medium_tracker_topics",
  version: 1,
  strictMode: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["topics", "best_recommendation"],
    properties: {
      topics: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "why_now",
            "complexity",
            "audience_potential",
            "article_angles"
          ],
          properties: {
            title: { type: "string" },
            why_now: { type: "string" },
            complexity: { type: "string" },
            audience_potential: { type: "string" },
            article_angles: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: { type: "string" }
            }
          }
        }
      },
      best_recommendation: {
        type: "object",
        additionalProperties: false,
        required: ["topic_title", "headline", "summary", "focus_points"],
        properties: {
          topic_title: { type: "string" },
          headline: { type: "string" },
          summary: { type: "string" },
          focus_points: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "string" }
          }
        }
      }
    }
  }
};

const DEFAULT_MODEL_POLICIES = [
  {
    modelId: "gpt-5.4",
    enabled: true,
    priority: 1,
    supportsWebSearch: true,
    searchContextSize: "low",
    maxOutputTokens: 1800,
    maxRetryOutputTokens: 2600,
    enableStructuredOutput: true
  },
  {
    modelId: "gpt-5",
    enabled: true,
    priority: 2,
    supportsWebSearch: true,
    searchContextSize: "low",
    maxOutputTokens: 1800,
    maxRetryOutputTokens: 2600,
    enableStructuredOutput: true
  },
  {
    modelId: "gpt-5-mini",
    enabled: true,
    priority: 3,
    supportsWebSearch: true,
    searchContextSize: "low",
    maxOutputTokens: 1800,
    maxRetryOutputTokens: 2600,
    enableStructuredOutput: true
  },
  {
    modelId: "gpt-5-nano",
    enabled: true,
    priority: 4,
    supportsWebSearch: true,
    searchContextSize: "low",
    maxOutputTokens: 1800,
    maxRetryOutputTokens: 2600,
    enableStructuredOutput: true
  },
  {
    modelId: "gpt-4.1",
    enabled: true,
    priority: 5,
    supportsWebSearch: true,
    searchContextSize: "low",
    maxOutputTokens: 1800,
    maxRetryOutputTokens: 2600,
    enableStructuredOutput: true
  },
  {
    modelId: "o4-mini",
    enabled: true,
    priority: 6,
    supportsWebSearch: true,
    searchContextSize: "low",
    maxOutputTokens: 1800,
    maxRetryOutputTokens: 2600,
    enableStructuredOutput: true
  },
  {
    modelId: "o3",
    enabled: true,
    priority: 7,
    supportsWebSearch: true,
    searchContextSize: "low",
    maxOutputTokens: 1800,
    maxRetryOutputTokens: 2600,
    enableStructuredOutput: true
  }
];

const DEFAULT_FEATURE_FLAGS = [
  {
    flagKey: "admin_write_enabled",
    enabled: false,
    rolloutPercent: 0,
    description: "Lokaler Fallback-Modus ist read-only.",
    config: {}
  },
  {
    flagKey: "dynamic_config_enabled",
    enabled: false,
    rolloutPercent: 0,
    description: "Dynamische Konfiguration benoetigt eine Datenbank.",
    config: {}
  },
  {
    flagKey: "history_enabled",
    enabled: false,
    rolloutPercent: 0,
    description: "Historie benoetigt eine Datenbank.",
    config: {}
  },
  {
    flagKey: "category_admin_enabled",
    enabled: false,
    rolloutPercent: 0,
    description: "Kategorie-Admin benoetigt eine Datenbank.",
    config: {}
  }
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildFallbackRuntimeConfig() {
  const categories = cloneJson(DEFAULT_CATEGORIES);
  const modelPolicies = cloneJson(DEFAULT_MODEL_POLICIES);
  const featureFlags = cloneJson(DEFAULT_FEATURE_FLAGS);

  return {
    source: "fallback",
    settings: {
      defaultTopicCategory: "general_trends",
      modelTimeoutMs: 30000,
      searchTimeoutMs: 120000,
      topicCount: 5,
      articleAnglesCount: 3,
      focusPointsCount: 4,
      promptTemplateKey: DEFAULT_PROMPT_TEMPLATE.key,
      outputSchemaKey: DEFAULT_OUTPUT_SCHEMA.key
    },
    defaultCategory: "general_trends",
    categories,
    categoriesBySlug: Object.fromEntries(categories.map((category) => [category.slug, category])),
    promptTemplate: cloneJson(DEFAULT_PROMPT_TEMPLATE),
    outputSchema: cloneJson(DEFAULT_OUTPUT_SCHEMA),
    modelPolicies,
    modelPoliciesById: Object.fromEntries(
      modelPolicies.map((policy) => [policy.modelId, policy])
    ),
    featureFlags,
    featureFlagsByKey: Object.fromEntries(featureFlags.map((flag) => [flag.flagKey, flag]))
  };
}

module.exports = {
  buildFallbackRuntimeConfig
};
