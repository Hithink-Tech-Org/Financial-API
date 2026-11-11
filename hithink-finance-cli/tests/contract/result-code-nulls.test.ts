import { createServer } from 'node:http';
import { execa } from 'execa';
import { expect, test } from 'vitest';

test.each([
  ['special', 'limit-up-pool', []],
  ['special', 'hot-stock', []],
  ['fund', 'offerings', ['--subscribe', 'active']],
  ['fund', 'indicators-table', []],
  ['fund', 'quota-list', ['--tab', '["nazhi100"]']],
] as const)('%s %s preserves mixed and all-null code records', async (group, command, args) => {
  const rows = [
    { thscode: null, value: 1 },
    { thscode: null, value: 2 },
    { thscode: '600519.SH', value: 3 },
  ];
  let data: unknown = {
    item: rows,
    data: rows,
    sort_thscodes: [null, null, '600519.SH'],
    pagination: { page: 2, size: 3, total: 9, has_next: true },
    total: 9,
  };
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ code: 0, message: 'success', request_id: 'nullable', data }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    for (const count of [3, 2]) {
      data = {
        item: rows.slice(0, count),
        data: rows.slice(0, count),
        sort_thscodes: [null, null, '600519.SH'].slice(0, count),
        pagination: { page: 2, size: 3, total: 9, has_next: true },
        total: 9,
      };
      if (command === 'quota-list') data = [{ tab: 'nazhi100', funds: rows.slice(0, count) }];
      const result = await execa(
        process.execPath,
        ['dist/cli/main.js', group, command, ...args, '--format', 'json'],
        {
          env: {
            HITHINK_FINANCE_API_KEY: 'fixture-key',
            HITHINK_FINANCE_FUYAO_BASE_URL: `http://127.0.0.1:${address.port}`,
            HITHINK_FINANCE_NO_UPDATE_CHECK: '1',
          },
        },
      );
      expect(JSON.parse(result.stdout).data).toEqual(data);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
