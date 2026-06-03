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
