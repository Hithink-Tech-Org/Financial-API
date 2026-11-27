import { readFile } from 'node:fs/promises';
import { galleryCases } from './cases.mjs';

const snapshots = new URL('../../dist/workbench-samples/', import.meta.url);
const gallery = 'https://fuyao.aicubes.cn/best-practices/';
const assets = new Map();

export const workbenchTemplates = galleryCases.map(({ id, title, category, summary, prompt, exampleUrl, sample: localSample }) => {
  if (localSample) {
    assets.set(id, { name: localSample, path: `samples/${localSample}/example.html` });
    return {
      id, title, category, description: summary, prompt, dataMode: 'sample', applicable: true, samplePeriod: '数据时点见原页',
    };
  }
  if (!exampleUrl) return { id, title, category, description: summary, prompt, dataMode: 'live', applicable: false };
  const relative = exampleUrl.slice(gallery.length);
  const sample = /^(\d{2}-[a-z0-9-]+)\/example\.html$/.exec(relative)?.[1];
  const online = /^dynamic\/\?page=([a-z0-9-]+)$/.exec(relative)?.[1];
  if (!exampleUrl.startsWith(gallery) || (!sample && !online)) {
    throw new Error(`Unknown official example for ${id}`);
  }
  const dataMode = sample ? 'sample' : 'live';
  if (sample) assets.set(id, { name: sample, path: `../../examples/inspirations/${sample}/example.html` });
  return {
    id, title, category, description: summary, prompt, dataMode,
    applicable: Boolean(sample),
    previewUrl: exampleUrl,
    sourceUrl: sample
      ? `https://github.com/Hithink-Tech-Org/Financial-API/tree/main/examples/inspirations/${sample}`
      : exampleUrl,
    imageUrl: sample ? `${gallery}${sample}/preview.jpg` : `${gallery}dynamic-pages/previews/${online}.png`,
    samplePeriod: sample ? '数据时点见原页' : undefined,
  };
});

export function bundledExamples() {
  return [...assets.values()];
}

export async function getTemplateSample(id) {
  const asset = assets.get(id);
  if (asset) return readFile(new URL(`${asset.name}.html`, snapshots), 'utf8');
}

export const getTemplateHtml = getTemplateSample;
