import type { Command } from 'commander';
import type { CliContext } from '../../cli/context.js';
import { successEnvelope } from '../../contracts/envelope.js';
import { renderResult } from '../../output/renderer.js';
import { workerControl } from '../../cli/worker/client.js';
import { localizeText } from '../../cli/i18n.js';

export function registerWorkerCommands(
  program: Command,
  context: CliContext,
  packageRoot: string,
): void {
  const worker = program
    .command('worker')
    .description(localizeText(context.language, 'Inspect or stop the local query worker'));
  for (const operation of ['status', 'stop'] as const)
    worker.command(operation).action(async () => {
      await renderResult(
        successEnvelope(
          `worker.${operation}`,
          await workerControl(packageRoot, operation, context.env),
          { requestId: context.requestId },
        ),
        context,
      );
    });
}
