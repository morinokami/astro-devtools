/**
 * Path helpers for project files shown or opened from panels. The project
 * root comes from the dev server as a native path, so a Windows-style root
 * (`C:\app`, `\\server\share`) marks a Windows machine. Only on Windows is
 * `\` a path separator — on POSIX it is an ordinary file-name character.
 * Project-relative paths usually use `/` even on Windows, so joins follow
 * the root's separator.
 */

/** A drive-letter (`C:\…`, `C:/…`) or UNC (`\\server\…`) path. */
function isWindowsPath(path: string): boolean {
  return /^[A-Za-z]:/.test(path) || path.startsWith("\\\\");
}

/**
 * Join a project-relative file onto the root; for example, `src/a.astro`
 * joined onto `C:\app` gives `C:\app\src\a.astro`.
 */
export function joinProjectPath(root: string, file: string): string {
  if (!isWindowsPath(root)) return `${root.replace(/\/+$/, "")}/${file}`;
  return `${root.replace(/[/\\]+$/, "")}\\${file.replaceAll("/", "\\")}`;
}
