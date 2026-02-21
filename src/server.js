const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const runtimeConfigStore = require("./db/runtime-config");
const historyStore = require("./db/history-store");
const adminStore = require("./db/admin-store");
const { logger, requestContextMiddleware, sanitizeForLogging } = require("./logger");

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const FALLBACK_MODEL_TIMEOUT_MS = 30000;
const ADMIN_WRITE_FLAG_KEY = "admin_write_enabled";
const HISTORY_FLAG_KEY = "history_enabled";

app.use(cors());
app.use(requestContextMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function getRuntimeConfig(options) {
  return runtimeConfigStore.getRuntimeConfig(options);
}

function runtimeConfigError(message, statusCode) {
  return new runtimeConfigStore.RuntimeConfigError(message, statusCode);
}

function invalidateRuntimeConfigCache() {
  runtimeConfigStore.invalidateRuntimeConfigCache();
}

function normalizePositiveInt(value, fallback, min, max) {
  return historyStore.normalizePositiveInt(value, fallback, min, max);
}

function normalizeOffset(value, fallback) {
  return historyStore.normalizeOffset(value, fallback);
}

function insertHistoryEntry(entry) {
  return historyStore.insertHistoryEntry(entry);
}

function listHistory(options) {
  return historyStore.listHistory(options);
}

function getHistoryEntryById(id) {
  return historyStore.getHistoryEntryById(id);
}

function deleteHistoryEntryById(id) {
  return historyStore.deleteHistoryEntryById(id);
}

function readAppSettingString(settingKey) {
  return adminStore.readAppSettingString(settingKey);
}

function listAdminCategories() {
  return adminStore.listAdminCategories();
}

function createAdminCategory(input) {
  return adminStore.createAdminCategory(input);
}

function updateAdminCategory(slug, patch) {
  return adminStore.updateAdminCategory(slug, patch);
}

function deactivateAdminCategory(slug) {
  return adminStore.deactivateAdminCategory(slug);
}

function listPromptTemplatesAdmin() {
  return adminStore.listPromptTemplatesAdmin();
}

function createPromptTemplateVersion(input) {
  return adminStore.createPromptTemplateVersion(input);
}

function activatePromptTemplateVersion(input) {
  return adminStore.activatePromptTemplateVersion(input);
}

function listModelPoliciesAdmin() {
  return adminStore.listModelPoliciesAdmin();
}

function createModelPolicy(input) {
  return adminStore.createModelPolicy(input);
}

function updateModelPolicy(modelId, patch) {
  return adminStore.updateModelPolicy(modelId, patch);
}

function deleteModelPolicy(modelId) {
  return adminStore.deleteModelPolicy(modelId);
}

function listFeatureFlagsAdmin() {
  return adminStore.listFeatureFlagsAdmin();
}

function upsertFeatureFlag(input) {
  return adminStore.upsertFeatureFlag(input);
}

function looksLikeApiKey(value) {
  return typeof value === "string" && value.trim().startsWith("sk-");
}

function getAuthHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey.trim()}`
  };
}

function isAbortError(error) {
  return (
    error?.name === "AbortError" ||
    String(error?.message || "").toLowerCase().includes("aborted")
  );
}

function isUnsupportedFormatError(message) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("unsupported parameter") &&
    (lower.includes("text.format") || lower.includes("json_schema"))
  );
}

function isModelCannotError(message) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("model cannot") ||
    lower.includes("cannot be used with") ||
    lower.includes("does not support this operation")
  );
}

function mapOpenAIErrorMessage(message) {
  const raw = String(message || "").trim();
  const lower = raw.toLowerCase();

  if (lower.includes("unsupported parameter") && lower.includes("temperature")) {
    return "Das gewählte Modell unterstützt den Parameter 'temperature' nicht.";
  }
  if (
    lower.includes("unsupported parameter") &&
    (lower.includes("reasoning") || lower.includes("text.format"))
  ) {
    return "Das gewählte Modell unterstützt nicht alle erweiterten Antwortoptionen. Bitte anderes Modell wählen.";
  }
  if (
    lower.includes("web_search") ||
    lower.includes("does not support tools") ||
    lower.includes("tool not supported") ||
    lower.includes("unsupported tool")
  ) {
    return "Das ausgewählte Modell scheint Websuche/Tools nicht zu unterstützen. Bitte ein aktuelles GPT-5-Modell wählen.";
  }
  if (isModelCannotError(raw)) {
    return "Dieses Modell kann für diese Suche nicht verwendet werden. Bitte ein anderes aktuelles GPT-Modell wählen.";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "Rate Limit erreicht. Bitte kurz warten und erneut versuchen.";
  }
  return raw || "OpenAI API-Fehler.";
}

function isLikelyTextModel(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (!id) return false;
  if (!(id.startsWith("gpt-") || /^o\d/.test(id) || id.includes("omni"))) {
    return false;
  }
  if (
    /audio|realtime|transcribe|tts|vision|image|whisper|embedding|moderation|dall-e/.test(
      id
    )
  ) {
    return false;
  }
  return true;
}

function extractTextFromResponse(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  for (const output of outputs) {
    const content = Array.isArray(output?.content) ? output.content : [];
    for (const item of content) {
      if (typeof item?.text === "string") {
        chunks.push(item.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function parseTopicsJson(text) {
  if (!text) return null;
  const cleaned = String(text)
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  function extractFirstBalancedJsonObject(input) {
    const start = input.indexOf("{");
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < input.length; i += 1) {
      const ch = input[i];

      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return input.slice(start, i + 1);
        }
      }
    }
    return null;
  }

  function parseWithTrailingCommaFix(input) {
    try {
      return JSON.parse(input);
    } catch (_error) {
      const fixed = input.replace(/,\s*([}\]])/g, "$1");
      try {
        return JSON.parse(fixed);
      } catch (_error2) {
        return null;
      }
    }
  }

  const direct = parseWithTrailingCommaFix(cleaned);
  if (direct) return direct;

  const extracted = extractFirstBalancedJsonObject(cleaned);
  if (!extracted) return null;
  return parseWithTrailingCommaFix(extracted);
}

function toText(value) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeTopicPayload(parsed, limits) {
  const topicCount = Number.isInteger(limits?.topicCount) ? limits.topicCount : 5;
  const articleAnglesCount = Number.isInteger(limits?.articleAnglesCount)
    ? limits.articleAnglesCount
    : 3;
  const focusPointsCount = Number.isInteger(limits?.focusPointsCount)
    ? limits.focusPointsCount
    : 4;

  const rawTopics = Array.isArray(parsed?.topics) ? parsed.topics : [];
  const topics = rawTopics.slice(0, topicCount).map((topic) => ({
    title: toText(topic?.title),
    why_now: toText(topic?.why_now),
    complexity: toText(topic?.complexity),
    audience_potential: toText(topic?.audience_potential),
    article_angles: Array.isArray(topic?.article_angles)
      ? topic.article_angles.slice(0, articleAnglesCount).map(toText)
      : []
  }));

  const best = parsed?.best_recommendation
    ? {
        topic_title: toText(parsed.best_recommendation.topic_title),
        headline: toText(parsed.best_recommendation.headline),
        summary: toText(parsed.best_recommendation.summary),
        focus_points: Array.isArray(parsed.best_recommendation.focus_points)
          ? parsed.best_recommendation.focus_points.slice(0, focusPointsCount).map(toText)
          : []
      }
    : null;

  return { topics, bestRecommendation: best };
}

function renderPromptTemplate(templateText, variables) {
  return String(templateText || "").replace(/\{\{(\w+)\}\}/g, (_full, key) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) {
      return "";
    }
    return String(variables[key] ?? "");
  });
}

function resolveModelPolicy(modelId, runtimeConfig) {
  const exact = runtimeConfig.modelPoliciesById[modelId];
  if (exact) {
    return exact;
  }

  const normalizedModelId = String(modelId || "").toLowerCase();
  let bestMatch = null;

  for (const policy of runtimeConfig.modelPolicies) {
    const policyId = String(policy.modelId || "").toLowerCase();
    if (!policyId) {
      continue;
    }
    if (
      normalizedModelId === policyId ||
      normalizedModelId.startsWith(`${policyId}-`)
    ) {
      if (!bestMatch || policyId.length > bestMatch.modelId.length) {
        bestMatch = policy;
      }
    }
  }

  return bestMatch;
}

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getAdminTokenFromRequest(req) {
  const headerToken = String(req.header("x-admin-token") || "").trim();
  if (headerToken) {
    return headerToken;
  }

  const authHeader = String(req.header("authorization") || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return "";
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function assertAdminAccess(req) {
  const configuredToken = String(process.env.ADMIN_TOKEN || "").trim();
  if (!configuredToken) {
    throw createHttpError(
      "Admin-Zugriff ist nicht konfiguriert. Bitte ADMIN_TOKEN setzen.",
      503
    );
  }

  const providedToken = getAdminTokenFromRequest(req);
  if (!providedToken) {
    throw createHttpError(
      "Admin-Token fehlt. Bitte Header 'x-admin-token' setzen.",
      401
    );
  }

  if (!timingSafeEqualText(configuredToken, providedToken)) {
    throw createHttpError("Admin-Token ist ungueltig.", 403);
  }
}

function readRolloutId(req) {
  const explicit = String(req.header("x-rollout-id") || "").trim();
  if (explicit) {
    return explicit.slice(0, 128);
  }

  const forwarded = String(req.header("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  if (forwarded) {
    return forwarded.slice(0, 128);
  }

  const ip = String(req.ip || "").trim();
  return ip ? ip.slice(0, 128) : "anonymous";
}

function computeRolloutBucket(flagKey, rolloutId) {
  const hash = crypto
    .createHash("sha256")
    .update(`${flagKey}:${rolloutId}`)
    .digest("hex");
  const value = Number.parseInt(hash.slice(0, 8), 16);
  return Number.isFinite(value) ? value % 100 : 0;
}

function isFeatureEnabledForRequest(runtimeConfig, flagKey, req, fallback = false) {
  const featureFlagsByKey = runtimeConfig?.featureFlagsByKey || {};
  const flag = featureFlagsByKey[flagKey];
  if (!flag) {
    return fallback;
  }

  if (!flag.enabled) {
    return false;
  }

  const rolloutPercent = Number.parseInt(String(flag.rolloutPercent || 0), 10);
  if (!Number.isFinite(rolloutPercent) || rolloutPercent <= 0) {
    return false;
  }
  if (rolloutPercent >= 100) {
    return true;
  }

  const rolloutId = readRolloutId(req);
  const allowList = Array.isArray(flag.config?.rollout_ids)
    ? flag.config.rollout_ids.map((value) => String(value).trim()).filter(Boolean)
    : [];
  if (allowList.includes(rolloutId)) {
    return true;
  }

  const bucket = computeRolloutBucket(flagKey, rolloutId);
  return bucket < rolloutPercent;
}

function assertFeatureEnabledForRequest(runtimeConfig, flagKey, req, message, fallback = false) {
  const enabled = isFeatureEnabledForRequest(runtimeConfig, flagKey, req, fallback);
  if (!enabled) {
    throw createHttpError(message, 403);
  }
}

function assertAdminWriteAccess(runtimeConfig, req) {
  assertFeatureEnabledForRequest(
    runtimeConfig,
    ADMIN_WRITE_FLAG_KEY,
    req,
    "Admin-Schreibzugriff ist aktuell deaktiviert (Read-only Rollout).",
    false
  );
}

function assertHistoryEnabledForRequest(runtimeConfig, req) {
  assertFeatureEnabledForRequest(
    runtimeConfig,
    HISTORY_FLAG_KEY,
    req,
    "Verlauf ist aktuell deaktiviert.",
    true
  );
}

function parseJsonObjectInput(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(`'${fieldName}' muss ein JSON-Objekt sein.`, 400);
  }
  return value;
}

async function getFeatureFlagsByKey() {
  const flags = await listFeatureFlagsAdmin();
  return Object.fromEntries(flags.map((flag) => [flag.flagKey, flag]));
}

async function recordHistorySafe(entry) {
  try {
    await insertHistoryEntry(entry);
  } catch (error) {
    logger.error("history_persist_failed", {
      error,
      categorySlug: entry?.categorySlug || null,
      modelId: entry?.modelId || null
    });
  }
}

async function fetchOpenAIModels(apiKey, timeoutMs = FALLBACK_MODEL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}/models`, {
      method: "GET",
      headers: getAuthHeaders(apiKey),
      signal: controller.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      const timeoutError = new Error(
        "Zeitüberschreitung beim Laden der Modelle. Bitte erneut versuchen."
      );
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = mapOpenAIErrorMessage(
      payload?.error?.message || "OpenAI model list request failed."
    );
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  const models = Array.isArray(payload?.data) ? payload.data : [];
  return models
    .filter((m) => typeof m?.id === "string")
    .sort((a, b) => (b?.created || 0) - (a?.created || 0));
}

