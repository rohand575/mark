use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Files the OS asked us to open before the frontend was ready to listen.
struct PendingFiles(Mutex<Vec<String>>);

/// Filter CLI args down to real, existing file paths (skips flags & binary name).
fn collect_file_paths(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .filter(|a| std::path::Path::new(a).is_file())
        .cloned()
        .collect()
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Drained once by the frontend on startup.
#[tauri::command]
fn get_pending_files(state: tauri::State<'_, PendingFiles>) -> Vec<String> {
    state.0.lock().unwrap().drain(..).collect()
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

pub fn run() {
    let builder = tauri::Builder::default()
        // Must be registered first: routes double-clicked files from a second
        // launch (Windows/Linux) into the already-running instance.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            focus_main_window(app);
            for path in collect_file_paths(&argv) {
                let _ = app.emit("open-file", path);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFiles(Mutex::new(Vec::new())))
        .invoke_handler(tauri::generate_handler![
            read_file,
            save_file,
            get_pending_files
        ])
        .setup(|app| {
            // Files passed on the command line at first launch (Windows/Linux).
            let args: Vec<String> = std::env::args().collect();
            let paths = collect_file_paths(&args);
            if !paths.is_empty() {
                app.state::<PendingFiles>().0.lock().unwrap().extend(paths);
            }

            // Frameless look on Windows; macOS uses the overlay titlebar.
            #[cfg(target_os = "windows")]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_decorations(false);
            }

            Ok(())
        });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building Mark");

    app.run(|app_handle, event| {
        // macOS delivers double-clicked files as an "Opened" run event.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            let paths: Vec<String> = urls
                .into_iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            // Store for a cold start (frontend will drain) AND emit for a
            // running instance. The frontend dedupes by path.
            app_handle
                .state::<PendingFiles>()
                .0
                .lock()
                .unwrap()
                .extend(paths.clone());
            for path in paths {
                let _ = app_handle.emit("open-file", path);
            }
            focus_main_window(app_handle);
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (app_handle, event);
        }
    });
}
