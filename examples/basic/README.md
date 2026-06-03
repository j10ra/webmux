# webmux-example-basic

Minimal Vite + Fastify app wiring `webmux` (React client) and `webmux-server` (Fastify plugin) end-to-end. Requires tmux installed on the host.

## Dev workflow

Two terminals:

```bash
# terminal 1 — backend on :5180
node examples/basic/server.mjs

# terminal 2 — Vite dev server (HMR, proxies /terminal → :5180)
npm run dev -w webmux-example-basic
```

Open http://localhost:5173 (Vite default port).

## Production build + run

```bash
npm run build -w webmux -w webmux-server && \
  npm run build -w webmux-example-basic && \
  node examples/basic/server.mjs
```

Open http://127.0.0.1:5180.

## Manual e2e checklist

- shell prompt appears; typing works; `ls`/`vim` render; wheel scrolls.
- refresh the browser → same session, scrollback preserved (replay).
- select text (Shift/Option+drag) → auto-copies; Cmd/Ctrl+C copies; paste works.
- paste/drop an image → path injected + preview toast + lightbox on click.
- Shift+Enter inserts a newline (in a prompt that supports it) instead of submitting.
- `echo https://example.com` → Cmd/Ctrl+click opens it; `echo src/x.ts:3:1` → Cmd/Ctrl+click fires onOpenLink (alert).
- toggle `document.documentElement.classList.toggle("dark")` in console → theme flips live.
- resize the window → terminal reflows.