async function requestTopicIdeas({ apiKey, model, category, runtimeConfig }) {
  const categoryConfig = runtimeConfig.categoriesBySlug[category];
  if (!categoryConfig) {
    throw runtimeConfigError(
      "Ungültige Kategorie. Bitte eine verfügbare Kategorie auswählen.",
      400
    );
  }

  const modelPolicy = resolveModelPolicy(model, runtimeConfig);
  if (!modelPolicy) {
    throw runtimeConfigError(
      "Das gewählte Modell ist nicht freigegeben. Bitte ein verfügbares Modell wählen.",
      400
    );
  }

  if (!modelPolicy.supportsWebSearch) {
    throw runtimeConfigError(
      `Die Modell-Policy für '${model}' erlaubt keine Websuche. Bitte Modell-Policy prüfen.`,
      400
    );
  }

  const prompt = renderPromptTemplate(runtimeConfig.promptTemplate.templateText, {
    category_label: categoryConfig.label,
    category_instruction: categoryConfig.instruction,
    topic_count: runtimeConfig.settings.topicCount
  });

  const runResponsesRequest = async (body) => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      runtimeConfig.settings.searchTimeoutMs
    );
    let response;
    try {
      response = await fetch(`${OPENAI_BASE_URL}/responses`, {
        method: "POST",
        headers: getAuthHeaders(apiKey),
        signal: controller.signal,
        body: JSON.stringify(body)
      });
    } catch (error) {
      if (isAbortError(error)) {
        const timeoutError = new Error(
          "Die Themensuche hat zu lange gedauert (Timeout). Bitte erneut suchen oder ein anderes Modell wählen."
        );
        timeoutError.statusCode = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  };

  const baseBody = {
    model,
    input: prompt,
    max_output_tokens: modelPolicy.maxOutputTokens,
    tools: [
      {
        type: "web_search",
        search_context_size: modelPolicy.searchContextSize
      }
    ]
  };

  const structuredBody = modelPolicy.enableStructuredOutput
    ? {
        ...baseBody,
        text: {
          format: {
            type: "json_schema",
            name: `${runtimeConfig.outputSchema.key}_v${runtimeConfig.outputSchema.version}`,
            strict: runtimeConfig.outputSchema.strictMode,
            schema: runtimeConfig.outputSchema.schema
          }
        }
      }
    : baseBody;

  let requestResult = await runResponsesRequest(structuredBody);

  if (!requestResult.response.ok) {
    const upstreamMessage = requestResult.payload?.error?.message || "";
    if (modelPolicy.enableStructuredOutput && isUnsupportedFormatError(upstreamMessage)) {
      requestResult = await runResponsesRequest({
        ...baseBody,
        input: [
          prompt,
          "Antwort ausschließlich als valides JSON-Objekt im bereits geforderten Schema."
        ].join("\n")
      });
    }
  } else if (
    requestResult.payload?.status === "incomplete" &&
    requestResult.payload?.incomplete_details?.reason === "max_output_tokens"
  ) {
    requestResult = await runResponsesRequest({
      ...structuredBody,
      max_output_tokens: modelPolicy.maxRetryOutputTokens
    });
  }

  const { response, payload } = requestResult;
  if (!response.ok) {
    const message = mapOpenAIErrorMessage(
      payload?.error?.message || "Responses API request failed for topic search."
    );
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  const rawText = extractTextFromResponse(payload);
  let parsed = parseTopicsJson(rawText);

  if (!parsed) {
    // Second pass: let the model convert its own raw text into strict JSON.
    const repairPrompt = [
      "Konvertiere den folgenden Inhalt in valides JSON.",
      "Nutze exakt dieses Schema mit Schlüsseln 'topics' und 'best_recommendation'.",
      "Antwort NUR mit JSON, ohne Einleitung.",
      "",
      rawText
    ].join("\n");

    let repairResult = await runResponsesRequest({
      model,
      input: repairPrompt,
      max_output_tokens: modelPolicy.maxRetryOutputTokens,
      text: { format: { type: "json_object" } }
    });

    if (!repairResult.response.ok) {
      const repairMessage = repairResult.payload?.error?.message || "";
      if (isUnsupportedFormatError(repairMessage)) {
        repairResult = await runResponsesRequest({
          model,
          input: repairPrompt,
          max_output_tokens: modelPolicy.maxRetryOutputTokens
        });
      }
    }

    if (!repairResult.response.ok) {
      const message = mapOpenAIErrorMessage(
        repairResult.payload?.error?.message ||
          "Responses API request failed while repairing JSON."
      );
      const error = new Error(message);
      error.statusCode = repairResult.response.status;
      throw error;
    }

    parsed = parseTopicsJson(extractTextFromResponse(repairResult.payload));
  }

  if (!parsed) {
    throw new Error(
      "Die Modellantwort konnte nicht als JSON verarbeitet werden. Bitte anderes Modell wählen oder erneut suchen."
    );
  }

  const normalized = normalizeTopicPayload(parsed, runtimeConfig.settings);
  if (!normalized.topics.length) {
    throw new Error(
      "Die Antwort enthielt keine verwertbaren Themen. Bitte erneut versuchen."
    );
  }
  return normalized;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "Medium Tracker" });
});

