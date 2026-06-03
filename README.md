# webmux

A browser terminal backed by a **persistent tmux session** over a WebSocket, with VSCode‑grade UX.

> Status: early — repo scaffolded, implementation in progress. See [`docs/design.md`](docs/design.md).

The browser is a stateless **viewer** onto a tmux session running on the host (a shell, or a CLI
agent). Closing or refreshing the tab never kills your work; reconnecting replays scrollback and
re‑attaches to the same live session. It's domain‑agnostic: the host app injects the working
directory, image‑upload location, and "open file" action — webmux knows nothing about your domain.

```
browser <Terminal/> (xterm.js)  <->  WebSocket  <->  node-pty(`tmux attach`)  <->  tmux session (host)
```

## Packages

| Package | What | Runtime |
|---|---|---|
| [`webmux`](packages/client) | React `<Terminal/>` — xterm.js UX | browser (no node deps) |
| [`webmux-server`](packages/server) | Fastify plugin — WS bridge + tmux session host | node (node-pty) |

```bash
npm i webmux            # client
npm i webmux-server     # server (Fastify plugin)
```

## Features
- Persistent sessions via tmux; **scrollback survives reconnect** (history replayed on connect).
- VSCode‑grade rendering: WebGL renderer (canvas fallback), unicode‑11 widths, 16‑color theming.
- Copy/paste to the OS clipboard (secure‑context + insecure‑origin fallback), copy‑on‑select.
- **Image paste/drop** → uploaded and the path injected (for CLI agents) with a preview toast/lightbox.
- **Clickable links**: URLs (modifier‑click) and file paths (`foo.ts:42:5`) via an injected handler.
- Find widget, right‑click menu, Shift+Enter newline, live light/dark theme, fit‑on‑resize.

## Usage (sketch)

Server (Fastify):
```ts
import { terminalServer } from "webmux-server";
app.register(terminalServer, {
  resolveCwd: (sessionId) => "/path/to/workdir/for/" + sessionId,
  // sessionCommand?: (id) => ({ command: "bash" }),  // default: $SHELL
});
```

Client (React):
```tsx
import { Terminal } from "webmux";
<Terminal
  sessionId="my-session"
  wsUrl={(id) => `ws://${location.host}/terminal/ws/${id}`}
  uploadImage={(file) => fetch("/terminal/paste-image", { method: "POST", headers: { "Content-Type": file.type }, body: file }).then(r => r.json()).then(j => j.path)}
  onOpenLink={(l) => l.type === "url" ? window.open(l.value, "_blank", "noopener,noreferrer") : openInEditor(l.value)}
/>
```

## License
MIT © Jetz Alipalo
