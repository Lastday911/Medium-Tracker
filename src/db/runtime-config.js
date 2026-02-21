const { withClient } = require("./client");

const CONFIG_CACHE_TTL_MS = 15000;
const REQUIRED_SETTING_KEYS = [
  "default_topic_category",
  "model_timeout_ms",
  "search_timeout_ms",
  "topic_count",
  "article_angles_count",
  "focus_points_count",
  "prompt_template_key",
  "output_schema_key"
];

class RuntimeConfigError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "RuntimeConfigError";
    this.statusCode = statusCode;
  }
}

let cache = null;
let cacheExpiresAt = 0;
let pendingLoad = null;

function toPositiveInt(value, settingKey) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new RuntimeConfigError(
      `Die Einstellung '${settingKey}' ist ungueltig. Erwartet wird eine positive Zahl.`
    );
  }
  return parsed;
}

function getRequiredSetting(settingsMap, key) {
  if (!settingsMap.has(key)) {
    throw new RuntimeConfigError(
      `Die erforderliche App-Einstellung '${key}' fehlt in der Datenbank.`
    );
  }
  return settingsMap.get(key);
}

function readSettingRows(rows) {
  return new Map(rows.map((row) => [row.setting_key, row.value_json]));
}

function parseRuntimeSettings(settingsMap) {
  const defaultCategory = getRequiredSetting(settingsMap, "default_topic_category");
  if (typeof defaultCategory !== "string" || !defaultCategory.trim()) {
    throw new RuntimeConfigError(
      "Die Einstellung 'default_topic_category' muss ein nicht-leerer String sein."
    );
  }

  return {
    defaultTopicCategory: defaultCategory.trim(),
    modelTimeoutMs: toPositiveInt(
      getRequiredSetting(settingsMap, "model_timeout_ms"),
      "model_timeout_ms"
    ),
    searchTimeoutMs: toPositiveInt(
      getRequiredSetting(settingsMap, "search_timeout_ms"),
      "search_timeout_ms"
    ),
    topicCount: toPositiveInt(getRequiredSetting(settingsMap, "topic_count"), "topic_count"),
    articleAnglesCount: toPositiveInt(
      getRequiredSetting(settingsMap, "article_angles_count"),
      "article_angles_count"
    ),
    focusPointsCount: toPositiveInt(
      getRequiredSetting(settingsMap, "focus_points_count"),
      "focus_points_count"
    ),
    promptTemplateKey: (() => {
      const value = String(getRequiredSetting(settingsMap, "prompt_template_key") || "").trim();
      if (!value) {
        throw new RuntimeConfigError(
          "Die Einstellung 'prompt_template_key' muss ein nicht-leerer String sein."
        );
      }
      return value;
    })(),
    outputSchemaKey: (() => {
      const value = String(getRequiredSetting(settingsMap, "output_schema_key") || "").trim();
      if (!value) {
        throw new RuntimeConfigError(
          "Die Einstellung 'output_schema_key' muss ein nicht-leerer String sein."
        );
      }
      return value;
    })()
  };
}

function parseCategories(rows, settings) {
  const categories = rows
    .map((row) => ({
      slug: String(row.slug || "").trim(),
      label: String(row.label_de || "").trim(),
      instruction: String(row.instruction || "").trim(),
      sortOrder: Number.isFinite(row.sort_order) ? row.sort_order : 100
    }))
    .filter((category) => category.slug && category.label && category.instruction);

  if (!categories.length) {
    throw new RuntimeConfigError(
      "Keine aktiven Kategorien gefunden. Bitte mindestens eine Kategorie aktivieren."
    );
  }

  const categoriesBySlug = Object.fromEntries(
    categories.map((category) => [category.slug, category])
  );

  if (!categoriesBySlug[settings.defaultTopicCategory]) {
    throw new RuntimeConfigError(
      `Die Standard-Kategorie '${settings.defaultTopicCategory}' ist nicht aktiv oder fehlt.`
    );
  }

  return {
    categories,
    categoriesBySlug,
    defaultCategory: settings.defaultTopicCategory
  };
}

