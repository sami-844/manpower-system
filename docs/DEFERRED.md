# DEFERRED

> Things deliberately not built now, with what it would take to build them later. A deferral is a decision, recorded so nobody rebuilds the argument. If an item becomes urgent, move it into a sprint through `/architect`.

| # | What | Deferred to | Why | What it would take |
|---|---|---|---|---|
| X1 | Supervisor app (offline attendance, requests, incidents, timesheet approval) | Version 2, S22–S32 | Release scope A14 | Capacitor shell, offline store and sync, phone sign-in; writes `attendance_events` with `source = 'supervisor'`, no V1 change |
| X2 | Client portal | Version 2, S26–S27 | A14 / D5 | Client realm in Cognito, client row scope (already in RLS design), portal screens C-01 |
| X3 | Worker app in workers' languages | Version 2, S28–S31 | A14 | Shared-phone sign-in, translations (ICU), payslip and leave screens W-01 |
| X4 | Native push notifications | Version 2 | No mobile app in V1 | FCM/APNs through Capacitor; V1 uses WhatsApp/email links and web push |
| X5 | Arabic interface | Phase 12 | A9 | Translation files and `rtl: true` are already in place; turn on and review every screen |
| X6 | Recruitment, camps and fleet, welfare and safety | Phase 12 (from Feb 2028) | Slot given to V2 (D12) | Tables sketched in Backend Schema "Facilities, recruitment and welfare" |
| X7 | Biometric terminals | Phase 12 | Not needed for V1 or V2 | Adapter into `attendance_events` with duplicate removal (TR-INT-10) |
| X8 | Government and bank APIs (MoL, ROP, SPF, Bank Muscat host-to-host) | Phase 12, when offered | No public APIs today | Adapters behind the existing interfaces (TR-INT-04) |
| X9 | Work-injury insurance for expatriates | When the Fund publishes rules (planned 2028) | Rules not published | New dated rule and golden cases |
| X10 | Second legal entity (e.g. UAE) | If the company expands | Oman only (A2) | Configuration: every table already carries `entity_id` (TR-PLT-07) |
