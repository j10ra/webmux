import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { terminalServer } from "../src/plugin.js";

it("registers alongside a host that already registered @fastify/websocket", async () => {
  const app = Fastify();

  await app.register(fastifyWebsocket);
  await app.register(terminalServer, { resolveCwd: () => "/tmp" });
  await expect(app.ready()).resolves.toBeDefined();
  await app.close();
});

it("paste-image saves the body and returns a path", async () => {
  const app = Fastify();

  await app.register(terminalServer, { resolveCwd: () => "/tmp", imageDir: "/tmp/webmux-test" });
  const res = await app.inject({
    method: "POST",
    url: "/terminal/paste-image",
    headers: { "content-type": "image/png" },
    payload: Buffer.from([1, 2, 3]),
  });

  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body).path).toMatch(/webmux-test\/paste-.*\.png$/);
  await app.close();
});
