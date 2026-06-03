# webmux — a reusable web terminal over tmux (design)

## Summary
**`webmux`** is a standalone, MIT-licensed, npm-published, domain-agnostic package that gives any
web app a VSCode-grade browser terminal backed by a **persistent tmux session** over a WebSocket.
Host apps consume it via `npm i`. The package owns xterm UX + the WS/tmux transport; the host app
injects all project-specific glue (per-session working dir, image-save location, "open file"
action) via config/callbacks. It knows nothing about the host's domain.

## Goals
- One published package family any app can install and wire in a few lines.
- VSCode-grade UX: GPU rendering, find/search, right-click menu, unicode widths, full 16-color
  ANSI theming, clickable URL + file links, link hover.
- Full interactive behavior: copy/paste, image paste/drop with preview + toast, Shift+Enter
  newline, scroll/selection, live theme, resize/fit.
- Persistence: closing the browser never kills the session; scrollback survives reconnect.
- Zero domain coupling; zero forced UI-framework dep on the host (no required component lib/toaster).

## Non-goals
- Not a tmux replacement or a general multiplexer UI (no tmux panes/windows surfaced).
- No auth/multi-tenant model (the host owns auth + which sessions a user may reach).
- No image *rendering* in the terminal (images are uploaded + path-injected for a CLI agent;
  sixel/inline-image display is out of scope).

## Repository & packaging
Public repo (MIT), npm workspaces:
```
webmux/
  packages/
    client/   -> npm "webmux"          React <Terminal/>; browser-only; NO node deps
    server/   -> npm "webmux-server"   Fastify plugin (WS + tmux host); node-pty, fastify
  examples/   minimal Vite + Fastify app wiring both
  README.md, LICENSE (MIT)
```
- Split so UI consumers don't pull `node-pty`/native bits.
- A consuming app can develop against it via `file:`/`npm link` before switching to the registry.
- No host-specific strings anywhere in the packages; all such behavior arrives through config.

## Architecture
```
browser <Terminal/> (xterm.js)  <->  WebSocket  <->  node-pty(`tmux attach`)  <->  tmux session (host)
```
- tmux is the **session host only**: created detached, `mouse off` (so xterm — not tmux copy-mode —
  owns scroll/selection/copy; no mouse-drag unbinds or mode-style needed).
- `history-limit` = 20000.
- Persistence: WS close => `pty.kill` detaches the attach client; the tmux **session persists**.
  An explicit `killSession` (host-driven) is the only thing that ends it.
- Scrollback survival: on connect the server **replays** `tmux capture-pane -peJ -S -20000` into the
  socket before attaching the live stream, so xterm reconstructs history (xterm `scrollback: 20000`).

## Package: `webmux-server` (Fastify plugin)
```ts
register(terminalServer, {
  prefix?: string,                                   // default "/terminal"
  resolveCwd: (sessionId: string) => string | Promise<string>,        // working dir per session
  sessionCommand?: (sessionId: string) => { command: string; env?: Record<string,string> }, // default: $SHELL
  imageDir?: string,                                 // default os.tmpdir()/webmux-pastes
  historyLimit?: number,                             // default 20000
  imageBodyLimit?: number,                           // default 30 * 1024 * 1024
})
```
Routes (under `prefix`):
- `GET /ws/:sessionId` — ensure tmux session (detached `new-session -c <resolveCwd>` running
  `sessionCommand`, set `history-limit`, mouse off via a sourced config) → capture-replay history →
  `node-pty` `tmux attach` → bridge: `pty.onData->socket.send`, `socket msg -> pty.write`,
  control msg `\x00resize:<cols>,<rows>` -> `pty.resize`; `socket close -> pty.kill`.
- `POST /paste-image` — raw `image/*` body (content-type parser, `imageBodyLimit`) saved to
  `imageDir` as `paste-<ts>-<seq>.<ext>`; returns `{ path }`.
