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
