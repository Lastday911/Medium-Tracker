const { withClient } = require("./client");

class AdminStoreError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AdminStoreError";
    this.statusCode = statusCode;
  }
}

const SLUG_PATTERN = /^[a-z0-9_]+$/;
const SEARCH_CONTEXT_VALUES = new Set(["low", "medium", "high"]);

function toText(value) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRequiredText(value, fieldLabel) {
  const normalized = toText(value);
  if (!normalized) {
    throw new AdminStoreError(`'${fieldLabel}' darf nicht leer sein.`, 400);
  }
  return normalized;
}

function normalizeOptionalText(value) {
  const normalized = toText(value);
  return normalized || null;
}

function normalizeSlug(value, fieldLabel = "slug") {
  const normalized = normalizeRequiredText(value, fieldLabel);
  if (!SLUG_PATTERN.test(normalized)) {
    throw new AdminStoreError(
      `'${fieldLabel}' ist ungueltig. Erlaubt sind nur Kleinbuchstaben, Zahlen und Unterstrich.`,
      400
    );
  }
  return normalized;
}

function normalizePositiveInt(value, fieldLabel) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AdminStoreError(
      `'${fieldLabel}' muss eine positive Ganzzahl sein.`,
      400
    );
  }
  return parsed;
}

function normalizeSortOrder(value, fallback = 100) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new AdminStoreError("'sortOrder' muss eine Ganzzahl sein.", 400);
  }
  return parsed;
}

function normalizeBoolean(value, fieldLabel) {
  if (typeof value !== "boolean") {
    throw new AdminStoreError(`'${fieldLabel}' muss true oder false sein.`, 400);
  }
  return value;
}

