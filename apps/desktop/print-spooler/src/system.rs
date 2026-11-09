//! The real printer spooler: winspool on Windows, CUPS on macOS/Linux.

use crate::{PrintBackend, PrintDocument, RenderMode};
use printers::common::base::job::PrinterJobOptions;
use printers::common::converters::{Converter, GhostscriptConverterOptions};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
    pub driver: String,
}

pub fn list_printers() -> Vec<PrinterInfo> {
    printers::get_printers()
        .into_iter()
        .map(|p| PrinterInfo { name: p.name.clone(), is_default: p.is_default, driver: p.driver_name.clone() })
        .collect()
}

pub struct SystemBackend;

impl PrintBackend for SystemBackend {
    fn printer_names(&self) -> Vec<String> {
        printers::get_printers().into_iter().map(|p| p.name).collect()
    }

    fn submit(&self, printer: &str, doc: &PrintDocument, mode: RenderMode) -> Result<u64, String> {
        let target = printers::get_printer_by_name(printer).ok_or_else(|| format!("Printer \"{printer}\" disappeared"))?;
        let options = PrinterJobOptions {
            name: Some(doc.name.as_str()),
            raw_properties: &[],
            converter: match mode {
                RenderMode::Direct => Converter::None,
                RenderMode::PostScript => Converter::Ghostscript(GhostscriptConverterOptions::ps2write()),
            },
        };
        target.print(&doc.bytes, options).map_err(|e| format!("{e:?}"))
    }
}