function parsePromptTemplate(row) {
  if (!row?.template_text || typeof row.template_text !== "string") {
    throw new RuntimeConfigError(
      "Kein aktives Prompt-Template gefunden. Bitte 'topic_search_base' aktiv setzen."
    );
  }

  return {
    key: row.template_key,
    version: row.version,
    templateText: row.template_text
  };
}

function parseOutputSchema(row) {
  if (!row?.schema_json || typeof row.schema_json !== "object") {
    throw new RuntimeConfigError(
      "Kein aktives Output-Schema gefunden. Bitte 'medium_tracker_topics' aktiv setzen."
    );
  }

  return {
    key: row.schema_key,
    version: row.version,
    strictMode: Boolean(row.strict_mode),
    schema: row.schema_json
  };
}

function parseModelPolicies(rows) {
  const allowedSearchContexts = new Set(["low", "medium", "high"]);
  const policies = rows.map((row) => {
    const modelId = String(row.model_id || "").trim();
    if (!modelId) {
      throw new RuntimeConfigError(
        "Eine aktive Modell-Policy ist ungueltig: 'model_id' darf nicht leer sein."
      );
    }

    const priority = Number.parseInt(String(row.priority), 10);
    if (!Number.isFinite(priority)) {
      throw new RuntimeConfigError(
        `Die Modell-Policy '${modelId}' hat eine ungueltige Prioritaet.`
      );
    }

    const searchContextSize = String(row.search_context_size || "").trim();
    if (!allowedSearchContexts.has(searchContextSize)) {
      throw new RuntimeConfigError(
        `Die Modell-Policy '${modelId}' hat ein ungueltiges 'search_context_size'.`
      );
    }

    const maxOutputTokens = Number.parseInt(String(row.max_output_tokens), 10);
    if (!Number.isFinite(maxOutputTokens) || maxOutputTokens <= 0) {
      throw new RuntimeConfigError(
        `Die Modell-Policy '${modelId}' hat ein ungueltiges 'max_output_tokens'.`
      );
    }

    const maxRetryOutputTokens = Number.parseInt(
      String(row.max_retry_output_tokens),
      10
    );
    if (!Number.isFinite(maxRetryOutputTokens) || maxRetryOutputTokens <= 0) {
      throw new RuntimeConfigError(
        `Die Modell-Policy '${modelId}' hat ein ungueltiges 'max_retry_output_tokens'.`
      );
    }
    if (maxRetryOutputTokens < maxOutputTokens) {
      throw new RuntimeConfigError(
        `Die Modell-Policy '${modelId}' ist inkonsistent: 'max_retry_output_tokens' muss groesser/gleich 'max_output_tokens' sein.`
      );
    }

    return {
      modelId,
      priority,
      supportsWebSearch: Boolean(row.supports_web_search),
      searchContextSize,
      maxOutputTokens,
      maxRetryOutputTokens,
      enableStructuredOutput: Boolean(row.enable_structured_output)
    };
  });

  if (!policies.length) {
    throw new RuntimeConfigError(
      "Keine aktiven Modell-Policies gefunden. Bitte mindestens ein Modell aktivieren."
    );
  }

  const modelPoliciesById = Object.fromEntries(
    policies.map((policy) => [policy.modelId, policy])
  );

  return {
    modelPolicies: policies,
    modelPoliciesById
  };
}

function parseFeatureFlags(rows) {
  const flags = rows.map((row) => {
    const flagKey = String(row.flag_key || "").trim();
    if (!flagKey) {
      throw new RuntimeConfigError(
        "Ein Feature-Flag ist ungueltig: 'flag_key' darf nicht leer sein."
      );
    }

    const rolloutPercent = Number.parseInt(String(row.rollout_percent), 10);
    if (!Number.isFinite(rolloutPercent) || rolloutPercent < 0 || rolloutPercent > 100) {
      throw new RuntimeConfigError(
        `Das Feature-Flag '${flagKey}' hat einen ungueltigen 'rollout_percent'.`
      );
    }

    const config = row.config_json && typeof row.config_json === "object"
      ? row.config_json
      : {};

    return {
      flagKey,
      enabled: Boolean(row.enabled),
      rolloutPercent,
      config,
      description: String(row.description || "").trim()
    };
  });

  return {
    featureFlags: flags,
    featureFlagsByKey: Object.fromEntries(flags.map((flag) => [flag.flagKey, flag]))
  };
}

