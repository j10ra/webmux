import { execFile } from "node:child_process";
import type { RunResult } from "./tmux.js";

export function run(cmd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code =
        err && typeof (err as { code?: number }).code === "number"
          ? (err as { code: number }).code
          : err
            ? 1
            : 0;

      resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code });
    });
  });
}
