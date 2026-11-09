use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};

/// How a PDF reaches the printer. Most office lasers accept PDF directly; older
/// models need it rendered to PostScript first (Ghostscript on the PC).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RenderMode {
    Direct,
    PostScript,
}

/// The printer saved for one kind of job on this PC (e.g. "payslips" → "Office HP").
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrinterProfile {
    pub printer: String,
    pub mode: RenderMode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrintDocument {
    pub name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Progress {
    pub done: usize,
    pub total: usize,
    pub current: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct BatchReport {
    /// (document, spooler job id)
    pub submitted: Vec<(String, u64)>,
    /// (document, reason)
    pub failed: Vec<(String, String)>,
    pub cancelled: bool,
    pub not_started: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", content = "detail")]
pub enum BatchError {
    PrinterNotFound(String),
    EmptyBatch,
    NotPdf(String),
}

impl std::fmt::Display for BatchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BatchError::PrinterNotFound(p) => write!(f, "Printer \"{p}\" isn't connected to this PC"),
            BatchError::EmptyBatch => write!(f, "There is nothing to print"),
            BatchError::NotPdf(n) => write!(f, "\"{n}\" isn't a PDF, so nothing was printed"),
        }
    }
}

impl std::error::Error for BatchError {}

/// Where jobs go. The real one is `system::SystemBackend`.
pub trait PrintBackend {
    fn printer_names(&self) -> Vec<String>;
    fn submit(&self, printer: &str, doc: &PrintDocument, mode: RenderMode) -> Result<u64, String>;
}

pub const TEST_PAGE_PDF: &[u8] = include_bytes!("../assets/test-page.pdf");

/// Print a batch with no dialogs. Checks everything first so a batch is never half
/// printed because of a bad file or missing printer; then keeps going past single
/// failures and reports them, so 700 payslips don't stop on one jam.
pub fn print_batch(
    backend: &dyn PrintBackend,
    profile: &PrinterProfile,
    docs: &[PrintDocument],
    mut on_progress: impl FnMut(Progress),
    stop: Option<&AtomicBool>,
) -> Result<BatchReport, BatchError> {
    if docs.is_empty() {
        return Err(BatchError::EmptyBatch);
    }
    if !backend.printer_names().iter().any(|n| n == &profile.printer) {
        return Err(BatchError::PrinterNotFound(profile.printer.clone()));
    }
    if let Some(bad) = docs.iter().find(|d| !d.bytes.starts_with(b"%PDF-")) {
        return Err(BatchError::NotPdf(bad.name.clone()));
    }

    let mut report = BatchReport::default();
    for (i, doc) in docs.iter().enumerate() {
        if stop.is_some_and(|s| s.load(Ordering::SeqCst)) {
            report.cancelled = true;
            report.not_started = docs.len() - i;
            break;
        }
        match backend.submit(&profile.printer, doc, profile.mode) {
            Ok(job) => report.submitted.push((doc.name.clone(), job)),
            Err(reason) => report.failed.push((doc.name.clone(), reason)),
        }
        on_progress(Progress { done: i + 1, total: docs.len(), current: doc.name.clone() });
    }
    Ok(report)
}
