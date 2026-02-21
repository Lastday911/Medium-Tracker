const { Pool } = require("pg");
const { resolveDatabaseConfig } = require("./config");

let pool = null;

function getPool() {
  if (pool) {
    return pool;
  }

  const config = resolveDatabaseConfig();
  if (!config) {
    throw new Error(
      "Keine Datenbank-Konfiguration gefunden. Bitte DATABASE_URL in der Umgebung setzen."
    );
  }

  pool = new Pool(config);
  return pool;
}

async function withClient(callback) {
  const client = await getPool().connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function closePool() {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}

module.exports = {
  getPool,
  withClient,
  closePool
};
