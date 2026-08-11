import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
  }));
  return files.flat();
}

test('Vercel backend sources stay inside the deployable server package', async () => {
  const files = await sourceFiles(path.join(serverRoot, 'src'));
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file), specifier);
      if (resolved !== serverRoot && !resolved.startsWith(`${serverRoot}${path.sep}`)) {
        violations.push(`${path.relative(serverRoot, file)} -> ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
