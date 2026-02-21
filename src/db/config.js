const DEFAULT_POOL_MAX = 10;

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function useSsl() {
  if (process.env.DATABASE_SSL === "disable") {
    return false;
  }

  if (process.env.DATABASE_SSL === "require") {
    return { rejectUnauthorized: false };
  }

  return process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false;
}

function resolveDatabaseConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  return {
    connectionString,
    ssl: useSsl(),
    max: toPositiveInt(process.env.DATABASE_POOL_MAX, DEFAULT_POOL_MAX)
  };
}

module.exports = {
  resolveDatabaseConfig
};
