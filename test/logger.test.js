const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeForLogging } = require("../src/logger");

test("sanitizeForLogging redaktiert Secrets in Strings", () => {
  const value = sanitizeForLogging(
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz12345 sk-test-12345678901234567890"
  );
  assert.match(value, /\[REDACTED_TOKEN\]/);
  assert.match(value, /\[REDACTED_API_KEY\]/);
});

test("sanitizeForLogging redaktiert sensitive Objektfelder", () => {
  const result = sanitizeForLogging({
    apiKey: "sk-test-123",
    authorization: "Bearer secret-token",
    safe: "ok"
  });
  assert.equal(result.apiKey, "[REDACTED]");
  assert.equal(result.authorization, "[REDACTED]");
  assert.equal(result.safe, "ok");
});
