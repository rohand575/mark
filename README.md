# Mark

A premium, minimal markdown reader & editor for macOS and Windows.

Double-click any `.md` file and it opens in Mark — rendered beautifully, directly editable (Typora-style WYSIWYG), with tabs, an outline sidebar, and dark/light themes.

Built with [Tauri 2](https://tauri.app) + React + [Milkdown Crepe](https://milkdown.dev).

## Features

- **WYSIWYG editing** — markdown renders as you type; syntax hides itself. Type `/` for a block menu.
- **File association** — installer registers Mark as a handler for `.md` / `.markdown` files. Double-clicking a file opens it in a new tab of the running window (single instance).
- **Tabs** — multiple files in one window, dirty-dot indicators, middle-click to close.
- **Outline sidebar** — generated from headings, click to scroll.
- **Dark + light themes** — follows the OS, manual toggle persists.
- **Shortcuts** — `⌘/Ctrl+S` save · `⌘/Ctrl+O` open · `⌘/Ctrl+N` new · `⌘/Ctrl+W` close tab.

## Development

Prerequisites: [Node.js 20+](https://nodejs.org) and [Rust](https://rustup.rs).

- macOS: `xcode-select --install` (one time)
- Windows: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload, plus [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (preinstalled on Windows 10/11)

```sh
npm install
npm run tauri dev      # run the app with hot reload
```

## Building installers

```sh
npm run tauri build
```

Outputs land in `src-tauri/target/release/bundle/`:

- macOS: `dmg/Mark_x.y.z_*.dmg`
- Windows: `nsis/Mark_x.y.z_*-setup.exe`

### Via GitHub Actions

Push a tag like `v0.1.0` (or run the workflow manually) and `.github/workflows/release.yml` builds macOS (Apple Silicon + Intel) and Windows installers and attaches them to a draft GitHub release.

```sh
git tag v0.1.0 && git push origin v0.1.0
```

## Notes on opening `.md` files

The installer registers the file association. The first time, right-click a `.md` file → *Open With* → **Mark** → "Always". After that, double-click just works.

Unsigned builds: on macOS, first launch requires right-click → *Open* (Gatekeeper); on Windows, click *More info → Run anyway* (SmartScreen). Code signing removes these prompts but requires developer certificates.
