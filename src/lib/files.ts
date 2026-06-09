import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

/** True when running inside the Tauri shell (false in a plain browser). */
export const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Normalize CRLF on read: Milkdown serializes LF, so keeping \r\n in
// savedContent would make the dirty check never match again after an edit.
export const readFile = async (path: string) =>
  (await invoke<string>("read_file", { path })).replace(/\r\n/g, "\n");

export const saveFile = (path: string, contents: string) =>
  invoke<void>("save_file", { path, contents });

export const getPendingFiles = () => invoke<string[]>("get_pending_files");

const MD_EXTENSIONS = ["md", "markdown", "mdown", "mkd"];

export async function pickOpenPaths(): Promise<string[]> {
  const selection = await open({
    multiple: true,
    filters: [{ name: "Markdown", extensions: MD_EXTENSIONS }],
  });
  if (!selection) return [];
  return Array.isArray(selection) ? selection : [selection];
}

export async function pickSavePath(suggestedName: string): Promise<string | null> {
  return save({
    defaultPath: suggestedName,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
}

export function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** Browser fallback for saving: download the markdown as a file. */
export function downloadMarkdown(name: string, contents: string) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "text/markdown" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = /\.(md|markdown|mdown|mkd)$/i.test(name) ? name : `${name}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