async function runInTransaction(client, callback) {
  await client.query("BEGIN");
  try {
    const result = await callback();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function isUniqueViolation(error) {
  return String(error?.code || "") === "23505";
}

function mapCategoryRow(row) {
  return {
    id: row.id,
    slug: String(row.slug || ""),
    label: String(row.label_de || ""),
    instruction: String(row.instruction || ""),
    isActive: Boolean(row.is_active),
    sortOrder: Number.isFinite(row.sort_order) ? row.sort_order : 100,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function readDefaultCategoryFromSettings(client) {
  const result = await client.query(
    `
      SELECT value_json
      FROM app_settings
      WHERE setting_key = 'default_topic_category'
      LIMIT 1
    `
  );
  const raw = result.rows?.[0]?.value_json;
  return typeof raw === "string" ? raw.trim() : "";
}

async function countActiveCategories(client) {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS active_count
      FROM categories
      WHERE is_active = TRUE
    `
  );
  return Number(result.rows?.[0]?.active_count || 0);
}

async function readAppSettingString(settingKey) {
  const key = normalizeRequiredText(settingKey, "settingKey");
  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT value_json
        FROM app_settings
        WHERE setting_key = $1
        LIMIT 1
      `,
      [key]
    );
    const raw = result.rows?.[0]?.value_json;
    return typeof raw === "string" ? raw.trim() : "";
  });
}

async function listAdminCategories() {
  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          id,
          slug,
          label_de,
          instruction,
          is_active,
          sort_order,
          created_at,
          updated_at
        FROM categories
        ORDER BY sort_order ASC, slug ASC
      `
    );
    return result.rows.map(mapCategoryRow);
  });
}

async function createAdminCategory(input) {
  const slug = normalizeSlug(input?.slug);
  const label = normalizeRequiredText(input?.label, "label");
  const instruction = normalizeRequiredText(input?.instruction, "instruction");
  const sortOrder = normalizeSortOrder(input?.sortOrder, 100);
  const isActive = input?.isActive === undefined
    ? true
    : normalizeBoolean(input?.isActive, "isActive");

  try {
    return await withClient(async (client) => {
      const result = await client.query(
        `
          INSERT INTO categories (
            slug,
            label_de,
            instruction,
            is_active,
            sort_order
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING
            id,
            slug,
            label_de,
            instruction,
            is_active,
            sort_order,
            created_at,
            updated_at
        `,
        [slug, label, instruction, isActive, sortOrder]
      );

      return mapCategoryRow(result.rows[0]);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminStoreError(`Die Kategorie '${slug}' existiert bereits.`, 409);
    }
    throw error;
  }
}

async function updateAdminCategory(slugInput, patch) {
  const slug = normalizeSlug(slugInput, "slug");
  const updates = [];
  const values = [];
  let valueIndex = 1;

  if (Object.prototype.hasOwnProperty.call(patch, "label")) {
    updates.push(`label_de = $${valueIndex}`);
    values.push(normalizeRequiredText(patch.label, "label"));
    valueIndex += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "instruction")) {
    updates.push(`instruction = $${valueIndex}`);
    values.push(normalizeRequiredText(patch.instruction, "instruction"));
    valueIndex += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "sortOrder")) {
    updates.push(`sort_order = $${valueIndex}`);
    values.push(normalizeSortOrder(patch.sortOrder, 100));
    valueIndex += 1;
  }

  const wantsToChangeActiveState = Object.prototype.hasOwnProperty.call(patch, "isActive");
  const desiredActiveState = wantsToChangeActiveState
    ? normalizeBoolean(patch.isActive, "isActive")
    : null;

  if (wantsToChangeActiveState) {
    updates.push(`is_active = $${valueIndex}`);
    values.push(desiredActiveState);
    valueIndex += 1;
  }

  if (!updates.length) {
    throw new AdminStoreError(
      "Keine gueltigen Felder zum Aktualisieren uebergeben.",
      400
    );
  }

  return withClient(async (client) => {
    return runInTransaction(client, async () => {
      const existingRes = await client.query(
        `
          SELECT
            id,
            slug,
            label_de,
            instruction,
            is_active,
            sort_order,
            created_at,
            updated_at
          FROM categories
          WHERE slug = $1
          LIMIT 1
          FOR UPDATE
        `,
        [slug]
      );

      if (!existingRes.rows.length) {
        return null;
      }

      const existing = mapCategoryRow(existingRes.rows[0]);
      if (
        wantsToChangeActiveState &&
        existing.isActive &&
        desiredActiveState === false
      ) {
        const defaultCategory = await readDefaultCategoryFromSettings(client);
        if (defaultCategory && defaultCategory === slug) {
          throw new AdminStoreError(
            "Die Standard-Kategorie kann nicht deaktiviert werden.",
            400
          );
        }

        const activeCount = await countActiveCategories(client);
        if (activeCount <= 1) {
          throw new AdminStoreError(
            "Die letzte aktive Kategorie kann nicht deaktiviert werden.",
            400
          );
        }
      }

      values.push(slug);
      const result = await client.query(
        `
          UPDATE categories
          SET ${updates.join(", ")}
          WHERE slug = $${valueIndex}
          RETURNING
            id,
            slug,
            label_de,
            instruction,
            is_active,
            sort_order,
            created_at,
            updated_at
        `,
        values
      );

      return mapCategoryRow(result.rows[0]);
    });
  });
}

async function deactivateAdminCategory(slugInput) {
  return updateAdminCategory(slugInput, { isActive: false });
}

function mapPromptTemplateRow(row) {
  return {
    id: row.id,
    templateKey: String(row.template_key || ""),
    version: Number.isFinite(row.version) ? row.version : null,
    locale: String(row.locale || "de"),
    templateText: String(row.template_text || ""),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listPromptTemplatesAdmin() {
  return withClient(async (client) => {
    const [settingsRes, templatesRes] = await Promise.all([
      client.query(
        `
          SELECT value_json
          FROM app_settings
          WHERE setting_key = 'prompt_template_key'
          LIMIT 1
        `
      ),
      client.query(
        `
          SELECT
            id,
            template_key,
            version,
            locale,
            template_text,
            is_active,
            created_at,
            updated_at
          FROM prompt_templates
          ORDER BY template_key ASC, version DESC
        `
      )
    ]);

    const activeTemplateKey = typeof settingsRes.rows?.[0]?.value_json === "string"
      ? settingsRes.rows[0].value_json.trim()
      : "";

    return {
      activeTemplateKey,
      items: templatesRes.rows.map(mapPromptTemplateRow)
    };
  });
}

async function upsertAppSetting(client, { key, valueJson, description }) {
  await client.query(
    `
      INSERT INTO app_settings (setting_key, value_json, description)
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT (setting_key)
      DO UPDATE SET
        value_json = EXCLUDED.value_json,
        description = EXCLUDED.description
    `,
    [key, JSON.stringify(valueJson), description]
  );
}

async function createPromptTemplateVersion(input) {
  const templateKey = normalizeSlug(input?.templateKey, "templateKey");
  const locale = toText(input?.locale) || "de";
  const templateText = normalizeRequiredText(input?.templateText, "templateText");
  const activate = input?.activate === undefined
    ? true
    : normalizeBoolean(input.activate, "activate");
  const setAsDefaultKey = input?.setAsDefaultKey === undefined
    ? true
    : normalizeBoolean(input.setAsDefaultKey, "setAsDefaultKey");

  return withClient(async (client) => {
    return runInTransaction(client, async () => {
      const versionRes = await client.query(
        `
          SELECT COALESCE(MAX(version), 0) + 1 AS next_version
          FROM prompt_templates
          WHERE template_key = $1
        `,
        [templateKey]
      );
      const nextVersion = Number(versionRes.rows?.[0]?.next_version || 1);

      if (activate) {
        await client.query(
          `
            UPDATE prompt_templates
            SET is_active = FALSE
            WHERE template_key = $1
          `,
          [templateKey]
        );
      }

      const insertRes = await client.query(
        `
          INSERT INTO prompt_templates (
            template_key,
            version,
            locale,
            template_text,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING
            id,
            template_key,
            version,
            locale,
            template_text,
            is_active,
            created_at,
            updated_at
        `,
        [templateKey, nextVersion, locale, templateText, activate]
      );

      if (setAsDefaultKey) {
        await upsertAppSetting(client, {
          key: "prompt_template_key",
          valueJson: templateKey,
          description: "Aktiver Prompt-Template-Schluessel fuer die Themensuche."
        });
      }

      return mapPromptTemplateRow(insertRes.rows[0]);
    });
  });
}

async function activatePromptTemplateVersion(input) {
  const templateKey = normalizeSlug(input?.templateKey, "templateKey");
  const version = normalizePositiveInt(input?.version, "version");
  const setAsDefaultKey = input?.setAsDefaultKey === undefined
    ? true
    : normalizeBoolean(input.setAsDefaultKey, "setAsDefaultKey");

  return withClient(async (client) => {
    return runInTransaction(client, async () => {
      const existingRes = await client.query(
        `
          SELECT
            id,
            template_key,
            version,
            locale,
            template_text,
            is_active,
            created_at,
            updated_at
          FROM prompt_templates
          WHERE template_key = $1 AND version = $2
          LIMIT 1
        `,
        [templateKey, version]
      );
      if (!existingRes.rows.length) {
        return null;
      }

      await client.query(
        `
          UPDATE prompt_templates
          SET is_active = FALSE
          WHERE template_key = $1
        `,
        [templateKey]
      );

      const result = await client.query(
        `
          UPDATE prompt_templates
          SET is_active = TRUE
          WHERE template_key = $1 AND version = $2
          RETURNING
            id,
            template_key,
            version,
            locale,
            template_text,
            is_active,
            created_at,
            updated_at
        `,
        [templateKey, version]
      );

      if (setAsDefaultKey) {
        await upsertAppSetting(client, {
          key: "prompt_template_key",
          valueJson: templateKey,
          description: "Aktiver Prompt-Template-Schluessel fuer die Themensuche."
        });
      }

      return mapPromptTemplateRow(result.rows[0]);
    });
  });
}

function mapModelPolicyRow(row) {
  return {
    id: row.id,
    modelId: String(row.model_id || ""),
    enabled: Boolean(row.enabled),
    priority: Number.isFinite(row.priority) ? row.priority : 100,
    supportsWebSearch: Boolean(row.supports_web_search),
    searchContextSize: String(row.search_context_size || "low"),
    maxOutputTokens: Number.isFinite(row.max_output_tokens) ? row.max_output_tokens : 1800,
    maxRetryOutputTokens: Number.isFinite(row.max_retry_output_tokens)
      ? row.max_retry_output_tokens
      : 2600,
    enableStructuredOutput: Boolean(row.enable_structured_output),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeSearchContextSize(value) {
  const normalized = normalizeRequiredText(value, "searchContextSize");
  if (!SEARCH_CONTEXT_VALUES.has(normalized)) {
    throw new AdminStoreError(
      "'searchContextSize' muss einer von 'low', 'medium' oder 'high' sein.",
      400
    );
  }
  return normalized;
}

function normalizeModelPolicyInput(input, existing = null) {
  const modelId = normalizeRequiredText(
    input?.modelId !== undefined ? input.modelId : existing?.modelId,
    "modelId"
  );
  const enabled = input?.enabled !== undefined
    ? normalizeBoolean(input.enabled, "enabled")
    : (existing?.enabled ?? true);
  const priority = input?.priority !== undefined
    ? normalizePositiveInt(input.priority, "priority")
    : (existing?.priority ?? 100);
  const supportsWebSearch = input?.supportsWebSearch !== undefined
    ? normalizeBoolean(input.supportsWebSearch, "supportsWebSearch")
    : (existing?.supportsWebSearch ?? true);
  const searchContextSize = input?.searchContextSize !== undefined
    ? normalizeSearchContextSize(input.searchContextSize)
    : (existing?.searchContextSize || "low");
  const maxOutputTokens = input?.maxOutputTokens !== undefined
    ? normalizePositiveInt(input.maxOutputTokens, "maxOutputTokens")
    : (existing?.maxOutputTokens ?? 1800);
  const maxRetryOutputTokens = input?.maxRetryOutputTokens !== undefined
    ? normalizePositiveInt(input.maxRetryOutputTokens, "maxRetryOutputTokens")
    : (existing?.maxRetryOutputTokens ?? 2600);
  const enableStructuredOutput = input?.enableStructuredOutput !== undefined
    ? normalizeBoolean(input.enableStructuredOutput, "enableStructuredOutput")
    : (existing?.enableStructuredOutput ?? true);

  if (maxRetryOutputTokens < maxOutputTokens) {
    throw new AdminStoreError(
      "'maxRetryOutputTokens' muss groesser oder gleich 'maxOutputTokens' sein.",
      400
    );
  }

  return {
    modelId,
    enabled,
    priority,
    supportsWebSearch,
    searchContextSize,
    maxOutputTokens,
    maxRetryOutputTokens,
    enableStructuredOutput
  };
}

async function listModelPoliciesAdmin() {
  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          id,
          model_id,
          enabled,
          priority,
          supports_web_search,
          search_context_size,
          max_output_tokens,
          max_retry_output_tokens,
          enable_structured_output,
          created_at,
          updated_at
        FROM model_policies
        ORDER BY priority ASC, model_id ASC
      `
    );
    return result.rows.map(mapModelPolicyRow);
  });
}

