import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:https';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { expect, test } from 'vitest';

const openssl = await execa('openssl', ['version'], { reject: false }).then(
  (result) => result.exitCode === 0,
  () => false,
);
const main = path.resolve('dist/cli/main.js');

test.skipIf(!openssl)(
  'relative CA files in different calling directories use their own TLS trust',
  async () => {
    const home = await mkdtemp(
      path.join(process.platform === 'win32' ? os.tmpdir() : '/tmp', 'finance-ca-'),
    );
    const a = path.join(home, 'a'),
      b = path.join(home, 'b');
    await mkdir(a);
    await mkdir(b);
    const key = randomUUID();
    let server: Server | undefined;
    let env: NodeJS.ProcessEnv = {};
    async function cli(cwd: string, args: string[], foreground = false) {
      return execa('node', [main, ...args], {
        cwd,
        env: { ...env, HITHINK_FINANCE_NO_WORKER: foreground ? '1' : '0' },
        input: key,
        reject: false,
        timeout: 15000,
      });
    }
    try {
      for (const dir of [a, b]) {
        await writeFile(
          path.join(dir, 'cert.cnf'),
          '[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=localhost\n[v3]\nsubjectAltName=IP:127.0.0.1,DNS:localhost\nbasicConstraints=critical,CA:TRUE\n',
        );
        await execa(
          'openssl',
          [
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-days',
            '1',
            '-keyout',
            'key.pem',
            '-out',
            'ca.pem',
            '-config',
            'cert.cnf',
          ],
          { cwd: dir },
        );
      }
      async function listen(directory: string, port = 0): Promise<number> {
        server = createServer(
          {
            key: await readFile(path.join(directory, 'key.pem')),
            cert: await readFile(path.join(directory, 'ca.pem')),
          },
          (request, response) => {
            response.setHeader('content-type', 'application/json');
            response.end(
              JSON.stringify(
                request.headers['x-api-key'] === key
                  ? {
                      code: 0,
                      message: 'ok',
                      data: { item: [{ thscode: '600519.SH', last_price: 1 }] },
                    }
                  : { code: 2003, message: 'denied', data: null },
              ),
            );
          },
        );
        await new Promise<void>((resolve) => server!.listen(port, '127.0.0.1', resolve));
        return (server.address() as { port: number }).port;
      }
      const port = await listen(a);
      env = {
        HITHINK_TEST_USER_HOME: home,
        APPDATA: home,
        LOCALAPPDATA: home,
        HITHINK_FINANCE_API_KEY: undefined,
        API_KEY: undefined,
        FUYAO_TOKEN: undefined,
        HITHINK_FINANCE_FUYAO_BASE_URL: `https://127.0.0.1:${port}`,
        HITHINK_FINANCE_NO_UPDATE_CHECK: '1',
        NODE_EXTRA_CA_CERTS: 'ca.pem',
        NODE_TLS_REJECT_UNAUTHORIZED: '1',
        NODE_USE_ENV_PROXY: '0',
      };
      const query = [
        'market',
        'snapshot',
        '--thscodes',
        '600519.SH',
        '--api-key-stdin',
        '--format',
        'json',
      ];
      const first = await cli(a, query);
      expect(first.exitCode, first.stderr).toBe(0);
      const firstPid = JSON.parse((await cli(a, ['worker', 'status', '--format', 'json'])).stdout)
        .data.pid;
      server!.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      await listen(b, port);
      const ordinary = await cli(b, query, true);
      expect(ordinary.exitCode, ordinary.stderr).toBe(0);
      const worker = await cli(b, query);
      expect(worker.exitCode, worker.stderr).toBe(0);
      expect(JSON.parse(worker.stdout).ok).toBe(true);
      expect(
        JSON.parse((await cli(b, ['worker', 'status', '--format', 'json'])).stdout).data.pid,
      ).not.toBe(firstPid);
    } finally {
      for (const cwd of [a, b]) await cli(cwd, ['worker', 'stop', '--format', 'json']);
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      // Windows may release a stopped worker's current-directory handle after the stop reply.
      await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  },
  30000,
);