Exported helpers for the host (session registry/GC live in the host): `createSession`,
`listSessions`, `killSession`, `sendKeys`, `capturePane`.
tmux tweaks are sourced from ONE generated config file per connect (avoids ~13 subprocess spawns):
`mouse off`, `set-clipboard on`, `terminal-features ...:clipboard`.

## Package: `webmux` (React)
```ts
<Terminal
  sessionId: string
  wsUrl: (sessionId: string) => string           // host builds ws(s)://.../<prefix>/ws/<id>
  theme?: "auto" | { light: ITheme; dark: ITheme } // default VSCode Dark+/Light+ 16-color palettes;
                                                   // "auto" follows the `dark` class on <html>
  uploadImage?: (file: File) => Promise<string | null>   // omit => image paste/drop disabled
  onOpenLink?: (l: { type: "url" | "file"; value: string; line?: number; col?: number }) => void
                                                   // omit => file links disabled; URLs still open via default
  fileLinkPattern?: RegExp                         // default = built-in extension-allowlist regex
  notify?: (content: ReactNode | string, opts?) => void   // image-paste confirmation; falls back to bundled mini-toast
  submitKey?: "enter"                              // Enter submits; Shift+Enter => newline (ESC+CR). default
  fontFamily?: string                              // default "Consolas, Menlo, Monaco, 'Courier New', monospace"
  fontSize?: number                                // default 13
  scrollback?: number                              // default 20000
  onReady?: (api: { focus(): void; fit(): void; search(q): void }) => void
/>
```
Self-contained UI: ships its own minimal **find widget**, **image lightbox**, and **context menu**
with scoped styles; does NOT require the host to provide a component lib or toaster. `notify` is optional.

## Behaviors
### Interactive core
- **Selection/copy:** `macOptionClickForcesSelection`; auto-copy selection on mouseup; Cmd/Ctrl+C
  copies when there's a selection, else passes through (SIGINT). Clipboard write uses
  `navigator.clipboard` in a secure context with a hidden-`textarea`+`execCommand` fallback for
  insecure origins (HTTP over a LAN IP/host); `ClipboardAddon` routes OSC52 through the same writer.
