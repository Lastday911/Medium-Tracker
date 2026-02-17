const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const MODEL_TIMEOUT_MS = 30000;
const SEARCH_TIMEOUT_MS = 120000;

const TOPIC_OUTPUT_SCHEMA = {
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
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

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

function modelPriority(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (/^gpt-5\.2($|-)/.test(id)) return 1;
  if (/^gpt-5-mini($|-)/.test(id)) return 2;
  if (/^gpt-5-nano($|-)/.test(id)) return 3;
  if (/^gpt-5\.1($|-)/.test(id)) return 4;
  if (/^gpt-5($|-)/.test(id)) return 5;
  if (/^gpt-4\.1($|-)/.test(id)) return 6;
  return 99;
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

function normalizeTopicPayload(parsed) {
  const rawTopics = Array.isArray(parsed?.topics) ? parsed.topics : [];
  const topics = rawTopics.slice(0, 5).map((topic) => ({
    title: toText(topic?.title),
    why_now: toText(topic?.why_now),
    complexity: toText(topic?.complexity),
    audience_potential: toText(topic?.audience_potential),
    article_angles: Array.isArray(topic?.article_angles)
      ? topic.article_angles.slice(0, 3).map(toText)
      : []
  }));

  const best = parsed?.best_recommendation
    ? {
        topic_title: toText(parsed.best_recommendation.topic_title),
        headline: toText(parsed.best_recommendation.headline),
        summary: toText(parsed.best_recommendation.summary),
        focus_points: Array.isArray(parsed.best_recommendation.focus_points)
          ? parsed.best_recommendation.focus_points.slice(0, 4).map(toText)
          : []
      }
    : null;

  return { topics, bestRecommendation: best };
}

async function fetchOpenAIModels(apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
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

async function requestTopicIdeas({ apiKey, model }) {
  const prompt = [
    "Du bist ein Research-Assistent für Medium-Autoren.",
    "Nutze Websuche fokussiert auf die letzten Wochen und liefere NUR 5 trendende KI-Themen.",
    "Die Themen sollen anspruchsvoll und erklärungsbedürftig sein (nicht trivial).",
    "Jedes Thema braucht klare journalistische Einordnung für Medium."
  ].join("\n");

  const runResponsesRequest = async (body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
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
    max_output_tokens: 1800,
    tools: [{ type: "web_search", search_context_size: "low" }]
  };

  const structuredBody = {
    ...baseBody,
    text: {
      format: {
        type: "json_schema",
        name: "medium_tracker_topics",
        strict: true,
        schema: TOPIC_OUTPUT_SCHEMA
      }
    }
  };

  let requestResult = await runResponsesRequest(structuredBody);

  if (!requestResult.response.ok) {
    const upstreamMessage = requestResult.payload?.error?.message || "";
    if (isUnsupportedFormatError(upstreamMessage)) {
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
      max_output_tokens: 2600
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
      max_output_tokens: 2000,
      text: { format: { type: "json_object" } }
    });

    if (!repairResult.response.ok) {
      const repairMessage = repairResult.payload?.error?.message || "";
      if (isUnsupportedFormatError(repairMessage)) {
        repairResult = await runResponsesRequest({
          model,
          input: repairPrompt,
          max_output_tokens: 2000
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

  const normalized = normalizeTopicPayload(parsed);
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
    await fetchOpenAIModels(apiKey);
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
    const models = await fetchOpenAIModels(apiKey);
    const latestModels = models
      .filter((m) => isLikelyTextModel(m.id))
      .sort((a, b) => {
        const rank = modelPriority(a.id) - modelPriority(b.id);
        if (rank !== 0) return rank;
        return (b?.created || 0) - (a?.created || 0);
      })
      .slice(0, 30)
      .map((m) => ({
        id: m.id,
        created: m.created || null,
        ownedBy: m.owned_by || null
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

app.post("/api/find-topics", async (req, res) => {
  const { apiKey, model } = req.body || {};

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

  try {
    const result = await requestTopicIdeas({ apiKey, model: model.trim() });
    return res.json({
      ok: true,
      model: model.trim(),
      topics: result.topics,
      bestRecommendation: result.bestRecommendation
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      ok: false,
      message: `Themensuche fehlgeschlagen: ${error.message}`
    });
  }
});

app.use((error, _req, res, _next) => {
  const status = error?.statusCode || 500;
  return res.status(status).json({
    ok: false,
    message: error?.message || "Unerwarteter Serverfehler."
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Medium Tracker running on port ${PORT}`);
});
