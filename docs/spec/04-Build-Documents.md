# Build documents

These five documents turn the plan into something engineers and designers can build from, line by line. Each one answers a single question, and none repeats another.

| Document | Answers | Main readers | Built from |
|---|---|---|---|
| [TRD](05-TRD.md) | What must the system technically achieve, and how is each requirement proven? | Engineers, QA, the owner at G4 | PRD and Technical Spec |
| [App Flow](06-App-Flow.md) | What screens exist, who uses them, and how does each job move from start to finish? | Designers, engineers, module owners | PRD modules and roles |
| [Backend Schema](07-Backend-Schema.md) | What does the database hold, table by table, and how is it protected? | Engineers | Technical Spec data model |
| [Implementation Plan](08-Implementation-Plan.md) | Who builds what, sprint by sprint, and how is it released? | Delivery team, product lead | Delivery Phases |
| [Design Brief](09-Design-Brief.md) | How does it look and feel, built with shadcn/ui and Aceternity UI? | Designers, front-end engineers | App Flow and PRD usability rules |

**How they fit with the earlier tabs.** The [PRD](01-PRD.md) says what the business needs. The [Technical Spec](02-Technical-Spec.md) explains the architecture and why it was chosen. [Delivery Phases](03-Delivery-Phases.md) sets the business timeline and gates. The TRD turns the PRD and spec into pass/fail requirements; the Implementation Plan turns the phases into two-week sprints using the same dates.

**One rule for all of them:** when a decision changes, the document that owns it changes first, and the others link to it rather than copy it.
