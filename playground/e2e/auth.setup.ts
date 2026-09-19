import { writeFile } from "node:fs/promises";

import { expect, test } from "./support/fixtures.ts";
import { authorize } from "./support/helpers.ts";
import { authStatePath, serverLogPath } from "./support/paths.ts";

const AUTH_TOKEN_KEY = "__DEVFRAME_CONNECTION_AUTH_TOKEN__";

test("the auth setup authorizes the browser with the terminal OTP", async ({ page, baseUrl }) => {
  const response = await page.goto(`${baseUrl}/`);
  expect(response?.ok()).toBe(true);
  expect(await page.content()).toContain("astro-devtools playground");

  await authorize(page, baseUrl, serverLogPath);

  const storageState = await page.context().storageState();
  const authOrigins = storageState.origins
    .map((origin) => ({
      ...origin,
      localStorage: origin.localStorage.filter(({ name }) => name === AUTH_TOKEN_KEY),
    }))
    .filter(({ localStorage }) => localStorage.length > 0);

  expect(authOrigins.flatMap(({ localStorage }) => localStorage)).toHaveLength(1);
  await writeFile(
    authStatePath,
    `${JSON.stringify({ cookies: [], origins: authOrigins }, null, 2)}\n`,
  );
});
