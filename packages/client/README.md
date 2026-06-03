# @jalipalo/webmux

React `<Terminal/>` — a **browser terminal** (xterm.js) backed by a **persistent tmux session** over a WebSocket, with VSCode‑grade UX. The browser is a stateless viewer onto a tmux session running on the host; closing or refreshing the tab never kills your work, and reconnecting replays scrollback and re‑attaches.

This is the **client** half. Pair it with the server plugin [`@jalipalo/webmux-server`](https://www.npmjs.com/package/@jalipalo/webmux-server). Full docs + the architecture overview live in the [repo README](https://github.com/j10ra/webmux#readme).

```bash
npm i @jalipalo/webmux
```

## Usage

```tsx
import { Terminal } from "@jalipalo/webmux";

<Terminal
  sessionId="my-session"
  wsUrl={(id) => `ws://${location.host}/terminal/ws/${id}`}
  uploadEndpoint="/terminal/paste-image"          // enables image paste/drop
  onOpenLink={(l) =>
    l.type === "url"
      ? window.open(l.value, "_blank", "noopener,noreferrer")
      : openInEditor(l.value, l.line, l.col)}
  autoMouseOnScroll                                // tmux mouse off for native clicks; on while wheeling
/>
```

## Props

| Prop | Type | Notes |
|---|---|---|
| `sessionId` | `string` | tmux session to attach to |
| `wsUrl` | `(id) => string` | builds the `ws(s)://…/ws/<id>` URL |
| `uploadEndpoint?` | `string` | enables image paste/drop (POSTs the image, injects the returned path) |
| `onOpenLink?` | `(l) => void` | modifier‑click on a URL or `file:line:col` |
| `theme?` | `"auto" \| { light, dark }` | default: VSCode Dark+/Light+, follows the `dark` class on `<html>` |
| `notify?` | `(content) => void` | image‑paste preview; falls back to a bundled mini‑toast |
| `autoMouseOnScroll?` | `boolean` | tmux mouse off for native clicks; flipped on only while the wheel spins |
| `fontFamily?` / `fontSize?` / `scrollback?` / `scrollOnUserInput?` | | rendering knobs |

## Features

GPU rendering (WebGL, canvas fallback), unicode‑11 widths, 16‑color theming, copy/paste to the OS clipboard (secure‑context + insecure‑origin fallback), copy‑on‑select, image paste/drop with preview + lightbox, clickable URL + file links, Shift+Enter newline, fit‑on‑resize, scrollback that survives reconnect.

## License

MIT © Jetz Alipalo
