require("./load-env");

const express = require("express");
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
const REQUEST_ID_MAX_LENGTH = 128;

app.disable("x-powered-by");
app.use(requestContextMiddleware);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
});
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

function normalizeHeaderToken(value, maxLength = REQUEST_ID_MAX_LENGTH) {
  return String(value || "")
    .trim()
    .replace(/[^\w.-]/g, "")
    .slice(0, maxLength);
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

function isUnsupportedParameterError(message, parameterName) {
  const lower = String(message || "").toLowerCase();
  const target = String(parameterName || "").toLowerCase();
  if (!target) {
    return false;
  }
  return (
    (lower.includes("unsupported parameter") ||
      lower.includes("unknown parameter") ||
      lower.includes("unrecognized parameter")) &&
    lower.includes(target)
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
    return "Das ausgewaehlte Modell scheint Websuche/Tools nicht zu unterstuetzen. Bitte ein aktuelles Modell wie gpt-5, gpt-5-mini oder o4-mini waehlen.";
  }
  if (isModelCannotError(raw)) {
    return "Dieses Modell kann fuer diese Suche nicht verwendet werden. Bitte ein anderes aktuelles Modell waehlen.";
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

function normalizeSourceUrl(value) {
  const raw = toText(value);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch (_error) {
    return raw;
  }
}

function getSourceDomain(value) {
  const normalizedUrl = normalizeSourceUrl(value);
  if (!normalizedUrl) {
    return "";
  }

  try {
    return new URL(normalizedUrl).hostname.replace(/^www\./i, "");
  } catch (_error) {
    return "";
  }
}

function createWebSourceEntry(candidate) {
  const normalizedUrl = normalizeSourceUrl(candidate?.url);
  if (!normalizedUrl) {
    return null;
  }

  return {
    url: normalizedUrl,
    title: toText(candidate?.title),
    domain: getSourceDomain(normalizedUrl),
    type: toText(candidate?.type) || "url"
  };
}

function mergeWebSources(...lists) {
  const byUrl = new Map();

  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }

    for (const source of list) {
      const entry = createWebSourceEntry(source);
      if (!entry) {
        continue;
      }

      const existing = byUrl.get(entry.url);
      if (!existing) {
        byUrl.set(entry.url, entry);
        continue;
      }

      byUrl.set(entry.url, {
        ...existing,
        title: existing.title || entry.title,
        domain: existing.domain || entry.domain,
        type: existing.type || entry.type
      });
    }
  }

  return Array.from(byUrl.values()).sort((left, right) => {
    const leftKey = `${left.title || left.domain || left.url}\u0000${left.url}`;
    const rightKey = `${right.title || right.domain || right.url}\u0000${right.url}`;
    return leftKey.localeCompare(rightKey, "de");
  });
}

function extractAnnotatedWebSources(payload) {
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  const sources = [];

  for (const output of outputs) {
    const content = Array.isArray(output?.content) ? output.content : [];
    for (const item of content) {
      const annotations = Array.isArray(item?.annotations) ? item.annotations : [];
      for (const annotation of annotations) {
        const source = createWebSourceEntry({
          url: annotation?.url || annotation?.uri,
          title: annotation?.title,
          type: annotation?.type
        });
        if (source) {
          sources.push(source);
        }
      }
    }
  }

  return sources;
}

function extractToolWebSources(payload) {
  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  const sources = [];

  for (const output of outputs) {
    if (output?.type !== "web_search_call") {
      continue;
    }

    const actionSources = Array.isArray(output?.action?.sources)
      ? output.action.sources
      : [];
    for (const actionSource of actionSources) {
      const source = createWebSourceEntry({
        url: actionSource?.url,
        title: actionSource?.title,
        type: actionSource?.type
      });
      if (source) {
        sources.push(source);
      }
    }
  }

  return sources;
}

function extractWebSources(payloads) {
  let collected = [];
  for (const payload of Array.isArray(payloads) ? payloads : []) {
    collected = mergeWebSources(
      collected,
      extractToolWebSources(payload),
      extractAnnotatedWebSources(payload)
    );
  }
  return collected;
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
      normalizedModelId.startsWith(`${policyId}-`) ||
      normalizedModelId.startsWith(`${policyId}.`)
    ) {
      if (!bestMatch || policyId.length > bestMatch.modelId.length) {
        bestMatch = policy;
      }
    }
  }

  return bestMatch;
}

