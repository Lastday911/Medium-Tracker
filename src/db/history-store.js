const { withClient } = require("./client");

function normalizePositiveInt(value, fallback, min = 1, max = 100) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

function normalizeOffset(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function summarizeResultPayload(resultPayload) {
  const topics = Array.isArray(resultPayload?.topics) ? resultPayload.topics : [];
  const bestTitle =
    typeof resultPayload?.bestRecommendation?.topic_title === "string"
      ? resultPayload.bestRecommendation.topic_title.trim()
      : "";

  return {
    topicCount: topics.length,
    bestTopicTitle: bestTitle
  };
}

function mapHistorySummaryRow(row) {
  const requestContext = row.request_context && typeof row.request_context === "object"
    ? row.request_context
    : {};
  const resultPayload = row.result_payload && typeof row.result_payload === "object"
    ? row.result_payload
    : {};
  const resultSummary = summarizeResultPayload(resultPayload);
  const categoryLabelFromContext =
    typeof requestContext.categoryLabel === "string" ? requestContext.categoryLabel.trim() : "";

  return {
    id: row.id,
    status: String(row.status || "error"),
    model: String(row.model_id || ""),
    category: String(row.category_slug || ""),
    categoryLabel:
      String(row.category_label || "").trim() || categoryLabelFromContext || String(row.category_slug || ""),
    createdAt: row.created_at,
    latencyMs: Number.isFinite(row.latency_ms) ? row.latency_ms : null,
    errorMessage: String(row.error_message || "").trim() || null,
    ...resultSummary
  };
}

function mapHistoryDetailRow(row) {
  const summary = mapHistorySummaryRow(row);
  const requestContext = row.request_context && typeof row.request_context === "object"
    ? row.request_context
    : {};
  const resultPayload = row.result_payload && typeof row.result_payload === "object"
    ? row.result_payload
    : null;

  return {
    ...summary,
    requestContext,
    resultPayload
  };
}

async function insertHistoryEntry(entry) {
  const payload = entry?.resultPayload && typeof entry.resultPayload === "object"
    ? entry.resultPayload
    : {};

  await withClient(async (client) => {
    await client.query(
      `
        INSERT INTO search_history (
          category_slug,
          model_id,
          request_context,
          result_payload,
          latency_ms,
          status,
          error_message
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
      `,
      [
        String(entry?.categorySlug || "unknown"),
        String(entry?.modelId || "unknown"),
        JSON.stringify(entry?.requestContext || {}),
        JSON.stringify(payload),
        Number.isFinite(entry?.latencyMs) ? entry.latencyMs : null,
        entry?.status === "error" ? "error" : "success",
        entry?.status === "error" ? String(entry?.errorMessage || "") : null
      ]
    );
  });
}

async function listHistory(options = {}) {
  const limit = normalizePositiveInt(options.limit, 20, 1, 100);
  const offset = normalizeOffset(options.offset, 0);

  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          h.id,
          h.category_slug,
          h.model_id,
          h.request_context,
          h.result_payload,
          h.latency_ms,
          h.status,
          h.error_message,
          h.created_at,
          c.label_de AS category_label
        FROM search_history h
        LEFT JOIN categories c ON c.slug = h.category_slug
        ORDER BY h.created_at DESC, h.id DESC
        LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    return {
      limit,
      offset,
      items: result.rows.map(mapHistorySummaryRow)
    };
  });
}

async function getHistoryEntryById(id) {
  const normalizedId = Number.parseInt(String(id || ""), 10);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return null;
  }

  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          h.id,
          h.category_slug,
          h.model_id,
          h.request_context,
          h.result_payload,
          h.latency_ms,
          h.status,
          h.error_message,
          h.created_at,
          c.label_de AS category_label
        FROM search_history h
        LEFT JOIN categories c ON c.slug = h.category_slug
        WHERE h.id = $1
        LIMIT 1
      `,
      [normalizedId]
    );

    if (!result.rows.length) {
      return null;
    }

    return mapHistoryDetailRow(result.rows[0]);
  });
}

async function deleteHistoryEntryById(id) {
  const normalizedId = Number.parseInt(String(id || ""), 10);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return false;
  }

  return withClient(async (client) => {
    const result = await client.query(
      `DELETE FROM search_history WHERE id = $1 RETURNING id`,
      [normalizedId]
    );

    return result.rowCount > 0;
  });
}

module.exports = {
  insertHistoryEntry,
  listHistory,
  getHistoryEntryById,
  deleteHistoryEntryById,
  normalizePositiveInt,
  normalizeOffset
};
