import { describe, expect, test } from "bun:test";
import { applyEnv, parseEnvLine } from "./env.ts";

describe("parseEnvLine", () => {
  test("reads plain, exported, and quoted assignments", () => {
    expect(parseEnvLine("BUNGIE_API_KEY=abc")).toEqual({
      key: "BUNGIE_API_KEY",
      value: "abc",
    });
    expect(parseEnvLine("export BUNGIE_CLIENT_ID=42")).toEqual({
      key: "BUNGIE_CLIENT_ID",
      value: "42",
    });
    expect(parseEnvLine(`BUNGIE_CLIENT_SECRET="sek ret"`)).toEqual({
      key: "BUNGIE_CLIENT_SECRET",
      value: "sek ret",
    });
    expect(parseEnvLine("NAME='quoted'")).toEqual({ key: "NAME", value: "quoted" });
  });

  test("strips unquoted inline comments and skips comments", () => {
    expect(parseEnvLine("TOKEN=abc # comment")).toEqual({
      key: "TOKEN",
      value: "abc",
    });
    expect(parseEnvLine("# TOKEN=hidden")).toBeNull();
    expect(parseEnvLine("")).toBeNull();
    expect(parseEnvLine("not an assignment")).toBeNull();
  });
});

describe("applyEnv", () => {
  test("does not override variables that are already set", () => {
    const env: Record<string, string | undefined> = { KEEP: "original" };
    applyEnv("KEEP=new\nNEW=value\n", env);
    expect(env.KEEP).toBe("original");
    expect(env.NEW).toBe("value");
  });
});
