use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Flags Tauri passes to WebView2 by default; they must be repeated when adding our own.
#[cfg(windows)]
const DEFAULT_WEBVIEW_FLAGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Settings {
    spellcheck_language: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpellcheckInfo {
    /// Language the spell checker is using right now.
    current: String,
    /// Languages set up on this computer, in the user's order of preference.
    system: Vec<String>,
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    settings_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// The language list from Windows Settings › Time & language (e.g. ["pt-BR", "en-US"]).
#[cfg(windows)]
fn system_languages() -> Vec<String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Control Panel\International\User Profile")
        .and_then(|k| k.get_value::<Vec<String>, _>("Languages"))
        .unwrap_or_default()
}

/// The locale list from the environment (LANGUAGE, then LANG), e.g. "pt_BR.UTF-8" becomes "pt-BR".
#[cfg(not(windows))]
fn system_languages() -> Vec<String> {
    let raw = [std::env::var("LANGUAGE").unwrap_or_default(), std::env::var("LANG").unwrap_or_default()].join(":");
    let mut out: Vec<String> = Vec::new();
    for locale in raw.split(':') {
        let tag = locale.split(['.', '@']).next().unwrap_or("").replace('_', "-");
        if is_language_tag(&tag) && tag != "C" && tag != "POSIX" && !out.contains(&tag) {
            out.push(tag);
        }
    }
    out
}

/// Only plain BCP 47 tags reach the web view's settings.
fn is_language_tag(tag: &str) -> bool {
    let mut parts = tag.split('-');
    let first_ok = parts.next().is_some_and(|p| (2..=3).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphabetic()));
    first_ok && parts.all(|p| (1..=8).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphanumeric()))
}

fn spellcheck_language(app: &AppHandle) -> String {
    load_settings(app)
        .spellcheck_language
        .filter(|l| is_language_tag(l))
        .or_else(|| system_languages().into_iter().find(|l| is_language_tag(l)))
        .unwrap_or_else(|| "en-US".into())
}

#[tauri::command]
fn spellcheck_info(app: AppHandle) -> SpellcheckInfo {
    SpellcheckInfo {
        current: spellcheck_language(&app),
        system: system_languages().into_iter().filter(|l| is_language_tag(l)).collect(),
    }
}

#[tauri::command]
fn set_spellcheck_language(app: AppHandle, language: String) -> Result<(), String> {
    if !is_language_tag(&language) {
        return Err(format!("Not a language tag: {language}"));
    }
    let path = settings_path(&app).ok_or("No settings folder")?;
    let mut settings = load_settings(&app);
    settings.spellcheck_language = Some(language);
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&path, serde_json::to_string_pretty(&settings).unwrap()).map_err(|e| e.to_string())
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    app.restart();
}

/// WebKitGTK checks spelling only when asked to, using the system's Hunspell dictionaries ("pt_BR").
#[cfg(target_os = "linux")]
fn set_linux_spellcheck(window: &tauri::WebviewWindow, language: &str) {
    let dictionary = language.replace('-', "_");
    let _ = window.with_webview(move |webview| {
        use webkit2gtk::{WebContextExt, WebViewExt};
        if let Some(context) = webview.inner().context() {
            context.set_spell_checking_enabled(true);
            context.set_spell_checking_languages(&[dictionary.as_str()]);
        }
    });
}

#[cfg(not(target_os = "linux"))]
fn set_linux_spellcheck(_window: &tauri::WebviewWindow, _language: &str) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![spellcheck_info, set_spellcheck_language, restart_app])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let language = spellcheck_language(app.handle());
            // Up to 1440×900, but never taller than the screen above the taskbar.
            let (width, height) = app
                .primary_monitor()
                .ok()
                .flatten()
                .map(|m| {
                    let area = m.work_area().size.to_logical::<f64>(m.scale_factor());
                    ((area.width * 0.92).min(1440.0), (area.height * 0.92).min(900.0))
                })
                .unwrap_or((1280.0, 800.0));
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Beldora HyperDocs")
                .inner_size(width, height)
                .min_inner_size(900.0, 600.0)
                .center()
                .disable_drag_drop_handler();
            // WebView2 spellchecks in the first accept-language only, so that is how the language is chosen.
            #[cfg(windows)]
            let builder = builder.additional_browser_args(&format!("--accept-lang={language} {DEFAULT_WEBVIEW_FLAGS}"));
            let window = builder.build()?;
            set_linux_spellcheck(&window, &language);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
