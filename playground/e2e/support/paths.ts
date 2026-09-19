import path from "node:path";

export const e2eDir = path.resolve(import.meta.dirname, "..");
export const playgroundDir = path.resolve(e2eDir, "..");
const runId = process.env.PLAYGROUND_E2E_RUN_ID ?? `${Date.now()}-${process.pid}`;
process.env.PLAYGROUND_E2E_RUN_ID = runId;

export const artifactsDir = path.join(playgroundDir, ".e2e", runId);
export const authStatePath = path.join(artifactsDir, "auth.json");
export const serverLogPath = path.join(artifactsDir, "server.log");
