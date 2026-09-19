/** The decoded Action response formatter's console-like output. */

import { describe, expect, it } from "vite-plus/test";

import { formatActionData } from "../../../../src/client/features/actions/action-response-format.ts";

describe("formatActionData", () => {
  it("prints primitives the way a console would", () => {
    expect(formatActionData("hi")).toBe('"hi"');
    expect(formatActionData(2)).toBe("2");
    expect(formatActionData(-0)).toBe("-0");
    expect(formatActionData(Number.NaN)).toBe("NaN");
    expect(formatActionData(10n)).toBe("10n");
    expect(formatActionData(true)).toBe("true");
    expect(formatActionData(null)).toBe("null");
    expect(formatActionData(undefined)).toBe("undefined");
  });

  it("labels the instance types supported by devalue", () => {
    expect(formatActionData(new Date("2026-01-02T03:04:05.000Z"))).toBe(
      "Date(2026-01-02T03:04:05.000Z)",
    );
    expect(formatActionData(new URL("https://astro.build/"))).toBe("URL(https://astro.build/)");
    expect(formatActionData(/a+/g)).toBe("/a+/g");
  });

  it("indents records and arrays JSON-style", () => {
    expect(formatActionData({ user: { name: "Ada" }, tags: ["a", "b"], empty: {} })).toBe(
      [
        "{",
        '  "user": {',
        '    "name": "Ada"',
        "  },",
        '  "tags": [',
        '    "a",',
        '    "b"',
        "  ],",
        '  "empty": {}',
        "}",
      ].join("\n"),
    );
  });

  it("spells out Map and Set with their sizes", () => {
    expect(formatActionData(new Map([["a", 1]]))).toBe('Map(1) {\n  "a" => 1\n}');
    expect(formatActionData(new Set([1, 2]))).toBe("Set(2) [\n  1,\n  2\n]");
    expect(formatActionData(new Map())).toBe("Map(0) {}");
    expect(formatActionData(new Set())).toBe("Set(0) []");
  });

  it("marks cycles but not mere shared references", () => {
    const shared = { leaf: true };
    expect(formatActionData({ a: shared, b: shared })).toContain('"leaf": true');
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(formatActionData(cyclic)).toBe('{\n  "self": [circular]\n}');
  });
});
