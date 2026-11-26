import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { officialBoardPages } from '../src/client/official-workbench/pages.js';
import { galleryCases } from '../src/host/cases.mjs';
import { pageQueries, queryArguments } from '../src/host/workbench-data.js';
import { bundledExamples, getTemplateHtml, getTemplateSample, workbenchTemplates } from '../src/host/workbench-templates.js';
import { QUICK_START_PROMPT, QUICK_START_TITLE } from '../src/shared/quick-start.js';

test('workbench preserves the gallery cases and serves their original examples', async () => {
  assert.equal(workbenchTemplates.length, 23);
  assert.equal(new Set(workbenchTemplates.map(({ id }) => id)).size, 23);
  assert.equal(bundledExamples().length, 16);
  const counts = { live: 0, sample: 0 };

  for (const [i, template] of workbenchTemplates.entries()) {
    const item = galleryCases[i];
    assert.deepEqual([template.id, template.title, template.category, template.description],
      [item.id, item.title, item.category, item.summary]);
    assert.equal(template.prompt, item.prompt);
    assert.ok(template.prompt.includes(template.title));
    assert.ok(template.prompt.includes('工作台') && template.prompt.includes('保存'));
    assert.equal(template.previewUrl, item.exampleUrl);
    counts[template.dataMode]++;
    const html = await getTemplateHtml(template.id);
    const sample = await getTemplateSample(template.id);
    if (!template.applicable) {
      assert.equal(html, undefined);
      assert.equal(sample, undefined);
      assert.equal(template.dataMode, 'live');
      assert.match(template.prompt, /刷新/);
      const slug = new URL(template.previewUrl).searchParams.get('page');
      assert.ok(officialBoardPages.some(([page, id]) => page === slug && id === template.id));
      continue;
    }

    const asset = new URL(template.previewUrl).pathname.split('/').at(-2);
    const original = await readFile(new URL(`../../../examples/inspirations/${asset}/example.html`, import.meta.url), 'utf8');
    assert.equal(sample, original);
    assert.equal(template.dataMode, 'sample');
    assert.equal(html, sample);
    assert.doesNotMatch(html, /id="hithink-finance-data"/);
  }
  assert.deepEqual(counts, { live: 7, sample: 16 });
  assert.equal(await getTemplateSample('../../not-a-template'), undefined);
});

test('the quick-start example in the README matches the workbench prompt', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const example = QUICK_START_PROMPT.split('\n').map((line) => line ? `> ${line}` : '>').join('\n');
  assert.ok(QUICK_START_PROMPT.includes(QUICK_START_TITLE));
  assert.ok(readme.replaceAll('\r\n', '\n').includes(example));
});

test('the guide includes a refreshable two-stock snapshot declaration', async () => {
  const guide = await readFile(new URL('../skills/hithink-finance-dsh/references/workbench.md', import.meta.url), 'utf8');
  const [binding] = pageQueries(guide);
  assert.deepEqual(queryArguments(binding).argv, [
    '--source', 'remote', 'market', 'snapshot', '--thscodes', '600000.SH,000001.SZ',
  ]);
  assert.match(guide, /data-hf-refresh>刷新数据/);
  assert.match(guide, /data-hf-field="data\.timestamp" data-hf-view="value" data-hf-format="datetime"/);
});