function inferModelPolicy(modelId, runtimeConfig) {
  if (!isLikelyTextModel(modelId)) {
    return null;
  }

  const existing = resolveModelPolicy(modelId, runtimeConfig);
  if (existing) {
    return existing;
  }

  const normalizedModelId = String(modelId || "").toLowerCase();
  const familyHints = [
    "gpt-5.4",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5",
    "gpt-4.1",
    "gpt-4o",
    "o4-mini",
    "o3"
  ];

  for (const hint of familyHints) {
    const hintedPolicy = runtimeConfig.modelPoliciesById[hint];
    if (
      hintedPolicy &&
      hintedPolicy.enabled &&
      (normalizedModelId === hint ||
        normalizedModelId.startsWith(`${hint}-`) ||
        normalizedModelId.startsWith(`${hint}.`))
    ) {
      return {
        ...hintedPolicy,
        modelId
      };
    }
  }

  const firstWebSearchPolicy = runtimeConfig.modelPolicies.find(
    (policy) => policy.enabled && policy.supportsWebSearch
  );
  if (firstWebSearchPolicy) {
    return {
      ...firstWebSearchPolicy,
      modelId,
      priority: Number(firstWebSearchPolicy.priority || 1000) + 1000
    };
  }

  return {
    modelId,
    enabled: true,
    priority: 5000,
    supportsWebSearch: true,
    searchContextSize: "low",
    maxOutputTokens: 1800,
    maxRetryOutputTokens: 2600,
    enableStructuredOutput: true
  };
}