app.post("/api/verify-key", async (req, res) => {
  const { apiKey } = req.body || {};

  if (!looksLikeApiKey(apiKey)) {
    return res.status(400).json({
      ok: false,
      message: "API-Key-Format ungültig. Erwartet wird ein Key mit 'sk-'."
    });
  }

  try {
    const runtimeConfig = await getRuntimeConfig();
    await fetchOpenAIModels(apiKey, runtimeConfig.settings.modelTimeoutMs);
    return res.json({ ok: true, message: "API-Key erfolgreich verifiziert." });
  } catch (error) {
    const status = error.statusCode || 401;
    return res.status(status).json({
      ok: false,
      message: `Verifizierung fehlgeschlagen: ${error.message}`
    });
  }
});

app.get("/api/models", async (req, res) => {
  const apiKey = req.header("x-openai-api-key");

  if (!looksLikeApiKey(apiKey)) {
    return res.status(400).json({
      ok: false,
      message: "Kein gültiger API-Key im Header 'x-openai-api-key'."
    });
  }

  try {
    const runtimeConfig = await getRuntimeConfig();
    const models = await fetchOpenAIModels(apiKey, runtimeConfig.settings.modelTimeoutMs);
    const latestModels = models
      .filter((m) => isLikelyTextModel(m.id))
      .map((modelInfo) => ({
        modelInfo,
        policy: resolveModelPolicy(modelInfo.id, runtimeConfig)
      }))
      .filter((entry) => Boolean(entry.policy))
      .sort((a, b) => {
        const rank = a.policy.priority - b.policy.priority;
        if (rank !== 0) {
          return rank;
        }
        return (b.modelInfo?.created || 0) - (a.modelInfo?.created || 0);
      })
      .slice(0, 30)
      .map(({ modelInfo }) => ({
        id: modelInfo.id,
        created: modelInfo.created || null,
        ownedBy: modelInfo.owned_by || null
      }));

    return res.json({ ok: true, models: latestModels });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      ok: false,
      message: `Modelle konnten nicht geladen werden: ${error.message}`
    });
  }
});

