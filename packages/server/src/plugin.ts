import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as pty from "node-pty";
import fastifyWebsocket from "@fastify/websocket";
import type { FastifyPluginAsync } from "fastify";
import { run } from "./exec.js";
import { TmuxSessions, sanitizeName, attachArgs, sourceArgs, writeTmuxConfig } from "./tmux.js";

export interface TerminalServerOptions {
  resolveCwd: (sessionId: string) => string | Promise<string>;
  sessionCommand?: (sessionId: string) => { command: string; env?: Record<string, string> };
  imageDir?: string;
  historyLimit?: number;
  imageBodyLimit?: number;
  // tmux config sourced on each connect (defaults to DEFAULT_TMUX_CONFIG: status+mouse off). Set
  // this to enable mouse passthrough, custom keybindings, etc.
  tmuxConfig?: string;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

// Mount where you like with Fastify's own prefix: `app.register(terminalServer, { prefix: "/terminal", ... })`.
// Routes are registered directly on the plugin's (encapsulated) instance, so the plugin never
// self-prefixes — passing Fastify's reserved `prefix` is the single source of truth for the path.
export const terminalServer: FastifyPluginAsync<TerminalServerOptions> = async (app, opts) => {
  const historyLimit = opts.historyLimit ?? 20000;
  const imageDir = opts.imageDir ?? join(tmpdir(), "webmux-pastes");
  const tmux = new TmuxSessions(run, historyLimit);

  writeTmuxConfig(opts.tmuxConfig);

  // A host app commonly registers @fastify/websocket already (for its own WS routes). It decorates
  // with `websocketServer` via fastify-plugin, and a second registration throws on the duplicate
  // decorator — so only register it when the host hasn't.
  if (!app.hasDecorator("websocketServer")) await app.register(fastifyWebsocket);
  app.addContentTypeParser(/^image\//, { parseAs: "buffer" }, (_req, body, done) =>
    done(null, body),
  );

  const wsHandler: fastifyWebsocket.WebsocketHandler<
    import("http").Server,
    import("http").IncomingMessage,
    { Params: { sessionId: string } }
  > = async (socket, req) => {
    const name = sanitizeName(req.params.sessionId);
    const cwd = await opts.resolveCwd(req.params.sessionId);
    const sc = opts.sessionCommand?.(req.params.sessionId) ?? {
      command: process.env.SHELL ?? "bash",
    };

    await tmux.ensure(name, cwd, sc.command, sc.env ?? {});
    void run("tmux", sourceArgs());

    const history = await tmux.replay(name);

    if (history) socket.send(history);

    const term = pty.spawn("tmux", attachArgs(name), {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      env: process.env as Record<string, string>,
    });

    term.onData((d) => socket.send(d));
    term.onExit(() => socket.close());
    socket.on("message", (raw: Buffer) => {
      const m = raw.toString();

      if (m.startsWith("\x00resize:")) {
        const [c, r] = m.slice(8).split(",").map(Number);

        if (c && r) term.resize(c, r);
      } else {
        term.write(m);
      }
    });
    socket.on("close", () => term.kill());
  };

  app.get("/ws/:sessionId", { websocket: true }, wsHandler);

  app.post(
    "/paste-image",
    { bodyLimit: opts.imageBodyLimit ?? 30 * 1024 * 1024 },
    async (req, reply) => {
      const buf = req.body as Buffer;

      if (!buf?.length) return reply.code(400).send({ error: "empty body" });
      const ct = (req.headers["content-type"] ?? "image/png").split(";")[0].trim();

      await mkdir(imageDir, { recursive: true });
      const path = join(
        imageDir,
        `paste-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${EXT[ct] ?? "png"}`,
      );

      await writeFile(path, buf);

      return { path };
    },
  );
};