async function getOptionalRuntimeConfig() {
  try {
    return await getRuntimeConfig();
  } catch (error) {
    logger.warn("optional_runtime_config_unavailable", { error });
    return null;
  }
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
  const explicit = normalizeHeaderToken(req.header("x-rollout-id"));
  if (explicit) {
    return explicit;
  }

  const forwarded = req.app.get("trust proxy")
    ? normalizeHeaderToken(String(req.header("x-forwarded-for") || "").split(",")[0])
    : "";
  if (forwarded) {
    return forwarded;
  }

  const ip = normalizeHeaderToken(req.ip);
  return ip || "anonymous";
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

  const modelPolicy = inferModelPolicy(model, runtimeConfig);
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

  const searchRequestCompat = {
    includeWebSearchSources: true,
    toolChoiceAuto: true
  };

  function applySearchRequestCompat(body) {
    const hasTools = Array.isArray(body?.tools) && body.tools.length > 0;
    if (!hasTools) {
      return body;
    }

    const nextBody = { ...body };
    if (searchRequestCompat.includeWebSearchSources) {
      nextBody.include = ["web_search_call.action.sources"];
    }
    if (searchRequestCompat.toolChoiceAuto) {
      nextBody.tool_choice = "auto";
    }
    return nextBody;
  }

  async function runCompatibleResponsesRequest(body) {
    let requestResult = await runResponsesRequest(applySearchRequestCompat(body));
    let attempts = 0;

    while (!requestResult.response.ok && attempts < 2) {
      const upstreamMessage = requestResult.payload?.error?.message || "";
      let changed = false;

      if (
        searchRequestCompat.includeWebSearchSources &&
        isUnsupportedParameterError(upstreamMessage, "include")
      ) {
        searchRequestCompat.includeWebSearchSources = false;
        changed = true;
      }

      if (
        searchRequestCompat.toolChoiceAuto &&
        isUnsupportedParameterError(upstreamMessage, "tool_choice")
      ) {
        searchRequestCompat.toolChoiceAuto = false;
        changed = true;
      }

      if (!changed) {
        break;
      }

      requestResult = await runResponsesRequest(applySearchRequestCompat(body));
      attempts += 1;
    }

    return requestResult;
  }

  const buildSearchBody = (overrides = {}) => ({
    model,
    input: prompt,
    max_output_tokens: modelPolicy.maxOutputTokens,
    tools: [
      {
        type: "web_search",
        search_context_size: modelPolicy.searchContextSize
      }
    ],
    ...overrides
  });

  const baseBody = buildSearchBody();

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

  const searchPayloads = [];
  let requestResult = await runCompatibleResponsesRequest(structuredBody);
  if (requestResult.response.ok) {
    searchPayloads.push(requestResult.payload);
  }

  if (!requestResult.response.ok) {
    const upstreamMessage = requestResult.payload?.error?.message || "";
    if (modelPolicy.enableStructuredOutput && isUnsupportedFormatError(upstreamMessage)) {
      requestResult = await runCompatibleResponsesRequest(
        buildSearchBody({
          input: [
          prompt,
          "Antwort ausschließlich als valides JSON-Objekt im bereits geforderten Schema."
          ].join("\n")
        })
      );
      if (requestResult.response.ok) {
        searchPayloads.push(requestResult.payload);
      }
    }
  } else if (
    requestResult.payload?.status === "incomplete" &&
    requestResult.payload?.incomplete_details?.reason === "max_output_tokens"
  ) {
    requestResult = await runCompatibleResponsesRequest({
      ...structuredBody,
      max_output_tokens: modelPolicy.maxRetryOutputTokens
    });
    if (requestResult.response.ok) {
      searchPayloads.push(requestResult.payload);
    }
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

  return {
    ...normalized,
    sources: extractWebSources(searchPayloads)
  };
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
    const runtimeConfig = await getOptionalRuntimeConfig();
    const timeoutMs = runtimeConfig?.settings?.modelTimeoutMs || FALLBACK_MODEL_TIMEOUT_MS;
    await fetchOpenAIModels(apiKey, timeoutMs);
    return res.json({ ok: true, message: "API-Key erfolgreich verifiziert." });
  } catch (error) {
    const status = error.statusCode || 401;
    return res.status(status).json({
      ok: false,
      message:
        status >= 500
          ? "Verifizierung fehlgeschlagen. Bitte spaeter erneut versuchen."
          : `Verifizierung fehlgeschlagen: ${error.message}`
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
    const runtimeConfig = await getOptionalRuntimeConfig();
    const timeoutMs = runtimeConfig?.settings?.modelTimeoutMs || FALLBACK_MODEL_TIMEOUT_MS;
    const models = await fetchOpenAIModels(apiKey, timeoutMs);
    const textModels = models.filter((m) => isLikelyTextModel(m.id));
    const latestModels = runtimeConfig
      ? textModels
          .map((modelInfo) => ({
            modelInfo,
            policy: inferModelPolicy(modelInfo.id, runtimeConfig)
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
          }))
      : textModels.slice(0, 30).map((modelInfo) => ({
          id: modelInfo.id,
          created: modelInfo.created || null,
          ownedBy: modelInfo.owned_by || null
        }));

    return res.json({ ok: true, models: latestModels });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      ok: false,
      message:
        status >= 500
          ? "Modelle konnten nicht geladen werden. Bitte spaeter erneut versuchen."
          : `Modelle konnten nicht geladen werden: ${error.message}`
    });
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const runtimeConfig = await getRuntimeConfig();
    return res.json({
      ok: true,
      runtimeMode: runtimeConfig.source || "database",
      historyEnabled: isFeatureEnabledForRequest(
        runtimeConfig,
        HISTORY_FLAG_KEY,
        req,
        true
      ),
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
      message:
        status >= 500
          ? "Kategorien konnten nicht geladen werden. Bitte spaeter erneut versuchen."
          : `Kategorien konnten nicht geladen werden: ${error.message}`
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
    message:
      status >= 500
        ? `${prefixMessage}. Bitte spaeter erneut versuchen.`
        : `${prefixMessage}: ${error.message}`
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
      message:
        status >= 500
          ? "Verlauf konnte nicht geladen werden. Bitte spaeter erneut versuchen."
          : `Verlauf konnte nicht geladen werden: ${error.message}`
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
      message:
        status >= 500
          ? "Verlaufseintrag konnte nicht geladen werden. Bitte spaeter erneut versuchen."
          : `Verlaufseintrag konnte nicht geladen werden: ${error.message}`
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
      message:
        status >= 500
          ? "Verlaufseintrag konnte nicht geloescht werden. Bitte spaeter erneut versuchen."
          : `Verlaufseintrag konnte nicht geloescht werden: ${error.message}`
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
      bestRecommendation: result.bestRecommendation,
      sources: result.sources
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
          bestRecommendation: result.bestRecommendation,
          sources: result.sources
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
      message:
        status >= 500
          ? "Themensuche fehlgeschlagen. Bitte spaeter erneut versuchen."
          : `Themensuche fehlgeschlagen: ${error.message}`
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
    message:
      status >= 500
        ? "Unerwarteter Serverfehler. Bitte spaeter erneut versuchen."
        : (error?.message || "Unerwarteter Serverfehler.")
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