- **Paste:** Cmd/Ctrl+V returns false in the key handler (so xterm doesn't eat it as `^V`); the
  browser paste event drives the paste handler; text pasted via `term.paste` (bracketed).
- **Image paste/drop:** image file (MIME or filename-extension fallback) -> `uploadImage` ->
  inject returned path via `term.paste` (bracketed -> a CLI agent shows `[Image #N]`) -> **thumbnail
  toast** (rendered from local bytes) whose click opens a **lightbox**; object-URL lifecycle managed.
- **Shift+Enter = newline:** `e.preventDefault()` + send `\x1b\r` (ESC+CR) so a CLI agent inserts a
  newline instead of submitting. (Behind `submitKey`; non-agent consumers can opt out.)
- **Scroll:** large local scrollback; **pin viewport during selection** (capture `viewportY`, write
  with callback, `scrollToLine(top)` if still selecting) so live output doesn't break a selection.
- **Resize:** `FitAddon` + `ResizeObserver` (debounced) -> `fit.fit()` + send `\x00resize:` ; also on
  `ws.onopen`.
- **Links:** URLs (modifier-click) + file paths (modifier-click -> `onOpenLink`); built-in
  extension-allowlist regex with `:line:col` parsing; an optional `/workspace/`-style prefix is
  stripped from the emitted file value.

### VSCode-grade
- **Rendering:** `@xterm/addon-webgl` GPU renderer with automatic fallback to canvas/DOM on context
  loss/unavailable; `@xterm/addon-unicode11` + activate version 11 for correct wide/emoji widths.
- **Theming:** full **16-color ANSI** light/dark palettes matching VSCode Dark+/Light+; live-swap via
  MutationObserver on the `dark` class.
- **Find widget:** `@xterm/addon-search` + an overlay (Cmd/Ctrl+F): next/prev, case, regex,
  highlight-all, result count, Esc to close.
- **Context menu:** real right-click menu — Copy / Paste / Select All / Clear / Find.
- **Link hover:** underline + pointer affordance on hover.

## Shared vs per-client state
The tmux session is the single shared source of truth; the browser UX is local to each client.
- **Shared (via the tmux session, every attached client sees):** terminal output, keystrokes, and
  the injected image **path text** (so `[Image #N]` shows for all viewers).
- **Per-client (browser-local only):** the OS clipboard (copy/paste targets the *browser machine's*
  clipboard — there is no shared server clipboard; a normal gesture-driven write that persists like
  any copy), text selection, scroll position, the find widget, the theme, and the image
  preview **toast/lightbox** (rendered from the local `File`; never broadcast).
- Clipboard reliability: `navigator.clipboard` on a secure context (`localhost` qualifies even over
  HTTP) with the `execCommand` fallback for LAN-IP/insecure origins.

## Host integration (example consumer)
A typical consumer is a "one session per task/workspace" dev tool. It wires:
- Server: `register(terminalServer, { resolveCwd: id => workdirFor(id), sessionCommand: id =>
  ({ command: agentOrShell(id) }) })`, and keeps its own session registry / cleanup, calling the
  exported `createSession`/`killSession`/`sendKeys`/`capturePane` helpers.
- Web: `<Terminal wsUrl={...} uploadImage={-> POST /terminal/paste-image}
  onOpenLink={l => l.type === "file" ? openFile(l.value, l.line, l.col) : window.open(l.value, "_blank", "noopener,noreferrer")}
  notify={hostToast} />`. The session->workdir mapping and the open-file action stay in the host app.
- Net effect: the host's terminal/WS/tmux code collapses to a few lines of config; behavior is
  identical, plus the new features.

## Phasing (for the implementation plan)
1. **Scaffold** the repo (workspaces, MIT, README, example app, CI for build+test+publish).
2. **server** package: tmux host + WS bridge + capture-replay + paste-image + helpers; unit tests
   (session lifecycle, resize protocol, replay).
3. **client** package: xterm wiring + addons (webgl/fit/clipboard/web-links/unicode11) + theme +
   keybindings + image paste/drop + links + resize — the interactive core, domain-agnostic.
4. **VSCode-parity features:** find widget, context menu, 16-color palettes, link hover.
5. **Reference consumer migration:** swap a host app's terminal/WS/tmux code to consume the
   packages (via `file:` link first), verify parity end-to-end (persistence + clickable links).
6. **Publish** to npm; switch the consumer to the registry version.

## Testing
- server: vitest unit tests for session create/attach-args/history-limit/replay/resize-parse/kill,
  with `tmux`/`node-pty` faked.
- client: component tests for keybindings (Shift+Enter->ESC+CR, Ctrl+C copy-vs-passthrough, Ctrl+V),
  the file-link regex (positive/negative cases incl. `:line:col`), theme selection by `dark` class,
  and image-MIME resolution (incl. empty-type extension fallback).
- example app for manual e2e (resize, scrollback-survives-refresh, search, paste).

## Risks / open points
- **WebGL in some browsers/remote setups** — must fall back cleanly (canvas) without breaking.
- **capture-replay fidelity** — colored/wrapped history via `-e -J`; large 20k replay should stream,
  not block; verify ordering (history fully flushed before the live attach starts).
- **Self-contained UI vs host styling** — the bundled find/menu/lightbox must look acceptable
  unstyled and be overridable; keep CSS scoped to avoid leaking into hosts.
- **Publish/versioning overhead** — two packages, one repo; semver discipline; consumers pin a range.
- **Shift+Enter ESC+CR** is agent-specific; keep behind `submitKey` so non-agent consumers can opt out.
