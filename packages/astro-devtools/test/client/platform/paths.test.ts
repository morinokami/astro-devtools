import { describe, expect, it } from "vite-plus/test";

import { joinProjectPath } from "../../../src/client/platform/paths.ts";

describe("joinProjectPath", () => {
  it("joins POSIX roots with and without a trailing slash", () => {
    expect(joinProjectPath("/home/user/project", "src/pages/index.astro")).toBe(
      "/home/user/project/src/pages/index.astro",
    );
    expect(joinProjectPath("/home/user/project/", "astro.config.mjs")).toBe(
      "/home/user/project/astro.config.mjs",
    );
  });

  it("follows a Windows root's separator instead of mixing them", () => {
    expect(joinProjectPath("C:\\Users\\me\\project", "src/pages/index.astro")).toBe(
      "C:\\Users\\me\\project\\src\\pages\\index.astro",
    );
    expect(joinProjectPath("C:\\Users\\me\\project\\", "astro.config.mjs")).toBe(
      "C:\\Users\\me\\project\\astro.config.mjs",
    );
  });

  it("joins a UNC root with backslashes", () => {
    expect(joinProjectPath("\\\\server\\share\\project", "src/pages/index.astro")).toBe(
      "\\\\server\\share\\project\\src\\pages\\index.astro",
    );
  });

  it("treats a backslash in a POSIX root as a file-name character", () => {
    expect(joinProjectPath("/tmp/foo\\bar", "src/a.astro")).toBe("/tmp/foo\\bar/src/a.astro");
  });

  it("keeps a filesystem-root project usable", () => {
    expect(joinProjectPath("/", "src/pages/index.astro")).toBe("/src/pages/index.astro");
  });
});