app.get("/api/categories", async (_req, res) => {
  try {
    const runtimeConfig = await getRuntimeConfig();
    return res.json({
      ok: true,
      defaultCategory: runtimeConfig.defaultCategory,
      categories: runtimeConfig.categories.map((category) => ({
        slug: category.slug,
        label: category.label,
        instruction: category.instruction
      }))
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      ok: false,
      message: `Kategorien konnten nicht geladen werden: ${error.message}`
    });
  }
});

function respondWithRouteError(res, error, prefixMessage) {
  const status = error?.statusCode || 500;
  const level = status >= 500 ? "error" : "warn";
  logger[level]("route_error", {
    statusCode: status,
    message: prefixMessage,
    error
  });
  return res.status(status).json({
    ok: false,
    message: `${prefixMessage}: ${error.message}`
  });
}

app.get("/api/admin/feature-flags", async (req, res) => {
  try {
    assertAdminAccess(req);
    const flags = await listFeatureFlagsAdmin();
    const featureFlagsByKey = Object.fromEntries(
      flags.map((flag) => [flag.flagKey, flag])
    );
    return res.json({
      ok: true,
      categoryAdminEnabledForRequest: isFeatureEnabledForRequest(
        { featureFlagsByKey },
        "category_admin_enabled",
        req,
        true
      ),
      dynamicConfigEnabledForRequest: isFeatureEnabledForRequest(
        { featureFlagsByKey },
        "dynamic_config_enabled",
        req,
        true
      ),
      adminWriteEnabledForRequest: isFeatureEnabledForRequest(
        { featureFlagsByKey },
        ADMIN_WRITE_FLAG_KEY,
        req,
        false
      ),
      flags
    });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Feature-Flags konnten nicht geladen werden"
    );
  }
});

