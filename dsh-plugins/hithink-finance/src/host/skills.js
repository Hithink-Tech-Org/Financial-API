import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const presentation = fileURLToPath(new URL('../../skills/hithink-finance-dsh/SKILL.md', import.meta.url));

async function readSkill(path) {
  const markdown = await readFile(path, 'utf8');
  const header = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/u.exec(markdown);
  const name = header?.[1].match(/^name: ([a-z0-9-]+)\s*$/mu)?.[1];
  const raw = header?.[1].match(/^description: ([^\r\n]+)$/mu)?.[1].trim();
  const description = raw?.startsWith("'") && raw.endsWith("'")
    ? raw.slice(1, -1).replaceAll("''", "'") : raw;
  const directory = dirname(path);
  if (!description || name !== basename(directory)) throw new Error(`Invalid bundled finance skill: ${basename(directory)}`);
  return {
    name, description, source: 'bundled', path,
    resourceBase: { kind: 'directory', path: directory },
    content: markdown.slice(header[0].length).trim(),
  };
}

export async function mountFinanceSkills(ctx, cliDirectory) {
  const skillRoot = join(cliDirectory, 'skills');
  const entries = await readdir(skillRoot, { withFileTypes: true });
  const paths = entries.filter((entry) => entry.isDirectory() && /^hithink-finance-[a-z-]+$/.test(entry.name))
    .map((entry) => join(skillRoot, entry.name, 'SKILL.md')).sort();
  const skills = await Promise.all([...paths, presentation].map(readSkill));
  for (const skill of skills) ctx.skills.register(skill);
}
