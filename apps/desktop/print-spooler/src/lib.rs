//! Silent batch printing for the office desktop app (Spec §7, "Desktop app").
//!
//! The batch logic is independent of the operating system so it can be tested
//! anywhere; `SystemBackend` sends jobs to the real Windows spooler (or CUPS).

pub use batch::*;

mod batch;
pub mod system;

#[cfg(test)]
mod tests;