app.put("/api/admin/feature-flags/:flagKey", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    assertAdminWriteAccess({ featureFlagsByKey }, req);

    const payload = req.body || {};
    const updateInput = { flagKey: req.params.flagKey };
    if (Object.prototype.hasOwnProperty.call(payload, "enabled")) {
      updateInput.enabled = payload.enabled;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "rolloutPercent")) {
      updateInput.rolloutPercent = payload.rolloutPercent;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "description")) {
      updateInput.description = payload.description;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "config")) {
      if (payload.config !== undefined) {
        parseJsonObjectInput(payload.config, "config");
        updateInput.config = payload.config;
      }
    }

    const flag = await upsertFeatureFlag(updateInput);

    invalidateRuntimeConfigCache();

    return res.json({
      ok: true,
      flag
    });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Feature-Flag konnte nicht gespeichert werden"
    );
  }
});

app.get("/api/admin/categories", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    const categories = await listAdminCategories();
    const defaultCategory = await readAppSettingString("default_topic_category");
    return res.json({
      ok: true,
      managementEnabled: isFeatureEnabledForRequest(
        { featureFlagsByKey },
        "category_admin_enabled",
        req,
        true
      ),
      defaultCategory,
      categories
    });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Admin-Kategorien konnten nicht geladen werden"
    );
  }
});

