import { describe, it, expect } from "vitest";
import {
  newSessionArgs,
  attachArgs,
  captureArgs,
  historyLimitArgs,
  sanitizeName,
  TmuxSessions,
} from "../src/tmux.js";

describe("tmux args", () => {
  it("sanitizes a session name (tmux forbids dots/colons)", () => {
    expect(sanitizeName("cc-3566-1")).toBe("cc-3566-1");
    expect(sanitizeName("a.b:c d")).toBe("a_b_c_d");
  });
  it("new-session is detached, in cwd, with env pairs and split command", () => {
    expect(newSessionArgs("s", "/wt/x", "claude --foo", { A: "1" })).toEqual([
      "new-session",
      "-d",
      "-s",
      "s",
      "-c",
      "/wt/x",
      "-e",
      "A=1",
      "claude",
      "--foo",
    ]);
  });
  it("attach + capture + history args", () => {
    expect(attachArgs("s")).toEqual(["attach-session", "-t", "s"]);
    expect(captureArgs("s", 20000)).toEqual([
      "capture-pane",
      "-p",
      "-e",
      "-J",
      "-S",
      "-20000",
      "-t",
      "s",
    ]);
    expect(historyLimitArgs("s", 20000)).toEqual([
      "set-option",
      "-t",
      "s",
      "history-limit",
      "20000",
    ]);
  });
});

function fakeRun() {
  const calls: string[][] = [];

  const run = async (_cmd: string, args: string[]) => {
    calls.push(args);
    if (args[0] === "has-session") return { code: 1, stdout: "", stderr: "" }; // not exists
    if (args[0] === "capture-pane") return { code: 0, stdout: "history-line\n", stderr: "" };

    return { code: 0, stdout: "", stderr: "" };
  };

  return { run, calls };
}

describe("TmuxSessions", () => {
  it("ensure() creates the session (with history-limit) when has-session fails", async () => {
    const { run, calls } = fakeRun();
    const t = new TmuxSessions(run, 20000);

    await t.ensure("s", "/wt/x", "bash", {});
    expect(calls.some((a) => a[0] === "new-session")).toBe(true);
    expect(calls.some((a) => a[0] === "set-option" && a.includes("history-limit"))).toBe(true);
  });
  it("replay() returns captured history", async () => {
    const { run } = fakeRun();
    const t = new TmuxSessions(run, 20000);

    expect(await t.replay("s")).toBe("history-line\n");
  });
});
