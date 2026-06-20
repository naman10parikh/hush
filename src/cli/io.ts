/**
 * Shared CLI output + exit-code plumbing for every `hush` subcommand.
 *
 * Contract (PLAN §4): every command supports `--json`; on findings/error the
 * process exits nonzero; success exits 0. Commands return a CommandResult and
 * this module renders it — keeping each command body free of stdout/exit logic.
 */

export interface CommandResult {
  /** 0 = success, 1 = findings (scan), >1 = error. */
  readonly exitCode: number;
  /** The machine-readable payload printed under `--json`. Never a secret value. */
  readonly json: unknown;
  /** The human-readable rendering printed without `--json`. */
  readonly text: string;
}

export interface GlobalOpts {
  readonly json?: boolean;
}

/** Render a CommandResult to stdout and set the process exit code. */
export function emit(result: CommandResult, opts: GlobalOpts): void {
  if (opts.json) {
    process.stdout.write(JSON.stringify(result.json) + "\n");
  } else {
    process.stdout.write(result.text + "\n");
  }
  process.exitCode = result.exitCode;
}

/** Wrap a command handler so any thrown error becomes a clean nonzero exit. */
export async function run(
  fn: () => Promise<CommandResult> | CommandResult,
  opts: GlobalOpts,
): Promise<void> {
  try {
    const result = await fn();
    emit(result, opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ error: message, exitCode: 2 }) + "\n",
      );
    } else {
      process.stderr.write(`[hush] error: ${message}\n`);
    }
    process.exitCode = 2;
  }
}