async function loadRuntimeConfigFromDb() {
  try {
    return await withClient(async (client) => {
      const settingsRes = await client.query(
        `
          SELECT setting_key, value_json
          FROM app_settings
          WHERE setting_key = ANY($1::text[])
        `,
        [REQUIRED_SETTING_KEYS]
      );

      const settingsMap = readSettingRows(settingsRes.rows || []);
      const missingSettings = REQUIRED_SETTING_KEYS.filter((key) => !settingsMap.has(key));
      if (missingSettings.length) {
        throw new RuntimeConfigError(
          `Fehlende App-Einstellungen in der Datenbank: ${missingSettings.join(", ")}.`
        );
      }

      const settings = parseRuntimeSettings(settingsMap);
      const [
        categoriesRes,
        promptTemplateRes,
        outputSchemaRes,
        modelPoliciesRes,
        featureFlagsRes
      ] =
        await Promise.all([
          client.query(
            `
              SELECT slug, label_de, instruction, sort_order
              FROM categories
              WHERE is_active = TRUE
              ORDER BY sort_order ASC, slug ASC
            `
          ),
          client.query(
            `
              SELECT template_key, version, template_text
              FROM prompt_templates
              WHERE template_key = $1 AND is_active = TRUE
              ORDER BY version DESC
              LIMIT 1
            `,
            [settings.promptTemplateKey]
          ),
          client.query(
            `
              SELECT schema_key, version, schema_json, strict_mode
              FROM output_schemas
              WHERE schema_key = $1 AND is_active = TRUE
              ORDER BY version DESC
              LIMIT 1
            `,
            [settings.outputSchemaKey]
          ),
          client.query(
            `
              SELECT
                model_id,
                priority,
                supports_web_search,
                search_context_size,
                max_output_tokens,
                max_retry_output_tokens,
                enable_structured_output
              FROM model_policies
              WHERE enabled = TRUE
              ORDER BY priority ASC, model_id ASC
            `
          ),
          client.query(
            `
              SELECT
                flag_key,
                enabled,
                rollout_percent,
                config_json,
                description
              FROM feature_flags
              ORDER BY flag_key ASC
            `
          )
        ]);

      const categoryConfig = parseCategories(categoriesRes.rows || [], settings);
      const promptTemplate = parsePromptTemplate(promptTemplateRes.rows?.[0]);
      const outputSchema = parseOutputSchema(outputSchemaRes.rows?.[0]);
      const modelPoliciesConfig = parseModelPolicies(modelPoliciesRes.rows || []);
      const featureFlagsConfig = parseFeatureFlags(featureFlagsRes.rows || []);

      return {
        settings,
        promptTemplate,
        outputSchema,
        ...categoryConfig,
        ...modelPoliciesConfig,
        ...featureFlagsConfig
      };
    });
  } catch (error) {
    if (error instanceof RuntimeConfigError) {
      throw error;
    }

    throw new RuntimeConfigError(
      `Laufzeitkonfiguration konnte nicht geladen werden: ${error.message}`
    );
  }
}

async function getRuntimeConfig(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceRefresh && cache && Date.now() < cacheExpiresAt) {
    return cache;
  }

  if (!forceRefresh && pendingLoad) {
    return pendingLoad;
  }

  pendingLoad = loadRuntimeConfigFromDb()
    .then((config) => {
      cache = config;
      cacheExpiresAt = Date.now() + CONFIG_CACHE_TTL_MS;
      return config;
    })
    .finally(() => {
      pendingLoad = null;
    });

  return pendingLoad;
}

function invalidateRuntimeConfigCache() {
  cache = null;
  cacheExpiresAt = 0;
}

module.exports = {
  RuntimeConfigError,
  getRuntimeConfig,
  invalidateRuntimeConfigCache
};
