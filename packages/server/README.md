# @jalipalo/webmux-server

Fastify plugin: a **WebSocket terminal bridge** backed by **persistent tmux sessions** (via `node-pty`). It's the **server** half of webmux — it hosts the tmux session, replays scrollback on reconnect, and bridges the PTY to the browser.

Pair it with the React client [`@jalipalo/webmux`](https://www.npmjs.com/package/@jalipalo/webmux). Full docs + architecture live in the [repo README](https://github.com/j10ra/webmux#readme).

```bash
npm i @jalipalo/webmux-server
```

Requires `tmux` on the host and `fastify@^4` (peer).

## Usage

```ts
import Fastify from "fastify";
import { terminalServer } from "@jalipalo/webmux-server";

const app = Fastify();
await app.register(terminalServer, {
  prefix: "/terminal",                                   // mount point (Fastify's own option)
  resolveCwd: (sessionId) => workdirFor(sessionId),      // working dir per session
  // sessionCommand?: (id) => ({ command: "bash" }),     // default: $SHELL
});
```

## Options

| Option | Default | Notes |
|---|---|---|
| `resolveCwd` | — (required) | `(sessionId) => string \| Promise<string>` working dir |
| `sessionCommand?` | `$SHELL` | `(id) => { command, env? }` launched in the session |
| `tmuxConfig?` | `DEFAULT_TMUX_CONFIG` | sourced on each connect (status/mouse off, focus‑events, clipboard) |
| `imageDir?` | `os.tmpdir()/webmux-pastes` | where pasted images are saved |
| `historyLimit?` | `20000` | tmux + replay scrollback depth |
| `imageBodyLimit?` | `30 MB` | max paste‑image body |

Mount it where you like with Fastify's own `prefix`. Routes: `GET <prefix>/ws/:sessionId` (the terminal WebSocket) and `POST <prefix>/paste-image`.

## Behavior

tmux is the persistent session host: created detached, scrollback replayed via `capture-pane` on connect, the session survives browser disconnect (WS close detaches the PTY; it does **not** kill the session). Registers `@fastify/websocket` only if the host hasn't already.

## License

MIT © Jetz Alipalo
