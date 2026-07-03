// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { clearToken, getOctokit, getToken, setToken } from "./session";

describe("session", () => {
  beforeEach(() => {
    localStorage.clear();
    clearToken();
  });

  it("默认无 token", () => {
    expect(getToken()).toBeNull();
  });

  it("setToken 后可读取，clearToken 后清空", () => {
    setToken("ghp_test");
    expect(getToken()).toBe("ghp_test");
    expect(localStorage.getItem("openapi.github.pat")).toBe("ghp_test");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("无 token 时 getOctokit 抛错", () => {
    expect(() => getOctokit()).toThrow();
  });

  it("有 token 时 getOctokit 返回同一实例，换 token 后返回新实例", () => {
    setToken("ghp_a");
    const first = getOctokit();
    expect(getOctokit()).toBe(first);
    setToken("ghp_b");
    expect(getOctokit()).not.toBe(first);
  });
});
