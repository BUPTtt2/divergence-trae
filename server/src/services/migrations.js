import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

export async function runMigrations(pool) {
  if (!pool) return;

  await ensureMigrationsTable(pool);

  const executedVersions = await getExecutedVersions(pool);
  const pendingMigrations = await findPendingMigrations(executedVersions);

  if (pendingMigrations.length === 0) {
    console.log('[DB] 数据库已是最新版本');
    return;
  }

  console.log(`[DB] 发现 ${pendingMigrations.length} 个待执行迁移:`);
  for (const m of pendingMigrations) {
    console.log(`  - ${m.version}: ${m.name}`);
  }

  for (const migration of pendingMigrations) {
    try {
      console.log(`[DB] 执行迁移: ${migration.version}`);
      const sql = fs.readFileSync(migration.path, 'utf-8');
      const statements = parseSqlStatements(sql);

      for (const stmt of statements) {
        if (!stmt.trim()) continue;
        await pool.query(stmt);
      }

      await markAsExecuted(pool, migration);
      console.log(`[DB] 迁移 ${migration.version} 执行成功`);
    } catch (e) {
      console.error(`[DB] 迁移 ${migration.version} 失败:`, e.message);
      throw e;
    }
  }

  console.log('[DB] 所有迁移执行完成');
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getExecutedVersions(pool) {
  const result = await pool.query('SELECT version FROM migrations ORDER BY version');
  return new Set(result.rows.map(r => r.version));
}

async function findPendingMigrations(executedVersions) {
  const migrations = [];

  try {
    const files = fs.readdirSync(MIGRATIONS_DIR);
    for (const file of files) {
      if (!file.endsWith('.sql')) continue;

      const match = file.match(/^(\d+)-(.+)\.sql$/);
      if (!match) continue;

      const version = match[1];
      const name = match[2];

      if (!executedVersions.has(version)) {
        migrations.push({
          version,
          name,
          path: path.join(MIGRATIONS_DIR, file),
        });
      }
    }
  } catch (e) {
    console.warn('[DB] 读取迁移目录失败:', e.message);
  }

  migrations.sort((a, b) => a.version.localeCompare(b.version));
  return migrations;
}

async function markAsExecuted(pool, migration) {
  await pool.query(
    'INSERT INTO migrations (version, name) VALUES ($1, $2)',
    [migration.version, migration.name]
  );
}

function parseSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    if (inComment) {
      if (char === '\n') inComment = false;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === '-' && nextChar === '-') {
      inComment = true;
      i++;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (char === ';' && !inSingleQuote && !inDoubleQuote) {
      statements.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}
