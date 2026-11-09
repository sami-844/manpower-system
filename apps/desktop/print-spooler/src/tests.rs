use super::*;
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};

const PDF: &[u8] = b"%PDF-1.4\n%fake test pdf\n";

/// Records what would have gone to the printer.
struct FakeBackend {
    printers: Vec<String>,
    fail_on: Vec<String>,
    submitted: RefCell<Vec<(String, String, RenderMode)>>,
}

impl FakeBackend {
    fn with_printers(names: &[&str]) -> Self {
        Self {
            printers: names.iter().map(|s| s.to_string()).collect(),
            fail_on: vec![],
            submitted: RefCell::new(vec![]),
        }
    }
}

impl PrintBackend for FakeBackend {
    fn printer_names(&self) -> Vec<String> {
        self.printers.clone()
    }
    fn submit(&self, printer: &str, doc: &PrintDocument, mode: RenderMode) -> Result<u64, String> {
        if self.fail_on.contains(&doc.name) {
            return Err("paper jam".into());
        }
        let mut s = self.submitted.borrow_mut();
        s.push((printer.to_string(), doc.name.clone(), mode));
        Ok(s.len() as u64)
    }
}

fn docs(n: usize) -> Vec<PrintDocument> {
    (1..=n)
        .map(|i| PrintDocument { name: format!("payslip-{i:03}.pdf"), bytes: PDF.to_vec() })
        .collect()
}

fn profile(printer: &str) -> PrinterProfile {
    PrinterProfile { printer: printer.into(), mode: RenderMode::Direct }
}

#[test]
fn prints_every_document_to_the_named_printer_in_order() {
    let backend = FakeBackend::with_printers(&["Office HP", "Card printer"]);
    let report = print_batch(&backend, &profile("Office HP"), &docs(3), |_| {}, None).unwrap();
    assert_eq!(report.submitted.len(), 3);
    assert!(report.failed.is_empty());
    assert!(!report.cancelled);
    let names: Vec<_> = backend.submitted.borrow().iter().map(|(p, n, _)| format!("{p}:{n}")).collect();
    assert_eq!(names, ["Office HP:payslip-001.pdf", "Office HP:payslip-002.pdf", "Office HP:payslip-003.pdf"]);
}

#[test]
fn refuses_an_unknown_printer_before_printing_anything() {
    let backend = FakeBackend::with_printers(&["Office HP"]);
    let err = print_batch(&backend, &profile("Missing printer"), &docs(2), |_| {}, None).unwrap_err();
    assert_eq!(err, BatchError::PrinterNotFound("Missing printer".into()));
    assert!(backend.submitted.borrow().is_empty());
}

#[test]
fn refuses_an_empty_batch() {
    let backend = FakeBackend::with_printers(&["Office HP"]);
    assert_eq!(print_batch(&backend, &profile("Office HP"), &[], |_| {}, None).unwrap_err(), BatchError::EmptyBatch);
}

#[test]
fn checks_every_file_is_a_pdf_before_printing_any() {
    let backend = FakeBackend::with_printers(&["Office HP"]);
    let mut batch = docs(3);
    batch[2] = PrintDocument { name: "notes.txt".into(), bytes: b"hello".to_vec() };
    let err = print_batch(&backend, &profile("Office HP"), &batch, |_| {}, None).unwrap_err();
    assert_eq!(err, BatchError::NotPdf("notes.txt".into()));
    assert!(backend.submitted.borrow().is_empty(), "no half-printed batches");
}

#[test]
fn keeps_going_after_one_document_fails_and_reports_it() {
    let mut backend = FakeBackend::with_printers(&["Office HP"]);
    backend.fail_on = vec!["payslip-002.pdf".into()];
    let report = print_batch(&backend, &profile("Office HP"), &docs(3), |_| {}, None).unwrap();
    assert_eq!(report.submitted.len(), 2);
    assert_eq!(report.failed, vec![("payslip-002.pdf".to_string(), "paper jam".to_string())]);
}

#[test]
fn reports_progress_after_each_document() {
    let backend = FakeBackend::with_printers(&["Office HP"]);
    let mut seen = vec![];
    print_batch(&backend, &profile("Office HP"), &docs(3), |p| seen.push((p.done, p.total, p.current.clone())), None).unwrap();
    assert_eq!(
        seen,
        vec![
            (1, 3, "payslip-001.pdf".to_string()),
            (2, 3, "payslip-002.pdf".to_string()),
            (3, 3, "payslip-003.pdf".to_string())
        ]
    );
}

#[test]
fn stops_when_cancelled_and_says_so() {
    let backend = FakeBackend::with_printers(&["Office HP"]);
    let stop = AtomicBool::new(false);
    let report = print_batch(
        &backend,
        &profile("Office HP"),
        &docs(5),
        |p| {
            if p.done == 2 {
                stop.store(true, Ordering::SeqCst);
            }
        },
        Some(&stop),
    )
    .unwrap();
    assert_eq!(report.submitted.len(), 2);
    assert!(report.cancelled);
    assert_eq!(report.not_started, 3);
}

#[test]
fn uses_the_profile_render_mode() {
    let backend = FakeBackend::with_printers(&["Old laser"]);
    let p = PrinterProfile { printer: "Old laser".into(), mode: RenderMode::PostScript };
    print_batch(&backend, &p, &docs(1), |_| {}, None).unwrap();
    assert_eq!(backend.submitted.borrow()[0].2, RenderMode::PostScript);
}

#[test]
fn printer_names_match_exactly() {
    let backend = FakeBackend::with_printers(&["Office HP"]);
    assert!(print_batch(&backend, &profile("office hp"), &docs(1), |_| {}, None).is_err());
}

#[test]
fn ships_a_valid_test_page() {
    assert!(TEST_PAGE_PDF.starts_with(b"%PDF-"));
    assert!(TEST_PAGE_PDF.ends_with(b"%%EOF\n"));
}
