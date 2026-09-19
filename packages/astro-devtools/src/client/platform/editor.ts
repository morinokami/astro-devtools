import { joinProjectPath } from "./paths.ts";

/**
 * Ask the Vite dev server to open a project file in the local editor. The
 * request is fire-and-forget, but its rejection is not: a dev server that is
 * restarting or gone rejects it, and an unhandled rejection would surface in
 * the inspected application's own page and its error reporting.
 */
export function openInEditor(file: string, root: string | undefined): void {
  const path = root ? joinProjectPath(root, file) : file;
  void fetch(`/__open-in-editor?file=${encodeURIComponent(path)}`).catch(() => {
    // The dev server is the only thing that could have opened the editor.
  });
}
