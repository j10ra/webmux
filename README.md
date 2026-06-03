# webmux

A browser terminal backed by a **persistent tmux session** over a WebSocket, with VSCode‑grade UX.

The browser is a stateless **viewer** onto a tmux session running on the host (a shell, or a CLI
agent). Closing or refreshing the tab never kills your work; reconnecting replays scrollback and
re‑attaches to the same live session. It's domain‑agnostic: the host app injects the working
directory, image‑upload location, and "open file" action — webmux knows nothing about your domain.

```
browser <Terminal/> (xterm.js)  <->  WebSocket  <->  node-pty(`tmux attach`)  <->  tmux session (host)
```

## Packages

Two packages so a browser app never pulls in `node-pty`'s native build, and a server app never pulls in React.

| Package | What | Runtime | Source |
|---|---|---|---|
| [`@jalipalo/webmux`](https://www.npmjs.com/package/@jalipalo/webmux) | React `<Terminal/>` — xterm.js UX | browser (no node deps) | [`packages/client`](packages/client) |
| [`@jalipalo/webmux-server`](https://www.npmjs.com/package/@jalipalo/webmux-server) | Fastify plugin — WS bridge + tmux session host | node (node-pty) | [`packages/server`](packages/server) |

```bash
npm i @jalipalo/webmux            # client (React)
npm i @jalipalo/webmux-server     # server (Fastify plugin); needs tmux on the host
```

## Features

- Persistent sessions via tmux; **scrollback survives reconnect** (history replayed on connect).
- VSCode‑grade rendering: WebGL renderer (canvas fallback), unicode‑11 widths, 16‑color theming.
- Copy/paste to the OS clipboard (secure‑context + insecure‑origin fallback), copy‑on‑select.
- **Image paste/drop** → uploaded and the path injected (for CLI agents) with a preview toast/lightbox.
- **Clickable links**: URLs (modifier‑click) and file paths (`foo.ts:42:5`) via an injected handler.
- Shift+Enter newline, live light/dark theme, fit‑on‑resize, smart wheel scroll (`autoMouseOnScroll`).

## Usage (sketch)

Server (Fastify):
```ts
import { terminalServer } from "@jalipalo/webmux-server";
app.register(terminalServer, {
  prefix: "/terminal",                                 // mount point (Fastify's own option)
  resolveCwd: (sessionId) => "/path/to/workdir/for/" + sessionId,
  // sessionCommand?: (id) => ({ command: "bash" }),  // default: $SHELL
});
```

Client (React):
```tsx
import { Terminal } from "@jalipalo/webmux";
<Terminal
  sessionId="my-session"
  wsUrl={(id) => `ws://${location.host}/terminal/ws/${id}`}
  uploadEndpoint="/terminal/paste-image"          // enables image paste/drop
  onOpenLink={(l) => l.type === "url" ? window.open(l.value, "_blank", "noopener,noreferrer") : openInEditor(l.value)}
  autoMouseOnScroll                                // tmux mouse off for native clicks; on while wheeling
/>
```

A runnable end‑to‑end example (Vite + Fastify wiring both packages) lives in
[`examples/basic`](examples/basic). Per‑package API details are in each package's README
([client](packages/client), [server](packages/server)); the full design rationale is in
[`docs/design.md`](docs/design.md).

## Limitations

These follow from tmux owning the session (the trade for persistence) rather than from bugs:

- **Selection is bounded to the visible viewport.** tmux holds the scrollback, so xterm has no local buffer to auto-scroll into while you drag — you can't extend a selection past the top/bottom edge. Scroll the text into view first, then select.
- **Scrolling needs the mouse routed to tmux/the app.** A bare shell scrolls via tmux's history and full-screen apps scroll their own transcript, so the wheel only scrolls when tmux mouse mode is on. `autoMouseOnScroll` flips it on just while the wheel spins (and off otherwise, so xterm keeps native clicks/selection); the first notch of a burst is spent enabling it.

## Roadmap

Designed but not yet implemented: find widget (search overlay), right‑click context menu, link hover affordance.

## Development

npm workspaces monorepo (Node 18+, tmux for running the example):

```bash
npm install        # install all workspaces
npm run build      # tsc build both packages
npm test           # vitest (server: node, client: jsdom)
npm run typecheck
npm run check      # biome
```

## License
MIT © Jetz Alipalo
