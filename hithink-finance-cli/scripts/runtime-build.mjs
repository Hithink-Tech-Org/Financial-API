import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });
let value = { phase: 'building' };
if (process.argv[2] === 'finish') {
  const hash = createHash('sha256');
  for (const name of ['package.json', 'npm-shrinkwrap.json'])
    hash.update(name).update(await readFile(path.join(root, name)));
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name.endsWith('.js'))
        hash.update(path.relative(dist, file).replaceAll('\\', '/')).update(await readFile(file));
    }
  }
  await visit(dist);
  value = { phase: 'ready', id: hash.digest('hex') };
}
const temporary = path.join(dist, `.runtime-build-${randomUUID()}.tmp`);
await writeFile(temporary, JSON.stringify(value) + '\n');
await rename(temporary, path.join(dist, 'runtime-build.json'));
