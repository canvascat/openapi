import { describe, expect, it } from "vite-plus/test";
import { classifyGithubError, decodeBase64, encodeBase64 } from "./github";

describe("base64", () => {
  it("UTF-8 round-trip（含中文）", () => {
    const text = 'openapi: 3.1.0\ninfo:\n  title: 宠物店 API "v1"';
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });
  it("decode 容忍 GitHub 返回内容中的换行符", () => {
    const b64 = encodeBase64("hello world");
    const chunked = `${b64.slice(0, 4)}\n${b64.slice(4)}\n`;
    expect(decodeBase64(chunked)).toBe("hello world");
  });
});

describe("classifyGithubError", () => {
  it.each([
    [401, "unauthorized"],
    [403, "rate-limited"],
    [429, "rate-limited"],
    [404, "not-found"],
    [409, "conflict"],
    [500, "unknown"],
  ])("status %i → %s", (status, kind) => {
    expect(classifyGithubError({ status })).toBe(kind);
  });
  it("非对象输入 → unknown", () => {
    expect(classifyGithubError(null)).toBe("unknown");
    expect(classifyGithubError("boom")).toBe("unknown");
  });
});
