use crate::search::{self, ApiError, ConnectionStatus, SearchRequest, SearchResponse};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

struct SearchState {
    client: reqwest::Client,
    active: Mutex<Option<tokio::task::AbortHandle>>,
    sequence: AtomicU64,
}

fn require_main(window: &WebviewWindow) -> Result<(), ApiError> {
    if window.label() != "main" {
        return Err(ApiError::new(403, "FORBIDDEN", "This window cannot access the native search API."));
    }
    Ok(())
}

#[tauri::command]
async fn search(endpoint: String, request: SearchRequest, window: WebviewWindow, state: State<'_, SearchState>) -> Result<SearchResponse, ApiError> {
    require_main(&window)?;
    search::request_url(&endpoint, &request)?;
    let task = tokio::spawn(search::perform(state.client.clone(), endpoint, request));
    {
        let mut active = state.active.lock().map_err(|_| ApiError::new(500, "SEARCH_ERROR", "Please restart Sreon."))?;
        if let Some(previous) = active.replace(task.abort_handle()) { previous.abort(); }
    }
    task.await.map_err(|_| ApiError::new(499, "CANCELLED", "This search was replaced by a newer search."))?
}

#[tauri::command]
async fn connection_status(endpoint: String, window: WebviewWindow, state: State<'_, SearchState>) -> Result<ConnectionStatus, ApiError> {
    require_main(&window)?;
    Ok(search::connection(&state.client, &endpoint).await)
}

#[tauri::command]
async fn open_page(url: String, reuse: bool, window: WebviewWindow, app: AppHandle, state: State<'_, SearchState>) -> Result<(), ApiError> {
    require_main(&window)?;
    let url = search::web_url(&url).ok_or_else(|| ApiError::new(400, "INVALID_URL", "Sreon opens public HTTP or HTTPS websites only."))?;
    if reuse {
        if let Some(existing) = app.get_webview_window("page-reuse") {
            existing.navigate(url).map_err(window_error)?;
            existing.set_focus().map_err(window_error)?;
            return Ok(());
        }
    }
    if app.webview_windows().keys().filter(|label| label.starts_with("page-")).count() >= 12 {
        return Err(ApiError::new(429, "WINDOW_LIMIT", "Close a browsing window before opening another. Sreon keeps at most 12 browsing windows open."));
    }
    let label = if reuse { "page-reuse".to_string() } else { format!("page-{}", state.sequence.fetch_add(1, Ordering::Relaxed)) };
    let title = format!("{} — Sreon", url.origin().ascii_serialization());
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url))
        .title(title)
        .inner_size(1180.0, 800.0)
        .min_inner_size(480.0, 400.0)
        .incognito(true)
        .on_navigation(|url| search::web_url(url.as_str()).is_some())
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_page_load(|window, payload| {
            let _ = window.set_title(&format!("{} — Sreon", payload.url().origin().ascii_serialization()));
        })
        .build()
        .map_err(window_error)?;
    Ok(())
}

fn window_error(_: tauri::Error) -> ApiError {
    ApiError::new(500, "WINDOW_ERROR", "Could not open this browsing window. Please try again.")
}

fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let search = MenuItem::with_id(app, "focus-search", "Search", true, Some("CmdOrCtrl+L"))?;
    let back = MenuItem::with_id(app, "back", "Back", true, Some("CmdOrCtrl+["))?;
    let forward = MenuItem::with_id(app, "forward", "Forward", true, Some("CmdOrCtrl+]"))?;
    let reload = MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
    Menu::with_items(app, &[
        &Submenu::with_items(app, "Sreon", true, &[
            &PredefinedMenuItem::about(app, Some("About Sreon"), Some(AboutMetadata { name: Some("Sreon".into()), version: Some(env!("CARGO_PKG_VERSION").into()), ..Default::default() }))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ])?,
        &Submenu::with_items(app, "Edit", true, &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ])?,
        &Submenu::with_items(app, "Navigate", true, &[&search, &back, &forward, &reload])?,
        &Submenu::with_items(app, "Window", true, &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ])?,
    ])
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(SearchState { client: search::client()?, active: Mutex::new(None), sequence: AtomicU64::new(1) });
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Sreon")
                .inner_size(1120.0, 780.0)
                .min_inner_size(420.0, 560.0)
                .on_navigation(|url| url.scheme() == "tauri" || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost")))
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .menu(menu)
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "focus-search" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.emit("sreon:focus-search", ());
                }
                return;
            }
            if let Some(window) = app.webview_windows().into_values().find(|window| window.is_focused().unwrap_or(false)) {
                match event.id().as_ref() {
                    "back" => { let _ = window.eval("history.back()"); }
                    "forward" => { let _ = window.eval("history.forward()"); }
                    "reload" => { let _ = window.reload(); }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![search, connection_status, open_page])
        .run(tauri::generate_context!())
        .expect("Could not start Sreon");
}