async function countEnabledPoliciesExcluding(client, modelId) {
  const result = await client.query(
    `
      SELECT COUNT(*)::int AS enabled_count
      FROM model_policies
      WHERE enabled = TRUE
        AND model_id <> $1
    `,
    [modelId]
  );
  return Number(result.rows?.[0]?.enabled_count || 0);
}

async function createModelPolicy(input) {
  const policy = normalizeModelPolicyInput(input);

  try {
    return await withClient(async (client) => {
      const result = await client.query(
        `
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING
            id,
            model_id,
            enabled,
            priority,
            supports_web_search,
            search_context_size,
            max_output_tokens,
            max_retry_output_tokens,
            enable_structured_output,
            created_at,
            updated_at
        `,
        [
          policy.modelId,
          policy.enabled,
          policy.priority,
          policy.supportsWebSearch,
          policy.searchContextSize,
          policy.maxOutputTokens,
          policy.maxRetryOutputTokens,
          policy.enableStructuredOutput
        ]
      );
      return mapModelPolicyRow(result.rows[0]);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AdminStoreError(
        `Die Modell-Policy fuer '${policy.modelId}' existiert bereits.`,
        409
      );
    }
    throw error;
  }
}

async function updateModelPolicy(modelIdInput, patch) {
  const modelId = normalizeRequiredText(modelIdInput, "modelId");

  return withClient(async (client) => {
    return runInTransaction(client, async () => {
      const existingRes = await client.query(
        `
          SELECT
            id,
            model_id,
            enabled,
            priority,
            supports_web_search,
            search_context_size,
            max_output_tokens,
            max_retry_output_tokens,
            enable_structured_output,
            created_at,
            updated_at
          FROM model_policies
          WHERE model_id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [modelId]
      );

      if (!existingRes.rows.length) {
        return null;
      }

      const existing = mapModelPolicyRow(existingRes.rows[0]);
      const policy = normalizeModelPolicyInput({ modelId, ...patch }, existing);

      if (existing.enabled && policy.enabled === false) {
        const enabledOthers = await countEnabledPoliciesExcluding(client, modelId);
        if (enabledOthers <= 0) {
          throw new AdminStoreError(
            "Mindestens eine aktivierte Modell-Policy muss erhalten bleiben.",
            400
          );
        }
      }

      const result = await client.query(
        `
          UPDATE model_policies
          SET
            enabled = $2,
            priority = $3,
            supports_web_search = $4,
            search_context_size = $5,
            max_output_tokens = $6,
            max_retry_output_tokens = $7,
            enable_structured_output = $8
          WHERE model_id = $1
          RETURNING
            id,
            model_id,
            enabled,
            priority,
            supports_web_search,
            search_context_size,
            max_output_tokens,
            max_retry_output_tokens,
            enable_structured_output,
            created_at,
            updated_at
        `,
        [
          modelId,
          policy.enabled,
          policy.priority,
          policy.supportsWebSearch,
          policy.searchContextSize,
          policy.maxOutputTokens,
          policy.maxRetryOutputTokens,
          policy.enableStructuredOutput
        ]
      );
      return mapModelPolicyRow(result.rows[0]);
    });
  });
}

async function deleteModelPolicy(modelIdInput) {
  const modelId = normalizeRequiredText(modelIdInput, "modelId");

  return withClient(async (client) => {
    return runInTransaction(client, async () => {
      const existingRes = await client.query(
        `
          SELECT enabled
          FROM model_policies
          WHERE model_id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [modelId]
      );
      if (!existingRes.rows.length) {
        return false;
      }

      const isEnabled = Boolean(existingRes.rows[0].enabled);
      if (isEnabled) {
        const enabledOthers = await countEnabledPoliciesExcluding(client, modelId);
        if (enabledOthers <= 0) {
          throw new AdminStoreError(
            "Die letzte aktivierte Modell-Policy kann nicht geloescht werden.",
            400
          );
        }
      }

      const result = await client.query(
        `
          DELETE FROM model_policies
          WHERE model_id = $1
          RETURNING model_id
        `,
        [modelId]
      );
      return result.rowCount > 0;
    });
  });
}

function mapFeatureFlagRow(row) {
  return {
    flagKey: String(row.flag_key || ""),
    enabled: Boolean(row.enabled),
    rolloutPercent: Number.isFinite(row.rollout_percent) ? row.rollout_percent : 0,
    config: row.config_json && typeof row.config_json === "object" ? row.config_json : {},
    description: String(row.description || "").trim()
  };
}

function normalizeRolloutPercent(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new AdminStoreError("'rolloutPercent' muss zwischen 0 und 100 liegen.", 400);
  }
  return parsed;
}

