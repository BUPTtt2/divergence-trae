import 'dotenv/config';
import { closeDB, ensureSchema, initDB } from '../src/services/db.js';

async function migrate() {
  initDB();
  await ensureSchema();
  await closeDB();
}

migrate().catch(async (error) => {
  console.error('[DB] 部署迁移失败:', error.message);
  await closeDB().catch(() => {});
  process.exitCode = 1;
});
