# webmux core (server + client) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `webmux-server` (Fastify plugin: WS terminal bridge over persistent tmux) and `webmux` (React `<Terminal/>`) to behavior parity, proven end-to-end by an example app.

**Architecture:** Browser xterm.js ⇄ WebSocket ⇄ node-pty(`tmux attach`) ⇄ persistent tmux session. tmux is the session host (mouse off; xterm owns UX); scrollback survives reconnect via `capture-pane` replay. Both packages are domain-agnostic — the host injects `resolveCwd`, `uploadImage`, `onOpenLink`.

**Tech Stack:** TypeScript (ESM/NodeNext), Fastify + @fastify/websocket + node-pty (server), React 18 + @xterm/xterm + addons fit/clipboard/web-links/webgl/unicode11 (client), vitest, tmux.

**Scope:** This plan = server + client interactive core + example app (parity). Follow-on plans: (B) VSCode features — find widget, context menu, 16-color palettes; (C) consumer migration + npm publish.

---

## File Structure

```
packages/server/src/
  tmux.ts        tmux arg builders + session ops (create/attach/history/replay/sendKeys/kill/list)
  plugin.ts      fastify plugin: options, GET /ws/:id (bridge), POST /paste-image
  index.ts       public exports
packages/server/test/
  tmux.test.ts
  plugin.test.ts
packages/client/src/
  theme.ts       DARK/LIGHT ITheme + themeFn() + observeTheme()
  clipboard.ts   writeClipboard() + clipboardProvider
  image.ts       imageMime(), uploadImage(), MiniToast/previewImage, Lightbox
  links.ts       FILE_LINK_RE + fileLinkProvider(onOpenLink) + webLinksHandler(onOpenLink)
  keybindings.ts attachKeybindings(term, ws, opts)
  Terminal.tsx   wires xterm + addons + ws bridge + resize + paste/drop + the above
  index.ts       public exports (Terminal, types)
packages/client/test/
  links.test.ts  image.test.ts  theme.test.ts
examples/basic/  vite + fastify app wiring both (manual e2e)
```

---

## Task 1: Repo tooling — vitest + base config

**Files:**
- Modify: `package.json` (root) — add devDeps + test script
- Create: `vitest.config.ts`

- [ ] **Step 1: Add root devDependencies + scripts**

Edit root `package.json` to add:
```json
"devDependencies": {
  "typescript": "^5.6.0",
  "vitest": "^2.1.0",
  "@types/node": "^22.5.0"
},
"scripts": {
  "build": "npm run build --workspaces --if-present",
  "typecheck": "npm run typecheck --workspaces --if-present",
  "test": "vitest run"
}
```

- [ ] **Step 2: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["packages/*/test/**/*.test.ts"] },
});
```

- [ ] **Step 3: Install + verify**

Run: `npm install`
Expected: installs without error; `npx vitest run` prints "No test files found" (no tests yet) and exits 0.

- [ ] **Step 4: Commit**

```bash
git add package.json vitest.config.ts package-lock.json
git commit -m "chore: vitest + root test tooling"
```

---

## Task 2: server — tmux arg builders (pure, unit-tested)

**Files:**
- Create: `packages/server/src/tmux.ts`
- Test: `packages/server/test/tmux.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { newSessionArgs, attachArgs, captureArgs, historyLimitArgs, sanitizeName } from "../src/tmux.js";

