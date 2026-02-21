const crypto = require("crypto");

function nowIso() {
  return new Date().toISOString();
}

function randomRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

function redactString(input) {
  let value = String(input || "");
  // OpenAI-style keys
  value = value.replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[REDACTED_API_KEY]");
  // Bearer tokens
  value = value.replace(/Bearer\s+[a-zA-Z0-9._-]{8,}/gi, "Bearer [REDACTED_TOKEN]");
  // Generic long token values
  value = value.replace(/\b[a-zA-Z0-9_-]{28,}\b/g, "[REDACTED_TOKEN]");
  return value;
}

function sanitizeForLogging(value, depth = 0) {
  if (depth > 4) {
    return "[TRUNCATED]";
  }

  if (typeof value === "string") {
    return redactString(value);
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      statusCode: value.statusCode || null
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeForLogging(item, depth + 1));
  }
  if (typeof value === "object") {
    const output = {};
    const keys = Object.keys(value).slice(0, 40);
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("apikey") ||
        lowerKey.includes("api_key") ||
        lowerKey.includes("authorization") ||
        lowerKey.includes("token") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("password")
      ) {
        output[key] = "[REDACTED]";
        continue;
      }
      output[key] = sanitizeForLogging(value[key], depth + 1);
    }
    return output;
  }
  return redactString(String(value));
}

function emit(level, event, data = {}) {
  if (process.env.LOG_SILENT === "true") {
    return;
  }
  const payload = {
    ts: nowIso(),
    level,
    event,
    ...sanitizeForLogging(data)
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

const logger = {
  debug(event, data) {
    if (process.env.LOG_LEVEL === "debug") {
      emit("debug", event, data);
    }
  },
  info(event, data) {
    emit("info", event, data);
  },
  warn(event, data) {
    emit("warn", event, data);
  },
  error(event, data) {
    emit("error", event, data);
  }
};

function requestContextMiddleware(req, res, next) {
  const startedAt = Date.now();
  const requestId = String(req.header("x-request-id") || "").trim() || randomRequestId();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  logger.info("http_request_started", {
    requestId,
    method: req.method,
    path: req.path
  });

  res.on("finish", () => {
    logger.info("http_request_finished", {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  next();
}

module.exports = {
  logger,
  sanitizeForLogging,
  requestContextMiddleware
};
