import { createServer, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { authError } from './auth-paths.js';
import { CALLBACK } from './oauth-client.js';
import { callbackPage } from './callback-page.js';
import type { Language } from '../../cli/i18n.js';

export async function listenForCallback(
  state: string,
  signal?: AbortSignal,
  language: Language = 'zh-CN',
) {
  let resolveResult!: (url: URL) => void;
  let rejectResult!: (error: Error) => void;
  let response: ServerResponse | undefined;
  let consumed = false;
  let completed = false;
  const result = new Promise<URL>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  // A deadline can fire before the caller starts awaiting the callback.
  void result.catch(() => undefined);
  const server = createServer((request, reply) => {
    reply.setHeader('Cache-Control', 'no-store');
    reply.setHeader('Referrer-Policy', 'no-referrer');
    reply.setHeader('Content-Type', 'text/plain; charset=utf-8');
    reply.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    let url: URL;
    try {
      url = new URL(request.url ?? '', CALLBACK);
    } catch {
      reply.writeHead(400).end('Invalid callback.');
      return;
    }
    const incoming = url.searchParams.get('state') ?? '';
    const allowed = new Set([
      'state',
      'code',
      'error',
      'error_description',
      'error_uri',
      'iss',
      'session_state',
    ]);
    const valid =
      !consumed &&
      request.method === 'GET' &&
      request.headers.host === '127.0.0.1:18765' &&
      url.origin === 'http://127.0.0.1:18765' &&
      url.pathname === '/oauth/callback' &&
      !url.hash &&
      (request.url?.length ?? 0) <= 8192 &&
      Buffer.byteLength(incoming) === Buffer.byteLength(state) &&
      timingSafeEqual(Buffer.from(incoming), Buffer.from(state)) &&
      [...url.searchParams.keys()].every(
        (k) => allowed.has(k) && url.searchParams.getAll(k).length === 1,
      ) &&
      Boolean(url.searchParams.get('code')) !== Boolean(url.searchParams.get('error'));
    if (!valid) {
      reply.writeHead(400).end('Invalid callback.');
      return;
    }
    consumed = true;
    response = reply;
    resolveResult(url);
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  const finish = async (success: boolean) => {
    if (!response) return;
    const reply = response;
    response = undefined;
    if (reply.destroyed || reply.writableEnded) return;
    const page = callbackPage(success, language);
    reply.setHeader('Content-Type', 'text/html; charset=utf-8');
    reply.setHeader('Content-Security-Policy', page.policy);
    await new Promise<void>((resolve) => {
      // A browser disconnect after commit is not a failed credential save.
      reply.once('finish', resolve);
      reply.once('close', resolve);
      reply.once('error', () => resolve());
      reply.writeHead(success ? 200 : 400).end(page.body);
    });
    completed = true;
  };
  const stopServer = () => {
    server.close();
    server.closeIdleConnections();
    if (!completed) server.closeAllConnections();
  };
  const close = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    if (response) void finish(false).finally(stopServer);
    else stopServer();
  };
  const abort = () => {
    rejectResult(authError('AUTH_LOGIN_CANCELLED', 'Authorization was cancelled or timed out.'));
    close();
  };
  const timer = setTimeout(abort, 300000);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(18765, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  } catch {
    close();
    throw authError(
      'AUTH_CALLBACK_PORT_IN_USE',
      'The fixed authorization callback port is unavailable. Close the other login attempt and retry.',
    );
  }
  if (signal?.aborted) abort();
  return {
    result,
    close,
    finish,
  };
}
