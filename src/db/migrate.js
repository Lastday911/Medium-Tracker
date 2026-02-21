const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { withClient, closePool } = require("./client");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const SEEDS_DIR = path.join(__dirname, "seeds");
const MIGRATIONS_TABLE = "schema_migrations";

function listSqlFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
}

function readSqlFile(fullPath) {
  return fs.readFileSync(fullPath, "utf8");
}

function checksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    `SELECT filename, checksum FROM ${MIGRATIONS_TABLE}`
  );

  return new Map(result.rows.map((row) => [row.filename, row.checksum]));
}

async function runSqlInTransaction(client, sqlText) {
  await client.query("BEGIN");
  try {
    await client.query(sqlText);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runMigrations() {
  const files = listSqlFiles(MIGRATIONS_DIR);
  if (!files.length) {
    console.log("Keine Migrationen gefunden.");
    return;
  }

  await withClient(async (client) => {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    for (const fileName of files) {
      const fullPath = path.join(MIGRATIONS_DIR, fileName);
      const sqlText = readSqlFile(fullPath);
      const fileChecksum = checksum(sqlText);
      const appliedChecksum = applied.get(fileName);

      if (appliedChecksum) {
        if (appliedChecksum !== fileChecksum) {
          throw new Error(
            `Migration ${fileName} wurde bereits mit anderem Inhalt angewendet. Bitte neue Migration statt Ueberschreiben verwenden.`
          );
        }

        console.log(`Uebersprungen (bereits angewendet): ${fileName}`);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sqlText);
        await client.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (filename, checksum) VALUES ($1, $2)`,
          [fileName, fileChecksum]
        );
        await client.query("COMMIT");
        console.log(`Migration angewendet: ${fileName}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  });
}

async function runSeeds() {
  const files = listSqlFiles(SEEDS_DIR);
  if (!files.length) {
    console.log("Keine Seeds gefunden.");
    return;
  }

  await withClient(async (client) => {
    for (const fileName of files) {
      const fullPath = path.join(SEEDS_DIR, fileName);
      const sqlText = readSqlFile(fullPath);
      await runSqlInTransaction(client, sqlText);
      console.log(`Seed ausgefuehrt: ${fileName}`);
    }
  });
}

async function main() {
  const command = String(process.argv[2] || "up").toLowerCase();

  if (!["up", "seed", "all"].includes(command)) {
    throw new Error(
      "Unbekannter Befehl. Erlaubt sind: 'up' (Migrationen), 'seed' (Seed-Daten), 'all' (beides)."
    );
  }

  if (command === "up") {
    await runMigrations();
    return;
  }

  if (command === "seed") {
    await runSeeds();
    return;
  }

  await runMigrations();
  await runSeeds();
}

main()
  .then(() => {
    console.log("DB-Setup abgeschlossen.");
  })
  .catch((error) => {
    console.error(`DB-Setup fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closePool();
    } catch (_error) {
      // Ignorieren: Pool war ggf. nie initialisiert.
    }
  });