app.post("/api/admin/categories", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    assertAdminWriteAccess({ featureFlagsByKey }, req);
    assertFeatureEnabledForRequest(
      { featureFlagsByKey },
      "category_admin_enabled",
      req,
      "Kategorie-Admin ist aktuell deaktiviert.",
      true
    );

    const category = await createAdminCategory({
      slug: req.body?.slug,
      label: req.body?.label,
      instruction: req.body?.instruction,
      sortOrder: req.body?.sortOrder,
      isActive: req.body?.isActive
    });
    invalidateRuntimeConfigCache();
    return res.status(201).json({ ok: true, category });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Kategorie konnte nicht erstellt werden"
    );
  }
});

app.patch("/api/admin/categories/:slug", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    assertAdminWriteAccess({ featureFlagsByKey }, req);
    assertFeatureEnabledForRequest(
      { featureFlagsByKey },
      "category_admin_enabled",
      req,
      "Kategorie-Admin ist aktuell deaktiviert.",
      true
    );

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(body, "label")) {
      patch.label = body.label;
    }
    if (Object.prototype.hasOwnProperty.call(body, "instruction")) {
      patch.instruction = body.instruction;
    }
    if (Object.prototype.hasOwnProperty.call(body, "sortOrder")) {
      patch.sortOrder = body.sortOrder;
    }
    if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
      patch.isActive = body.isActive;
    }

    const category = await updateAdminCategory(req.params.slug, patch);
    if (!category) {
      return res.status(404).json({
        ok: false,
        message: "Kategorie nicht gefunden."
      });
    }
    invalidateRuntimeConfigCache();
    return res.json({ ok: true, category });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Kategorie konnte nicht aktualisiert werden"
    );
  }
});

app.delete("/api/admin/categories/:slug", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    assertAdminWriteAccess({ featureFlagsByKey }, req);
    assertFeatureEnabledForRequest(
      { featureFlagsByKey },
      "category_admin_enabled",
      req,
      "Kategorie-Admin ist aktuell deaktiviert.",
      true
    );

    const category = await deactivateAdminCategory(req.params.slug);
    if (!category) {
      return res.status(404).json({
        ok: false,
        message: "Kategorie nicht gefunden."
      });
    }
    invalidateRuntimeConfigCache();
    return res.json({
      ok: true,
      category
    });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Kategorie konnte nicht deaktiviert werden"
    );
  }
});

app.get("/api/admin/prompt-templates", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    const promptTemplates = await listPromptTemplatesAdmin();
    return res.json({
      ok: true,
      managementEnabled: isFeatureEnabledForRequest(
        { featureFlagsByKey },
        "dynamic_config_enabled",
        req,
        true
      ),
      activeTemplateKey: promptTemplates.activeTemplateKey,
      items: promptTemplates.items
    });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Prompt-Templates konnten nicht geladen werden"
    );
  }
});

app.post("/api/admin/prompt-templates/versions", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    assertAdminWriteAccess({ featureFlagsByKey }, req);
    assertFeatureEnabledForRequest(
      { featureFlagsByKey },
      "dynamic_config_enabled",
      req,
      "Dynamische Konfiguration ist aktuell deaktiviert.",
      true
    );

    const item = await createPromptTemplateVersion({
      templateKey: req.body?.templateKey,
      locale: req.body?.locale,
      templateText: req.body?.templateText,
      activate: req.body?.activate,
      setAsDefaultKey: req.body?.setAsDefaultKey
    });
    invalidateRuntimeConfigCache();
    return res.status(201).json({ ok: true, item });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Prompt-Template-Version konnte nicht erstellt werden"
    );
  }
});

app.post("/api/admin/prompt-templates/activate", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    assertAdminWriteAccess({ featureFlagsByKey }, req);
    assertFeatureEnabledForRequest(
      { featureFlagsByKey },
      "dynamic_config_enabled",
      req,
      "Dynamische Konfiguration ist aktuell deaktiviert.",
      true
    );

    const item = await activatePromptTemplateVersion({
      templateKey: req.body?.templateKey,
      version: req.body?.version,
      setAsDefaultKey: req.body?.setAsDefaultKey
    });
    if (!item) {
      return res.status(404).json({
        ok: false,
        message: "Prompt-Template-Version nicht gefunden."
      });
    }
    invalidateRuntimeConfigCache();
    return res.json({ ok: true, item });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Prompt-Template konnte nicht aktiviert werden"
    );
  }
});

