import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledExamples } from '../src/host/workbench-templates.js';

const source = fileURLToPath(new URL('../../../examples/inspirations/', import.meta.url));
const output = fileURLToPath(new URL('../dist/workbench-samples/', import.meta.url));
const check = process.argv.includes('--check');
const expected = new Set();

if (!check) await mkdir(output, { recursive: true });
for (const asset of bundledExamples()) {
  const name = `${asset}.html`;
  expected.add(name);
  const html = await readFile(join(source, asset, 'example.html'));
  const path = join(output, name);
  if (check) {
    if (!html.equals(await readFile(path))) throw new Error(`Workbench example out of date: ${name}`);
  } else {
    await writeFile(path, html);
  }
}

for (const file of await readdir(output, { withFileTypes: true })) {
  if (file.isFile() && /^\d{2}-[a-z0-9-]+\.html$/.test(file.name) && !expected.has(file.name)) {
    if (check) throw new Error(`Unexpected old workbench example: ${file.name}`);
    await rm(join(output, file.name));
  }
}