describe("tmux args", () => {
  it("sanitizes a session name (tmux forbids dots/colons)", () => {
    expect(sanitizeName("cc-3566-1")).toBe("cc-3566-1");
    expect(sanitizeName("a.b:c d")).toBe("a_b_c_d");
  });
  it("new-session is detached, in cwd, with env pairs and split command", () => {
    expect(newSessionArgs("s", "/wt/x", "agent --foo", { A: "1" })).toEqual([
      "new-session", "-d", "-s", "s", "-c", "/wt/x", "-e", "A=1", "agent", "--foo",
    ]);
  });
  it("attach + capture + history args", () => {
    expect(attachArgs("s")).toEqual(["attach-session", "-t", "s"]);
    expect(captureArgs("s", 20000)).toEqual(["capture-pane", "-p", "-e", "-J", "-S", "-20000", "-t", "s"]);
    expect(historyLimitArgs("s", 20000)).toEqual(["set-option", "-t", "s", "history-limit", "20000"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run packages/server/test/tmux.test.ts`
Expected: FAIL (module/exports missing).

- [ ] **Step 3: Implement tmux.ts (pure arg builders + config path)**

```ts
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
  // split so commands with flags ("agent --foo") become separate argv entries
  return ["new-session", "-d", "-s", name, "-c", cwd, ...envArgs, ...command.split(" ").filter(Boolean)];
}

export const attachArgs = (name: string): string[] => ["attach-session", "-t", name];
export const captureArgs = (name: string, lines: number): string[] =>
  ["capture-pane", "-p", "-e", "-J", "-S", `-${lines}`, "-t", name];
export const historyLimitArgs = (name: string, lines: number): string[] =>
  ["set-option", "-t", name, "history-limit", String(lines)];
export const killArgs = (name: string): string[] => ["kill-session", "-t", name];
export const hasSessionArgs = (name: string): string[] => ["has-session", "-t", name];

// One sourced config per connect: mouse off (xterm owns UX), OSC52 clipboard. No drag unbinds
// needed because mouse is off.
const TMUX_CONFIG = `set -g mouse off
set -g set-clipboard on
set -as terminal-features ",xterm-256color:clipboard"
`;
export const tmuxConfigPath = join(tmpdir(), "webmux-tmux.conf");
try { writeFileSync(tmuxConfigPath, TMUX_CONFIG); } catch { /* best-effort */ }
export const sourceArgs = (): string[] => ["source-file", tmuxConfigPath];
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run packages/server/test/tmux.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/tmux.ts packages/server/test/tmux.test.ts
git commit -m "feat(server): tmux arg builders + session config"
```

---

## Task 3: server — session ops over an injectable exec

**Files:**
- Modify: `packages/server/src/tmux.ts` (add `TmuxOps` over an injected runner)
- Test: `packages/server/test/tmux.test.ts` (extend)

- [ ] **Step 1: Add failing tests for session ops**

Append to `tmux.test.ts`:
```ts
import { TmuxSessions } from "../src/tmux.js";

function fakeRun() {
  const calls: string[][] = [];
  const run = async (_cmd: string, args: string[]) => {
    calls.push(args);
    if (args[0] === "has-session") return { code: 1, stdout: "", stderr: "" }; // not exists
    if (args[0] === "capture-pane") return { code: 0, stdout: "history-line\n", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  return { run, calls };
}

describe("TmuxSessions", () => {
  it("ensure() creates the session (with history-limit) when has-session fails", async () => {
    const { run, calls } = fakeRun();
    const t = new TmuxSessions(run, 20000);
    await t.ensure("s", "/wt/x", "bash", {});
    expect(calls.some((a) => a[0] === "new-session")).toBe(true);
    expect(calls.some((a) => a[0] === "set-option" && a.includes("history-limit"))).toBe(true);
  });
  it("replay() returns captured history", async () => {
    const { run } = fakeRun();
    const t = new TmuxSessions(run, 20000);
    expect(await t.replay("s")).toBe("history-line\n");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run packages/server/test/tmux.test.ts`
Expected: FAIL (`TmuxSessions` undefined).

- [ ] **Step 3: Implement TmuxSessions**

Append to `tmux.ts`:
```ts
export interface RunResult { code: number; stdout: string; stderr: string; }
export type Runner = (cmd: string, args: string[]) => Promise<RunResult>;

export class TmuxSessions {
  constructor(private run: Runner, private historyLimit: number) {}

  async ensure(name: string, cwd: string, command: string, env: Record<string, string>): Promise<void> {
    if ((await this.run("tmux", hasSessionArgs(name))).code === 0) return;
    const r = await this.run("tmux", newSessionArgs(name, cwd, command, env));
    if (r.code !== 0) throw new Error(`tmux new-session failed: ${r.stderr}`);
    await this.run("tmux", historyLimitArgs(name, this.historyLimit));
  }
  async replay(name: string): Promise<string> {
    const r = await this.run("tmux", captureArgs(name, this.historyLimit));
    return r.code === 0 ? r.stdout : "";
  }
  async kill(name: string): Promise<void> { await this.run("tmux", killArgs(name)); }
  async list(): Promise<string[]> {
    const r = await this.run("tmux", ["ls", "-F", "#{session_name}"]);
    return r.code === 0 ? r.stdout.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  }
  async sendKeys(name: string, text: string): Promise<void> {
    await this.run("tmux", ["send-keys", "-t", name, "-l", "--", text]);
    await this.run("tmux", ["send-keys", "-t", name, "Enter"]);
  }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run packages/server/test/tmux.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/tmux.ts packages/server/test/tmux.test.ts
git commit -m "feat(server): TmuxSessions (ensure/replay/kill/list/sendKeys) over injectable runner"
```

---

## Task 4: server — the real exec runner

**Files:**
- Create: `packages/server/src/exec.ts`
- Test: `packages/server/test/exec.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { run } from "../src/exec.js";

describe("run", () => {
  it("captures stdout + zero code", async () => {
    const r = await run("node", ["-e", "process.stdout.write('hi')"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("hi");
  });
  it("nonzero code on failure", async () => {
    const r = await run("node", ["-e", "process.exit(3)"]);
    expect(r.code).toBe(3);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run packages/server/test/exec.test.ts` — FAIL (no module).

- [ ] **Step 3: Implement exec.ts**

```ts
import { execFile } from "node:child_process";
import type { RunResult } from "./tmux.js";

export function run(cmd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as { code?: number }).code === "number"
        ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code });
    });
  });
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run packages/server/test/exec.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/exec.ts packages/server/test/exec.test.ts
git commit -m "feat(server): execFile-based run() helper"
```

---

## Task 5: server — Fastify plugin (WS bridge + paste-image)

**Files:**
- Create: `packages/server/src/plugin.ts`, `packages/server/src/index.ts`
- Test: `packages/server/test/plugin.test.ts`

- [ ] **Step 1: Failing test (resize parse + paste-image via injected pty/tmux)**

```ts
import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { terminalServer } from "../src/plugin.js";

it("paste-image saves the body and returns a path", async () => {
  const app = Fastify();
  await app.register(terminalServer, { resolveCwd: () => "/tmp", imageDir: "/tmp/webmux-test" });
  const res = await app.inject({
    method: "POST", url: "/terminal/paste-image",
    headers: { "content-type": "image/png" }, payload: Buffer.from([1, 2, 3]),
  });
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body).path).toMatch(/webmux-test\/paste-.*\.png$/);
  await app.close();
});
```
(WS bridge is exercised by the example app + the tmux unit tests; the plugin test covers wiring + paste-image, which is pure HTTP.)

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run packages/server/test/plugin.test.ts` — FAIL (no module).

- [ ] **Step 3: Implement plugin.ts**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as pty from "node-pty";
import fastifyWebsocket from "@fastify/websocket";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { run } from "./exec.js";
import { TmuxSessions, sanitizeName, attachArgs, sourceArgs } from "./tmux.js";

export interface TerminalServerOptions {
  resolveCwd: (sessionId: string) => string | Promise<string>;
  sessionCommand?: (sessionId: string) => { command: string; env?: Record<string, string> };
  prefix?: string;
  imageDir?: string;
  historyLimit?: number;
  imageBodyLimit?: number;
}

const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
  "image/bmp": "bmp", "image/svg+xml": "svg",
};

export const terminalServer: FastifyPluginAsync<TerminalServerOptions> = async (app, opts) => {
  const prefix = opts.prefix ?? "/terminal";
  const historyLimit = opts.historyLimit ?? 20000;
  const imageDir = opts.imageDir ?? join(tmpdir(), "webmux-pastes");
  const tmux = new TmuxSessions(run, historyLimit);

  await app.register(fastifyWebsocket);
  app.addContentTypeParser(/^image\//, { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  app.register(async (scope: FastifyInstance) => {
    scope.get<{ Params: { sessionId: string } }>("/ws/:sessionId", { websocket: true }, async (socket, req) => {
      const name = sanitizeName(req.params.sessionId);
      const cwd = await opts.resolveCwd(req.params.sessionId);
      const sc = opts.sessionCommand?.(req.params.sessionId) ?? { command: process.env.SHELL ?? "bash" };

      await tmux.ensure(name, cwd, sc.command, sc.env ?? {});
      void run("tmux", sourceArgs());

      // Replay history FIRST (so xterm reconstructs scrollback), then attach the live stream.
      const history = await tmux.replay(name);
      if (history) socket.send(history);

      const term = pty.spawn("tmux", attachArgs(name), {
        name: "xterm-256color", cols: 80, rows: 24, env: process.env as Record<string, string>,
      });
      term.onData((d) => socket.send(d));
      term.onExit(() => socket.close());
      socket.on("message", (raw: Buffer) => {
        const m = raw.toString();
        if (m.startsWith("\x00resize:")) {
          const [c, r] = m.slice(8).split(",").map(Number);
          if (c && r) term.resize(c, r);
        } else term.write(m);
      });
      socket.on("close", () => term.kill());
    });

    scope.post("/paste-image", { bodyLimit: opts.imageBodyLimit ?? 30 * 1024 * 1024 }, async (req, reply) => {
      const buf = req.body as Buffer;
      if (!buf?.length) return reply.code(400).send({ error: "empty body" });
      const ct = (req.headers["content-type"] ?? "image/png").split(";")[0].trim();
      await mkdir(imageDir, { recursive: true });
      const path = join(imageDir, `paste-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${EXT[ct] ?? "png"}`);
      await writeFile(path, buf);
      return { path };
    });
  }, { prefix });

  app.decorate("webmux", { tmux });
};
```

- [ ] **Step 4: Implement index.ts (exports)**

```ts
export { terminalServer } from "./plugin.js";
export type { TerminalServerOptions } from "./plugin.js";
export { TmuxSessions } from "./tmux.js";
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run packages/server/test/plugin.test.ts`
Expected: PASS. (Random component of the path makes the regex match; `Math.random` is fine here — server-side, not a tested-determinism concern.)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/plugin.ts packages/server/src/index.ts packages/server/test/plugin.test.ts package-lock.json
git commit -m "feat(server): fastify plugin — WS tmux bridge (replay+attach+resize) + paste-image"
```

---

## Task 6: client — theme (palettes + live observer)

**Files:**
- Create: `packages/client/src/theme.ts`
- Test: `packages/client/test/theme.test.ts` (jsdom)

- [ ] **Step 1: Add a jsdom vitest project for client tests**

Modify `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    projects: [
      { test: { name: "server", environment: "node", include: ["packages/server/test/**/*.test.ts"] } },
      { test: { name: "client", environment: "jsdom", include: ["packages/client/test/**/*.test.ts"] } },
    ],
  },
});
```
Add `jsdom` to root devDeps (`npm i -D jsdom`).

- [ ] **Step 2: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { themeFor, DARK, LIGHT } from "../src/theme.js";

describe("themeFor", () => {
  it("returns DARK when <html> has .dark, else LIGHT", () => {
    document.documentElement.classList.add("dark");
    expect(themeFor()).toBe(DARK);
    document.documentElement.classList.remove("dark");
    expect(themeFor()).toBe(LIGHT);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npx vitest run packages/client/test/theme.test.ts` — FAIL.

- [ ] **Step 4: Implement theme.ts**

```ts
import type { ITheme } from "@xterm/xterm";

// VSCode Dark+ / Light+ 16-color ANSI palettes.
export const DARK: ITheme = {
  background: "#1e1e1e", foreground: "#cccccc", cursor: "#cccccc", selectionBackground: "#264f78",
  black: "#000000", red: "#cd3131", green: "#0dbc79", yellow: "#e5e510", blue: "#2472c8",
  magenta: "#bc3fbc", cyan: "#11a8cd", white: "#e5e5e5", brightBlack: "#666666", brightRed: "#f14c4c",
  brightGreen: "#23d18b", brightYellow: "#f5f543", brightBlue: "#3b8eea", brightMagenta: "#d670d6",
  brightCyan: "#29b8db", brightWhite: "#e5e5e5",
};
export const LIGHT: ITheme = {
  background: "#ffffff", foreground: "#333333", cursor: "#333333", selectionBackground: "#add6ff",
  black: "#000000", red: "#cd3131", green: "#107c10", yellow: "#949800", blue: "#0451a5",
  magenta: "#bc05bc", cyan: "#0598bc", white: "#555555", brightBlack: "#666666", brightRed: "#cd3131",
  brightGreen: "#14ce14", brightYellow: "#b5ba00", brightBlue: "#0451a5", brightMagenta: "#bc05bc",
  brightCyan: "#0598bc", brightWhite: "#a5a5a5",
};
export const themeFor = (): ITheme =>
  document.documentElement.classList.contains("dark") ? DARK : LIGHT;

// Calls back whenever the `dark` class on <html> toggles; returns a disposer.
export function observeTheme(onChange: (t: ITheme) => void): () => void {
  const obs = new MutationObserver(() => onChange(themeFor()));
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run packages/client/test/theme.test.ts` — PASS.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json packages/client/src/theme.ts packages/client/test/theme.test.ts
git commit -m "feat(client): VSCode Dark+/Light+ themes + live theme observer"
```

---

## Task 7: client — links (regex + providers)

**Files:**
- Create: `packages/client/src/links.ts`
- Test: `packages/client/test/links.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { FILE_LINK_RE, parseFileLink } from "../src/links.js";

describe("file links", () => {
  it("matches paths with allowed extensions + optional /workspace and :line:col", () => {
    expect(parseFileLink("see src/api.ts:42:5 now")).toEqual({ value: "src/api.ts", line: 42, col: 5, index: 4, length: 14 });
    expect(parseFileLink("/workspace/Project/x.cs")).toEqual({ value: "Project/x.cs", line: undefined, col: undefined, index: 0, length: 23 });
  });
  it("does NOT match bare words or unknown extensions", () => {
    FILE_LINK_RE.lastIndex = 0;
    expect(FILE_LINK_RE.test("just some words foo.bar")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run packages/client/test/links.test.ts` — FAIL.

- [ ] **Step 3: Implement links.ts**

```ts
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";

export const FILE_LINK_RE =
  /(\/workspace\/)?([\w.\-/]*\w+\.(?:tsx?|jsx?|mjs|cjs|json|md|html?|s?css|sass|less|ya?ml|toml|xml|sh|bash|zsh|py|go|rs|java|kt|swift|cpp?|cc|hpp?|rb|php|sql|conf|ini|env|lock|txt|log|cs|csproj|sln|vbproj|vue|svelte|astro|razor|cshtml|aspx|gradle|properties|dockerfile))(?![a-zA-Z0-9])(?::(\d+)(?::(\d+))?)?/gi;

export interface ParsedFileLink { value: string; line?: number; col?: number; index: number; length: number; }

// Find the FIRST file link in a line of text (helper used by tests + the provider).
export function parseFileLink(text: string): ParsedFileLink | null {
  FILE_LINK_RE.lastIndex = 0;
  const m = FILE_LINK_RE.exec(text);
  if (!m) return null;
  return {
    value: m[2], line: m[3] ? Number(m[3]) : undefined, col: m[4] ? Number(m[4]) : undefined,
    index: m.index, length: m[0].length,
  };
}

export type OnOpenLink = (l: { type: "url" | "file"; value: string; line?: number; col?: number }) => void;

export function fileLinkProvider(term: Terminal, onOpen: OnOpenLink, pattern = FILE_LINK_RE): ILinkProvider {
  return {
    provideLinks(y, callback) {
      const line = term.buffer.active.getLine(y - 1);
      if (!line) return callback(undefined);
      const text = line.translateToString(true);
      const links: ILink[] = [];
      pattern.lastIndex = 0;
      for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
        const full = m[0];
        links.push({
          range: { start: { x: m.index + 1, y }, end: { x: m.index + full.length, y } },
          text: full,
          activate: (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            onOpen({ type: "file", value: m[2], line: m[3] ? Number(m[3]) : undefined, col: m[4] ? Number(m[4]) : undefined });
          },
        });
      }
      callback(links.length ? links : undefined);
    },
  };
}

// Handler for WebLinksAddon: modifier-click opens URLs (default: a new window).
export const webLinksHandler =
  (onOpen?: OnOpenLink) => (event: MouseEvent, uri: string) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (onOpen) onOpen({ type: "url", value: uri });
    else window.open(uri, "_blank", "noopener,noreferrer");
  };
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run packages/client/test/links.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/links.ts packages/client/test/links.test.ts
git commit -m "feat(client): file-link regex + xterm link providers (file + url)"
```

---

## Task 8: client — clipboard + image helpers

**Files:**
- Create: `packages/client/src/clipboard.ts`, `packages/client/src/image.ts`
- Test: `packages/client/test/image.test.ts`

- [ ] **Step 1: Failing test (MIME resolution incl. empty-type fallback)**

```ts
import { describe, it, expect } from "vitest";
import { imageMime } from "../src/image.js";

describe("imageMime", () => {
  it("uses file.type when image/*", () => {
    expect(imageMime(new File([], "x", { type: "image/png" }))).toBe("image/png");
  });
  it("falls back to extension when type is empty (Explorer copies)", () => {
    expect(imageMime(new File([], "shot.JPG", { type: "" }))).toBe("image/jpeg");
    expect(imageMime(new File([], "note.txt", { type: "" }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run packages/client/test/image.test.ts` — FAIL.

- [ ] **Step 3: Implement clipboard.ts**

```ts
import type { IClipboardProvider } from "@xterm/addon-clipboard";

export async function writeClipboard(text: string): Promise<void> {
  if (!text) return;
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* fall through */ }
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.top = "0"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand("copy"); } catch { /* best-effort */ }
  ta.remove();
}

export const clipboardProvider: IClipboardProvider = {
  readText: () => navigator.clipboard?.readText?.() ?? Promise.resolve(""),
  writeText: (_sel, text) => writeClipboard(text),
};
```

- [ ] **Step 4: Implement image.ts (MIME + upload; preview/lightbox added in Task 9)**

```ts
const IMAGE_EXT_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
};

export function imageMime(file: File): string | null {
  if (file.type.startsWith("image/")) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXT_MIME[ext] ?? null;
}

// POST the raw bytes; the server saves them and returns the absolute path to inject.
export async function uploadImage(file: File, endpoint: string): Promise<string | null> {
  const mime = imageMime(file);
  if (!mime) return null;
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": mime }, body: file });
    if (!res.ok) return null;
    const { path } = (await res.json()) as { path: string };
    return path ?? null;
  } catch { return null; }
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run packages/client/test/image.test.ts` — PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/clipboard.ts packages/client/src/image.ts packages/client/test/image.test.ts
git commit -m "feat(client): clipboard writer/provider + image MIME + upload"
```

---

## Task 9: client — keybindings unit

**Files:**
- Create: `packages/client/src/keybindings.ts`
- Test: `packages/client/test/keybindings.test.ts`

- [ ] **Step 1: Failing test (pure decision function)**

```ts
import { describe, it, expect } from "vitest";
import { decideKey } from "../src/keybindings.js";

const ev = (o: Partial<KeyboardEvent>) => ({ type: "keydown", key: "", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...o }) as KeyboardEvent;

describe("decideKey", () => {
  it("Shift+Enter => send ESC+CR, swallow", () => {
    expect(decideKey(ev({ key: "Enter", shiftKey: true }), false)).toEqual({ action: "send", data: "\x1b\r", swallow: true });
  });
  it("Cmd+C with selection => copy, swallow; without selection => passthrough", () => {
    expect(decideKey(ev({ key: "c", metaKey: true }), true)).toEqual({ action: "copy", swallow: true });
    expect(decideKey(ev({ key: "c", metaKey: true }), false)).toEqual({ action: "passthrough" });
  });
  it("Cmd+V => swallow (let browser paste fire)", () => {
    expect(decideKey(ev({ key: "v", metaKey: true }), false)).toEqual({ action: "none", swallow: true });
  });
  it("plain key => passthrough", () => {
    expect(decideKey(ev({ key: "a" }), false)).toEqual({ action: "passthrough" });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run packages/client/test/keybindings.test.ts` — FAIL.

- [ ] **Step 3: Implement keybindings.ts**

```ts
export type KeyDecision =
  | { action: "send"; data: string; swallow: true }
  | { action: "copy"; swallow: true }
  | { action: "none"; swallow: true }
  | { action: "passthrough" };

// Pure decision so it is unit-testable; Terminal.tsx maps it onto term/ws.
export function decideKey(e: KeyboardEvent, hasSelection: boolean): KeyDecision {
  if (e.type !== "keydown") return { action: "passthrough" };
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === "Enter" && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey)
    return { action: "send", data: "\x1b\r", swallow: true };
  if (mod && e.key === "c" && hasSelection) return { action: "copy", swallow: true };
  if (mod && !e.altKey && e.key.toLowerCase() === "v") return { action: "none", swallow: true };
  return { action: "passthrough" };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run packages/client/test/keybindings.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/keybindings.ts packages/client/test/keybindings.test.ts
git commit -m "feat(client): pure keybinding decision (shift-enter, copy/paste)"
```

---

## Task 10: client — `<Terminal/>` wiring + image preview/lightbox

**Files:**
- Create: `packages/client/src/image.tsx` (MiniToast + Lightbox + previewImage)
- Create: `packages/client/src/Terminal.tsx`, `packages/client/src/index.ts`

- [ ] **Step 1: Implement image.tsx (preview toast + lightbox; self-contained, no external toaster)**

```tsx
import { useEffect, useState, type ReactNode } from "react";

// Minimal self-contained toast (used when the host passes no `notify`). Scoped inline styles.
export function previewImage(file: File, notify: ((c: ReactNode) => void) | undefined, onExpand: (f: File) => void): void {
  const url = URL.createObjectURL(file);
  const node = (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <img src={url} alt={file.name} onClick={() => onExpand(file)}
        style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 4, cursor: "zoom-in" }} />
      <span style={{ fontSize: 12, opacity: 0.8 }}>Attached to terminal<br/>click to expand</span>
    </div>
  );
  if (notify) notify(node);
  // (no host notifier: the Lightbox still works via onExpand; URL revoked when the lightbox closes)
  setTimeout(() => { if (!notify) URL.revokeObjectURL(url); }, 8000);
}

export function Lightbox({ file, onClose }: { file: File | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file); setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!file || !url) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <img src={url} alt="pasted" style={{ maxHeight: "80vh", maxWidth: "90vw", borderRadius: 6 }} />
    </div>
  );
}
```

- [ ] **Step 2: Implement Terminal.tsx (wires everything from Tasks 6-9 + addons + WS bridge)**

```tsx
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Terminal as Xterm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { themeFor, observeTheme } from "./theme.js";
import { writeClipboard, clipboardProvider } from "./clipboard.js";
import { imageMime, uploadImage } from "./image.js";
import { previewImage, Lightbox } from "./image.tsx";
import { fileLinkProvider, webLinksHandler, type OnOpenLink } from "./links.js";
import { decideKey } from "./keybindings.js";

export interface TerminalProps {
  sessionId: string;
  wsUrl: (sessionId: string) => string;
  uploadEndpoint?: string;           // enables image paste/drop
  onOpenLink?: OnOpenLink;
  theme?: "auto" | { light: ITheme; dark: ITheme };
  notify?: (content: ReactNode | string) => void;
  fontFamily?: string;
  fontSize?: number;
  scrollback?: number;
}

export function Terminal(props: TerminalProps) {
  const { sessionId, wsUrl, uploadEndpoint, onOpenLink, notify } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const [expand, setExpand] = useState<File | null>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const term = new Xterm({
      cursorBlink: true,
      fontSize: props.fontSize ?? 13,
      fontFamily: props.fontFamily ?? "Consolas, Menlo, Monaco, 'Courier New', monospace",
      theme: props.theme && props.theme !== "auto" ? (document.documentElement.classList.contains("dark") ? props.theme.dark : props.theme.light) : themeFor(),
      macOptionClickForcesSelection: true,
      scrollback: props.scrollback ?? 20000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new ClipboardAddon(undefined, clipboardProvider));
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
    term.loadAddon(new WebLinksAddon(webLinksHandler(onOpenLink)));
    if (onOpenLink) term.registerLinkProvider(fileLinkProvider(term, onOpenLink));
    term.open(host);
    try { term.loadAddon(new WebglAddon()); } catch { /* canvas/DOM fallback */ }
    fit.fit();
    term.focus();

    const disposeTheme = observeTheme((t) => { term.options.theme = t; });

    const ws = new WebSocket(wsUrl(sessionId));
    ws.onmessage = (e) => {
      const data = typeof e.data === "string" ? e.data : "";
      if (!data) return;
      if (term.hasSelection()) {
        const top = term.buffer.active.viewportY;
        term.write(data, () => { if (term.hasSelection()) term.scrollToLine(top); });
      } else term.write(data);
    };
    term.onData((d) => ws.readyState === ws.OPEN && ws.send(d));

    term.attachCustomKeyEventHandler((e) => {
      const d = decideKey(e, term.hasSelection());
      if (d.action === "passthrough") return true;
      if (d.action === "copy") void writeClipboard(term.getSelection());
      if (d.action === "send" && ws.readyState === ws.OPEN) ws.send(d.data);
      if (d.swallow) e.preventDefault();
      return false;
    });

    const copyOnMouseUp = () => { const s = term.getSelection(); if (s) void writeClipboard(s); };
    host.addEventListener("mouseup", copyOnMouseUp);
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    host.addEventListener("contextmenu", onContextMenu);

    const injectImage = (file: File) => {
      if (!uploadEndpoint || !imageMime(file)) return false;
      void uploadImage(file, uploadEndpoint).then((p) => { if (p) { term.paste(p); previewImage(file, notify, setExpand); } });
      return true;
    };
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (items) for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file") { const f = it.getAsFile(); if (f && injectImage(f)) { e.preventDefault(); e.stopPropagation(); return; } }
      }
      const text = e.clipboardData?.getData("text/plain");
      if (text) { e.preventDefault(); e.stopPropagation(); term.paste(text); }
    };
    const onDrop = (e: DragEvent) => {
      const imgs = Array.from(e.dataTransfer?.files ?? []).filter((f) => imageMime(f));
      if (!imgs.length) return;
      e.preventDefault(); e.stopPropagation(); imgs.forEach(injectImage);
    };
    const onDragOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    host.addEventListener("paste", onPaste, true);
    host.addEventListener("drop", onDrop, true);
    host.addEventListener("dragover", onDragOver, true);

    const sendResize = () => { fit.fit(); if (ws.readyState === ws.OPEN) ws.send(`\x00resize:${term.cols},${term.rows}`); };
    ws.onopen = sendResize;
    const ro = new ResizeObserver(sendResize);
    ro.observe(host);

    return () => {
      host.removeEventListener("mouseup", copyOnMouseUp);
      host.removeEventListener("contextmenu", onContextMenu);
      host.removeEventListener("paste", onPaste, true);
      host.removeEventListener("drop", onDrop, true);
      host.removeEventListener("dragover", onDragOver, true);
      disposeTheme(); ro.disconnect(); ws.close(); term.dispose();
    };
  }, [sessionId]);

  return (<><div style={{ height: "100%", width: "100%" }} ref={hostRef} /><Lightbox file={expand} onClose={() => setExpand(null)} /></>);
}
```

- [ ] **Step 3: Implement index.ts (exports)**

```ts
export { Terminal } from "./Terminal.js";
export type { TerminalProps } from "./Terminal.js";
export type { OnOpenLink } from "./links.js";
export { DARK, LIGHT } from "./theme.js";
```

- [ ] **Step 4: Install client deps + typecheck both packages**

Run: `npm i` (ensure xterm addons resolve), then `npm run typecheck`
Expected: no type errors. (`react`, `react-dom`, `@types/react*` are client devDeps for typecheck.)

- [ ] **Step 5: Build both packages**

Run: `npm run build`
Expected: `packages/server/dist` and `packages/client/dist` produced, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src package-lock.json package.json
git commit -m "feat(client): <Terminal/> — xterm + addons (webgl/fit/clipboard/web-links/unicode11), ws bridge, paste/drop, links, theme, resize"
```

---

## Task 11: example app — end-to-end parity check

**Files:**
- Create: `examples/basic/{package.json, server.mjs, index.html, main.tsx, vite.config.ts}`

- [ ] **Step 1: Implement the example server (Fastify + webmux-server)**

```js
// examples/basic/server.mjs
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { terminalServer } from "webmux-server";

const app = Fastify();
await app.register(terminalServer, { resolveCwd: () => process.env.HOME ?? "/tmp" });
const dist = join(dirname(fileURLToPath(import.meta.url)), "dist");
await app.register(fastifyStatic, { root: dist });
await app.listen({ port: 5180, host: "127.0.0.1" });
console.log("example on http://127.0.0.1:5180");
```

- [ ] **Step 2: Implement the example client**

```tsx
// examples/basic/main.tsx
import { createRoot } from "react-dom/client";
import { Terminal } from "webmux";

createRoot(document.getElementById("root")!).render(
  <div style={{ height: "100vh" }}>
    <Terminal
      sessionId="demo"
      wsUrl={(id) => `ws://${location.host}/terminal/ws/${id}`}
      uploadEndpoint="/terminal/paste-image"
      onOpenLink={(l) => l.type === "url" ? window.open(l.value, "_blank", "noopener,noreferrer") : alert(`open ${l.value}:${l.line ?? ""}`)}
    />
  </div>,
);
```
Plus minimal `index.html` (`<div id="root">` + module script), `vite.config.ts` (proxy `/terminal` and the WS to `:5180`), and `package.json` (depends on `webmux`, `webmux-server` via `*` workspace, scripts `dev`/`build`).

- [ ] **Step 3: Manual e2e checklist (document in the example README)**

Run: `npm run build && node examples/basic/server.mjs`, open the URL, then verify:
- shell prompt appears; typing works; `ls`/`vim` render; wheel scrolls.
- refresh the browser → same session, **scrollback preserved** (replay).
- select text (Shift/Option+drag) → auto-copies; Cmd/Ctrl+C copies; paste works.
- paste/drop an image → path injected (`[Image #N]`-style) + preview + lightbox on click.
- Shift+Enter inserts a newline (in a prompt that supports it) instead of submitting.
- `echo https://example.com` → Cmd/Ctrl+click opens it; `echo src/x.ts:3:1` → Cmd/Ctrl+click fires onOpenLink.
- toggle `document.documentElement.classList.toggle("dark")` in console → theme flips live.
- resize the window → terminal reflows (cols/rows update).

- [ ] **Step 4: Commit**

```bash
git add examples/basic
git commit -m "example(basic): vite+fastify app wiring webmux + webmux-server (manual e2e)"
```

---

## Self-Review

- **Spec coverage:** transport/persistence/replay (T2-5), theme (T6), links (T7), clipboard+image (T8), keybindings (T9), `<Terminal/>` wiring + paste/drop/resize/preview (T10), e2e parity (T11). Deferred to follow-on plans (noted in Scope): find widget, context menu, 16-color is actually done in T6, link hover, consumer migration, npm publish.
- **Placeholders:** none — every code step is complete; the example `index.html`/`vite.config`/`package.json` are described concretely (small boilerplate) and finalized during T11.
- **Type consistency:** `RunResult`/`Runner` (tmux.ts) reused by exec.ts + plugin.ts; `OnOpenLink` shared by links.ts + Terminal.tsx; `themeFor`/`DARK`/`LIGHT` consistent across theme.ts + index.ts; `decideKey` shape matches its consumer in Terminal.tsx.
- **Note:** `import "./image.tsx"` — keep the `.tsx`/`.js` import extensions consistent with the package's `moduleResolution: NodeNext` (import compiled `./image.js`); fix the one `image.tsx` import to `./image.js` during T10 if tsc complains.