app.get("/api/admin/model-policies", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    const items = await listModelPoliciesAdmin();
    return res.json({
      ok: true,
      managementEnabled: isFeatureEnabledForRequest(
        { featureFlagsByKey },
        "dynamic_config_enabled",
        req,
        true
      ),
      items
    });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Modell-Policies konnten nicht geladen werden"
    );
  }
});

app.post("/api/admin/model-policies", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    assertAdminWriteAccess({ featureFlagsByKey }, req);
    assertFeatureEnabledForRequest(
      { featureFlagsByKey },
      "dynamic_config_enabled",
      req,
      "Dynamische Konfiguration ist aktuell deaktiviert.",
      true
    );

    const item = await createModelPolicy({
      modelId: req.body?.modelId,
      enabled: req.body?.enabled,
      priority: req.body?.priority,
      supportsWebSearch: req.body?.supportsWebSearch,
      searchContextSize: req.body?.searchContextSize,
      maxOutputTokens: req.body?.maxOutputTokens,
      maxRetryOutputTokens: req.body?.maxRetryOutputTokens,
      enableStructuredOutput: req.body?.enableStructuredOutput
    });
    invalidateRuntimeConfigCache();
    return res.status(201).json({ ok: true, item });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Modell-Policy konnte nicht erstellt werden"
    );
  }
});

app.patch("/api/admin/model-policies/:modelId", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    assertAdminWriteAccess({ featureFlagsByKey }, req);
    assertFeatureEnabledForRequest(
      { featureFlagsByKey },
      "dynamic_config_enabled",
      req,
      "Dynamische Konfiguration ist aktuell deaktiviert.",
      true
    );

    const item = await updateModelPolicy(req.params.modelId, {
      enabled: req.body?.enabled,
      priority: req.body?.priority,
      supportsWebSearch: req.body?.supportsWebSearch,
      searchContextSize: req.body?.searchContextSize,
      maxOutputTokens: req.body?.maxOutputTokens,
      maxRetryOutputTokens: req.body?.maxRetryOutputTokens,
      enableStructuredOutput: req.body?.enableStructuredOutput
    });
    if (!item) {
      return res.status(404).json({
        ok: false,
        message: "Modell-Policy nicht gefunden."
      });
    }
    invalidateRuntimeConfigCache();
    return res.json({ ok: true, item });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Modell-Policy konnte nicht aktualisiert werden"
    );
  }
});

app.delete("/api/admin/model-policies/:modelId", async (req, res) => {
  try {
    assertAdminAccess(req);
    const featureFlagsByKey = await getFeatureFlagsByKey();
    assertAdminWriteAccess({ featureFlagsByKey }, req);
    assertFeatureEnabledForRequest(
      { featureFlagsByKey },
      "dynamic_config_enabled",
      req,
      "Dynamische Konfiguration ist aktuell deaktiviert.",
      true
    );

    const deleted = await deleteModelPolicy(req.params.modelId);
    if (!deleted) {
      return res.status(404).json({
        ok: false,
        message: "Modell-Policy nicht gefunden."
      });
    }
    invalidateRuntimeConfigCache();
    return res.json({ ok: true });
  } catch (error) {
    return respondWithRouteError(
      res,
      error,
      "Modell-Policy konnte nicht geloescht werden"
    );
  }
});

app.get("/api/history", async (req, res) => {
  const limit = normalizePositiveInt(req.query?.limit, 20, 1, 100);
  const offset = normalizeOffset(req.query?.offset, 0);

  try {
    const runtimeConfig = await getRuntimeConfig();
    assertHistoryEnabledForRequest(runtimeConfig, req);

    const history = await listHistory({ limit, offset });
    return res.json({
      ok: true,
      limit: history.limit,
      offset: history.offset,
      items: history.items
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      ok: false,
      message: `Verlauf konnte nicht geladen werden: ${error.message}`
    });
  }
});

app.get("/api/history/:id", async (req, res) => {
  try {
    const runtimeConfig = await getRuntimeConfig();
    assertHistoryEnabledForRequest(runtimeConfig, req);

    const entry = await getHistoryEntryById(req.params.id);
    if (!entry) {
      return res.status(404).json({
        ok: false,
        message: "Verlaufseintrag nicht gefunden."
      });
    }
    return res.json({ ok: true, item: entry });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      ok: false,
      message: `Verlaufseintrag konnte nicht geladen werden: ${error.message}`
    });
  }
});

