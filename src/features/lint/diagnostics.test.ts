import { describe, expect, it } from "vite-plus/test";
import { mapSeverity, mapSpectralResult, severityRank } from "./diagnostics";

describe("mapSeverity", () => {
  it.each([
    [0, "error"],
    [1, "warning"],
    [2, "info"],
    [3, "info"],
  ] as const)("severity %i → %s", (input, expected) => {
    expect(mapSeverity(input)).toBe(expected);
  });
});

describe("mapSpectralResult", () => {
  it("range 0-based → 1-based，code 字符串化", () => {
    expect(
      mapSpectralResult({
        code: "oas3-schema",
        message: "应包含 info 字段",
        severity: 0,
        range: { start: { line: 2, character: 4 }, end: { line: 2, character: 10 } },
      }),
    ).toEqual({
      line: 3,
      column: 5,
      endLine: 3,
      endColumn: 11,
      message: "应包含 info 字段",
      code: "oas3-schema",
      severity: "error",
    });
  });

  it("数字 code 转字符串", () => {
    const r = mapSpectralResult({
      code: 42,
      message: "m",
      severity: 1,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    });
    expect(r.code).toBe("42");
    expect(r.severity).toBe("warning");
  });

  it("缺 end 时用 start 兜底", () => {
    const r = mapSpectralResult({
      code: "x",
      message: "m",
      severity: 2,
      range: { start: { line: 5, character: 3 } },
    });
    expect(r.endLine).toBe(6);
    expect(r.endColumn).toBe(4);
  });
});

describe("severityRank", () => {
  it("error < warning < info", () => {
    expect(severityRank("error")).toBeLessThan(severityRank("warning"));
    expect(severityRank("warning")).toBeLessThan(severityRank("info"));
  });
});
