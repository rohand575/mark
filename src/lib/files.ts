import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

/** True when running inside the Tauri shell (false in a plain browser). */
export const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const readFile = (path: string) =>
  invoke<string>("read_file", { path });

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