app.delete("/api/history/:id", async (req, res) => {
  try {
    const runtimeConfig = await getRuntimeConfig();
    assertHistoryEnabledForRequest(runtimeConfig, req);

    const deleted = await deleteHistoryEntryById(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        ok: false,
        message: "Verlaufseintrag nicht gefunden."
      });
    }
    return res.json({ ok: true });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      ok: false,
      message: `Verlaufseintrag konnte nicht geloescht werden: ${error.message}`
    });
  }
});

app.post("/api/find-topics", async (req, res) => {
  const { apiKey, model, category } = req.body || {};

  if (!looksLikeApiKey(apiKey)) {
    return res.status(400).json({
      ok: false,
      message: "API-Key fehlt oder ist ungültig."
    });
  }

  if (typeof model !== "string" || !model.trim()) {
    return res.status(400).json({
      ok: false,
      message: "Bitte ein Modell auswählen."
    });
  }

  const startedAtMs = Date.now();
  const selectedModel = model.trim();
  let selectedCategory = "unknown";
  let selectedCategoryLabel = "Unbekannt";
  let historyEnabledForRequest = true;

  try {
    const runtimeConfig = await getRuntimeConfig();
    historyEnabledForRequest = isFeatureEnabledForRequest(
      runtimeConfig,
      HISTORY_FLAG_KEY,
      req,
      true
    );
    selectedCategory = typeof category === "string" && category.trim()
      ? category.trim()
      : runtimeConfig.defaultCategory;

    if (!Object.prototype.hasOwnProperty.call(runtimeConfig.categoriesBySlug, selectedCategory)) {
      return res.status(400).json({
        ok: false,
        message: "Ungültige Kategorie. Bitte eine verfügbare Kategorie auswählen."
      });
    }

    const result = await requestTopicIdeas({
      apiKey,
      model: selectedModel,
      category: selectedCategory,
      runtimeConfig
    });

    const categoryConfig = runtimeConfig.categoriesBySlug[selectedCategory];
    selectedCategoryLabel = categoryConfig.label;
    const responsePayload = {
      ok: true,
      model: selectedModel,
      category: selectedCategory,
      categoryLabel: categoryConfig.label,
      topics: result.topics,
      bestRecommendation: result.bestRecommendation
    };

    if (historyEnabledForRequest) {
      await recordHistorySafe({
        categorySlug: selectedCategory,
        modelId: selectedModel,
        requestContext: {
          categoryLabel: categoryConfig.label
        },
        resultPayload: {
          model: selectedModel,
          category: selectedCategory,
          categoryLabel: categoryConfig.label,
          topics: result.topics,
          bestRecommendation: result.bestRecommendation
        },
        latencyMs: Date.now() - startedAtMs,
        status: "success"
      });
    }

    return res.json(responsePayload);
  } catch (error) {
    if (historyEnabledForRequest) {
      await recordHistorySafe({
        categorySlug: selectedCategory,
        modelId: selectedModel,
        requestContext: {
          categoryLabel: selectedCategoryLabel
        },
        resultPayload: {},
        latencyMs: Date.now() - startedAtMs,
        status: "error",
        errorMessage: String(error?.message || "Unbekannter Fehler")
      });
    }

    const status = error.statusCode || 500;
    return res.status(status).json({
      ok: false,
      message: `Themensuche fehlgeschlagen: ${error.message}`
    });
  }
});

app.use((error, _req, res, _next) => {
  const status = error?.statusCode || error?.status || 500;
  if (error?.type === "entity.parse.failed") {
    logger.warn("invalid_json_body", { statusCode: 400, error });
    return res.status(400).json({
      ok: false,
      message: "Ungueltiges JSON im Request-Body."
    });
  }
  if (error?.type === "entity.too.large") {
    logger.warn("request_body_too_large", { statusCode: 413, error });
    return res.status(413).json({
      ok: false,
      message: "Request-Body ist zu gross. Bitte weniger als 1 MB senden."
    });
  }

  logger.error("unhandled_route_error", {
    statusCode: status,
    error
  });
  return res.status(status).json({
    ok: false,
    message: error?.message || "Unerwarteter Serverfehler."
  });
});

function startServer(port = PORT) {
  const server = app.listen(port, () => {
    logger.info("server_started", { port: Number(port) || port });
  });
  return server;
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = {
  app,
  startServer,
  _test: {
    sanitizeForLogging,
    isFeatureEnabledForRequest,
    computeRolloutBucket
  }
};