function normalizeConfigObject(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminStoreError("'config' muss ein JSON-Objekt sein.", 400);
  }
  return value;
}

async function listFeatureFlagsAdmin() {
  return withClient(async (client) => {
    const result = await client.query(
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
    );
    return result.rows.map(mapFeatureFlagRow);
  });
}

async function upsertFeatureFlag(input) {
  const flagKey = normalizeSlug(input?.flagKey, "flagKey");
  const config = normalizeConfigObject(input?.config);
  const hasEnabled = Object.prototype.hasOwnProperty.call(input || {}, "enabled");
  const hasRolloutPercent = Object.prototype.hasOwnProperty.call(
    input || {},
    "rolloutPercent"
  );
  const hasDescription = Object.prototype.hasOwnProperty.call(input || {}, "description");

  return withClient(async (client) => {
    return runInTransaction(client, async () => {
      const existingRes = await client.query(
        `
          SELECT
            flag_key,
            enabled,
            rollout_percent,
            config_json,
            description
          FROM feature_flags
          WHERE flag_key = $1
          LIMIT 1
          FOR UPDATE
        `,
        [flagKey]
      );
      const existing = existingRes.rows.length ? mapFeatureFlagRow(existingRes.rows[0]) : null;

      const enabled = hasEnabled
        ? normalizeBoolean(input.enabled, "enabled")
        : (existing?.enabled ?? false);
      const rolloutPercent = hasRolloutPercent
        ? normalizeRolloutPercent(input.rolloutPercent)
        : (existing?.rolloutPercent ?? 100);
      const description = hasDescription
        ? normalizeOptionalText(input.description)
        : (existing?.description || null);
      const configJson = config !== undefined ? config : (existing?.config || {});

      const result = await client.query(
        `
          INSERT INTO feature_flags (
            flag_key,
            enabled,
            rollout_percent,
            config_json,
            description
          )
          VALUES ($1, $2, $3, $4::jsonb, $5)
          ON CONFLICT (flag_key)
          DO UPDATE SET
            enabled = EXCLUDED.enabled,
            rollout_percent = EXCLUDED.rollout_percent,
            config_json = EXCLUDED.config_json,
            description = EXCLUDED.description
          RETURNING
            flag_key,
            enabled,
            rollout_percent,
            config_json,
            description
        `,
        [flagKey, enabled, rolloutPercent, JSON.stringify(configJson), description]
      );

      return mapFeatureFlagRow(result.rows[0]);
    });
  });
}

module.exports = {
  AdminStoreError,
  readAppSettingString,
  listAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  deactivateAdminCategory,
  listPromptTemplatesAdmin,
  createPromptTemplateVersion,
  activatePromptTemplateVersion,
  listModelPoliciesAdmin,
  createModelPolicy,
  updateModelPolicy,
  deleteModelPolicy,
  listFeatureFlagsAdmin,
  upsertFeatureFlag
};
