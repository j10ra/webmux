import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// tmux session names can't contain "." or ":"; collapse anything unsafe to "_".
export function sanitizeName(id: string): string {
  return id.replace(/[^\w-]/g, "_");
}

export function newSessionArgs(
  name: string,
  cwd: string,
  command: string,
  env: Record<string, string> = {},
): string[] {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);

  // split so commands with flags become separate argv entries
  return [
    "new-session",
    "-d",
    "-s",
    name,
    "-c",
    cwd,
    ...envArgs,
    ...command.split(" ").filter(Boolean),
  ];
}

export const attachArgs = (name: string): string[] => ["attach-session", "-t", name];
export const captureArgs = (name: string, lines: number): string[] => [
  "capture-pane",
  "-p",
  "-e",
  "-J",
  "-S",
  `-${lines}`,
  "-t",
  name,
];
export const historyLimitArgs = (name: string, lines: number): string[] => [
  "set-option",
  "-t",
  name,
  "history-limit",
  String(lines),
];
export const killArgs = (name: string): string[] => ["kill-session", "-t", name];
export const hasSessionArgs = (name: string): string[] => ["has-session", "-t", name];

// Default sourced config: tmux is an invisible session host — status bar off (the browser owns the
// chrome), mouse off (xterm owns scroll/selection/copy), OSC52 clipboard passthrough. Override with
// the `tmuxConfig` option, e.g. to enable mouse passthrough so full-screen apps get wheel events.
export const DEFAULT_TMUX_CONFIG = `set -g status off
set -g mouse off
set -g focus-events on
set -g set-clipboard on
set -as terminal-features ",xterm-256color:clipboard"
`;

export const tmuxConfigPath = join(tmpdir(), "webmux-tmux.conf");

// Write the config the plugin sources on each connect. Best-effort: the terminal still works
// without the tweaks if the write fails.
export function writeTmuxConfig(content: string = DEFAULT_TMUX_CONFIG): void {
  try {
    writeFileSync(tmuxConfigPath, content);
  } catch {
    /* best-effort */
  }
}

export const sourceArgs = (): string[] => ["source-file", tmuxConfigPath];

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type Runner = (cmd: string, args: string[]) => Promise<RunResult>;

export class TmuxSessions {
  constructor(
    private run: Runner,
    private historyLimit: number,
  ) {}

  async ensure(
    name: string,
    cwd: string,
    command: string,
    env: Record<string, string>,
  ): Promise<void> {
    if ((await this.run("tmux", hasSessionArgs(name))).code === 0) return;
    const r = await this.run("tmux", newSessionArgs(name, cwd, command, env));

    if (r.code !== 0) throw new Error(`tmux new-session failed: ${r.stderr}`);
    await this.run("tmux", historyLimitArgs(name, this.historyLimit));
  }

  async replay(name: string): Promise<string> {
    const r = await this.run("tmux", captureArgs(name, this.historyLimit));

    return r.code === 0 ? r.stdout : "";
  }

  async kill(name: string): Promise<void> {
    await this.run("tmux", killArgs(name));
  }

  async list(): Promise<string[]> {
    const r = await this.run("tmux", ["ls", "-F", "#{session_name}"]);

    return r.code === 0
      ? r.stdout
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
      : [];
  }

  async sendKeys(name: string, text: string): Promise<void> {
    await this.run("tmux", ["send-keys", "-t", name, "-l", "--", text]);
    await this.run("tmux", ["send-keys", "-t", name, "Enter"]);
  }
}
