//! Office desktop shell: the shared web interface plus what a browser can't do —
//! silent printing (Spec §7). No business rules live here; the server owns them.

use base64::Engine;
use print_spooler::{print_batch, system, BatchReport, PrintDocument, PrinterProfile, Progress, TEST_PAGE_PDF};
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, State};

#[derive(Default)]
struct PrintState {
    stop: Arc<AtomicBool>,
}

#[derive(Deserialize)]
struct IncomingDocument {
    name: String,
    /// PDF bytes, base64-encoded.
    pdf_base64: String,
}

#[tauri::command]
fn list_printers() -> Vec<system::PrinterInfo> {
    system::list_printers()
}

#[tauri::command]
async fn print_documents(
    app: tauri::AppHandle,
    state: State<'_, PrintState>,
    profile: PrinterProfile,
    documents: Vec<IncomingDocument>,
) -> Result<BatchReport, String> {
    let docs = documents
        .into_iter()
        .map(|d| {
            base64::engine::general_purpose::STANDARD
                .decode(d.pdf_base64)
                .map(|bytes| PrintDocument { name: d.name.clone(), bytes })
                .map_err(|_| format!("\"{}\" couldn't be read", d.name))
        })
        .collect::<Result<Vec<_>, _>>()?;
    run_batch(app, &state, profile, docs).await
}

#[tauri::command]
async fn print_test_page(
    app: tauri::AppHandle,
    state: State<'_, PrintState>,
    profile: PrinterProfile,
) -> Result<BatchReport, String> {
    let doc = PrintDocument { name: "Workforce printer test".into(), bytes: TEST_PAGE_PDF.to_vec() };
    run_batch(app, &state, profile, vec![doc]).await
}

#[tauri::command]
fn cancel_printing(state: State<'_, PrintState>) {
    state.stop.store(true, Ordering::SeqCst);
}

async fn run_batch(
    app: tauri::AppHandle,
    state: &PrintState,
    profile: PrinterProfile,
    docs: Vec<PrintDocument>,
) -> Result<BatchReport, String> {
    let stop = state.stop.clone();
    stop.store(false, Ordering::SeqCst);
    // Spooling hundreds of PDFs is blocking work; keep it off the UI thread.
    tauri::async_runtime::spawn_blocking(move || {
        print_batch(
            &system::SystemBackend,
            &profile,
            &docs,
            |p: Progress| {
                let _ = app.emit("print-progress", p);
            },
            Some(&stop),
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PrintState::default())
        .invoke_handler(tauri::generate_handler![list_printers, print_documents, print_test_page, cancel_printing])
        .run(tauri::generate_context!())
        .expect("error while running Workforce");
}
