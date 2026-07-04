import { describe, expect, it } from "vite-plus/test";
import { classifyGithubError, decodeBase64, encodeBase64, mapCommit } from "./github";

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

describe("mapCommit", () => {
  it("完整字段映射（shortSha 取前 7 位、parent 取第一个）", () => {
    expect(
      mapCommit({
        sha: "abcdef1234567890",
        commit: {
          message: "feat: 新增宠物接口\n\n详细说明",
          author: { name: "张三", date: "2026-07-01T08:00:00Z" },
        },
        parents: [{ sha: "p1" }, { sha: "p2" }],
      }),
    ).toEqual({
      sha: "abcdef1234567890",
      shortSha: "abcdef1",
      message: "feat: 新增宠物接口\n\n详细说明",
      authorName: "张三",
      authorDate: "2026-07-01T08:00:00Z",
      parentSha: "p1",
    });
  });

  it("缺 author 时兜底", () => {
    const r = mapCommit({ sha: "1234567890", commit: { message: "m", author: null }, parents: [] });
    expect(r.authorName).toBe("未知作者");
    expect(r.authorDate).toBeNull();
  });

  it("无 parent（首提交）→ parentSha 为 null", () => {
    const r = mapCommit({
      sha: "1234567890",
      commit: { message: "init", author: { name: "a", date: "2026-01-01T00:00:00Z" } },
      parents: [],
    });
    expect(r.parentSha).toBeNull();
  });
});
