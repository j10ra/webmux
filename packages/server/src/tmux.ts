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

// One sourced config per connect: mouse off (xterm owns UX), OSC52 clipboard.
const TMUX_CONFIG = `set -g mouse off
set -g set-clipboard on
set -as terminal-features ",xterm-256color:clipboard"
`;

export const tmuxConfigPath = join(tmpdir(), "webmux-tmux.conf");

try {
  writeFileSync(tmuxConfigPath, TMUX_CONFIG);
} catch {
  /* best-effort */
}

export const sourceArgs = (): string[] => ["source-file", tmuxConfigPath];
