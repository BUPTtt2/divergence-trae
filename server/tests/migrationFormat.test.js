import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(testsDirectory, '../src/migrations');

test('all .sql migrations contain executable SQL instead of JavaScript wrappers', () => {
  const invalid = fs.readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .filter((name) => /(^|\n)\s*(?:export|import)\b/.test(
      fs.readFileSync(path.join(migrationsDirectory, name), 'utf8'),
    ));

  assert.deepEqual(invalid, []);
});
