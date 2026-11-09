import { describe, expect, it } from "vitest";
import {
  checkEligibility,
  documentLabel,
  DOCUMENT_TYPES,
  DEFAULT_COMPLIANCE_RULES,
  type EligibilityInput,
  type WorkerDocument,
} from "./compliance";

// PRD 4.3 — "A worker with an expired mandatory document cannot be rostered,
// cannot clock in, and is flagged in payroll; overrides need a named approver
// and reason, and are logged."

const validDocs = (expiry = "2027-12-31"): WorkerDocument[] => [
  { type: "passport", expiryDate: expiry, verified: true },
  { type: "residence_visa", expiryDate: expiry, verified: true },
  { type: "labour_card", expiryDate: expiry, verified: true },
  { type: "medical", expiryDate: expiry, verified: true },
];

const base = (over: Partial<EligibilityInput> = {}): EligibilityInput => ({
  worker: { id: "W-000001", status: "available" },
  documents: validDocs(),
  period: { from: "2026-11-01", to: "2026-11-30" },
  today: "2026-10-14",
  ...over,
});

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("checkEligibility", () => {
  it("allows a worker with all mandatory documents valid for the whole period", () => {
    const result = checkEligibility(base());
    expect(result.eligible).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("blocks when a mandatory document is missing", () => {
    const docs = validDocs().filter((d) => d.type !== "labour_card");
    const result = checkEligibility(base({ documents: docs }));
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "MISSING_DOCUMENT", documentType: "labour_card" }),
    );
  });

  it("blocks when a mandatory document has already expired before the period starts", () => {
    const docs = validDocs().map((d) =>
      d.type === "residence_visa" ? { ...d, expiryDate: "2026-10-31" } : d,
    );
    const result = checkEligibility(base({ documents: docs }));
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "DOCUMENT_EXPIRED", documentType: "residence_visa" }),
    );
  });

  it("blocks when a document expires part-way through the period", () => {
    const docs = validDocs().map((d) =>
      d.type === "medical" ? { ...d, expiryDate: "2026-11-15" } : d,
    );
    const result = checkEligibility(base({ documents: docs }));
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "DOCUMENT_EXPIRES_DURING_PERIOD", documentType: "medical" }),
    );
  });

  it("treats the expiry date itself as the last valid day", () => {
    const result = checkEligibility(base({ documents: validDocs("2026-11-30") }));
    expect(result.blockers).toEqual([]);
  });

  it("blocks when a document has no expiry date recorded", () => {
    const docs = validDocs().map((d) => (d.type === "passport" ? { ...d, expiryDate: null } : d));
    const result = checkEligibility(base({ documents: docs }));
    expect(codes(result.blockers)).toContain("EXPIRY_DATE_MISSING");
  });

  it("warns, but does not block, when a document expires within 30 days after the period", () => {
    const docs = validDocs().map((d) =>
      d.type === "passport" ? { ...d, expiryDate: "2026-12-20" } : d,
    );
    const result = checkEligibility(base({ documents: docs }));
    expect(result.eligible).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "DOCUMENT_EXPIRING_SOON", documentType: "passport" }),
    );
  });

  it("does not warn when expiry is more than 30 days after the period", () => {
    const docs = validDocs().map((d) =>
      d.type === "passport" ? { ...d, expiryDate: "2026-12-31" } : d,
    );
    expect(checkEligibility(base({ documents: docs })).warnings).toEqual([]);
  });

  it("warns when a document is not yet verified by HR", () => {
    const docs = validDocs().map((d) => (d.type === "medical" ? { ...d, verified: false } : d));
    const result = checkEligibility(base({ documents: docs }));
    expect(result.eligible).toBe(true);
    expect(codes(result.warnings)).toContain("DOCUMENT_UNVERIFIED");
  });

  it("uses the latest document when a type has been renewed", () => {
    const docs = [
      ...validDocs(),
      { type: "residence_visa" as const, expiryDate: "2026-01-01", verified: true },
    ];
    expect(checkEligibility(base({ documents: docs })).eligible).toBe(true);
  });

  it("applies extra documents required by the site", () => {
    const result = checkEligibility(
      base({ site: { id: "S-1", requiredDocuments: ["driving_licence"] } }),
    );
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: "MISSING_DOCUMENT", documentType: "driving_licence" }),
    );
  });

  it.each(["exited", "absconding_reported", "in_recruitment"] as const)(
    "blocks a worker whose status is %s",
    (status) => {
      const result = checkEligibility(base({ worker: { id: "W-1", status } }));
      expect(codes(result.blockers)).toContain("WORKER_NOT_ACTIVE");
    },
  );

  it("blocks when approved leave overlaps the period", () => {
    const result = checkEligibility(
      base({ leave: [{ from: "2026-11-20", to: "2026-12-05" }] }),
    );
    expect(codes(result.blockers)).toContain("LEAVE_OVERLAP");
  });

  it("ignores leave outside the period", () => {
    const result = checkEligibility(base({ leave: [{ from: "2026-12-01", to: "2026-12-05" }] }));
    expect(result.eligible).toBe(true);
  });

  it("rejects a period that ends before it starts", () => {
    expect(() =>
      checkEligibility(base({ period: { from: "2026-11-30", to: "2026-11-01" } })),
    ).toThrow(/period/i);
  });

  describe("overrides", () => {
    const expiredVisa = validDocs().map((d) =>
      d.type === "residence_visa" ? { ...d, expiryDate: "2026-10-31" } : d,
    );

    it("turns a matching blocker into a warning that names the approver", () => {
      const result = checkEligibility(
        base({
          documents: expiredVisa,
          overrides: [
            {
              code: "DOCUMENT_EXPIRED",
              documentType: "residence_visa",
              validUntil: "2026-11-30",
              approvedBy: "ops.manager",
              reason: "Renewal submitted, receipt on file",
            },
          ],
        }),
      );
      expect(result.eligible).toBe(true);
      expect(result.blockers).toEqual([]);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: "OVERRIDDEN", overriddenCode: "DOCUMENT_EXPIRED", approvedBy: "ops.manager" }),
      );
    });

    it("does not apply an override that ends before the period ends", () => {
      const result = checkEligibility(
        base({
          documents: expiredVisa,
          overrides: [
            {
              code: "DOCUMENT_EXPIRED",
              documentType: "residence_visa",
              validUntil: "2026-11-10",
              approvedBy: "ops.manager",
              reason: "Short extension",
            },
          ],
        }),
      );
      expect(result.eligible).toBe(false);
    });

    it("does not apply an override for a different document", () => {
      const result = checkEligibility(
        base({
          documents: expiredVisa,
          overrides: [
            {
              code: "DOCUMENT_EXPIRED",
              documentType: "passport",
              validUntil: "2026-12-31",
              approvedBy: "ops.manager",
              reason: "Wrong document",
            },
          ],
        }),
      );
      expect(result.eligible).toBe(false);
    });

    it("refuses an override without an approver or reason", () => {
      expect(() =>
        checkEligibility(
          base({
            documents: expiredVisa,
            overrides: [
              { code: "DOCUMENT_EXPIRED", documentType: "residence_visa", validUntil: "2026-12-31", approvedBy: "", reason: "" },
            ],
          }),
        ),
      ).toThrow(/approver/i);
    });

    it("never overrides an inactive worker status", () => {
      const result = checkEligibility(
        base({
          worker: { id: "W-1", status: "exited" },
          overrides: [
            { code: "WORKER_NOT_ACTIVE", validUntil: "2027-01-01", approvedBy: "gm", reason: "test" },
          ],
        }),
      );
      expect(result.eligible).toBe(false);
    });
  });

  it("uses configurable mandatory documents and warning window", () => {
    const result = checkEligibility({
      ...base({ documents: validDocs().filter((d) => d.type !== "medical") }),
      rules: { ...DEFAULT_COMPLIANCE_RULES, mandatoryDocuments: ["passport"], expiringSoonDays: 60 },
    });
    expect(result.blockers).toEqual([]);
  });
});

describe("checkEligibility — edge cases found by mutation testing", () => {
  it("uses the renewed document even when it is entered after the old one", () => {
    const docs = [
      ...validDocs().filter((d) => d.type !== "residence_visa"),
      { type: "residence_visa" as const, expiryDate: "2026-10-20", verified: true },
      { type: "residence_visa" as const, expiryDate: "2028-10-20", verified: true },
    ];
    expect(checkEligibility(base({ documents: docs })).eligible).toBe(true);
  });

  it("prefers a dated document over an undated duplicate in either order", () => {
    const dated = { type: "medical" as const, expiryDate: "2027-12-31", verified: true };
    const undated = { type: "medical" as const, expiryDate: null, verified: true };
    const others = validDocs().filter((d) => d.type !== "medical");
    expect(checkEligibility(base({ documents: [...others, undated, dated] })).eligible).toBe(true);
    expect(checkEligibility(base({ documents: [...others, dated, undated] })).eligible).toBe(true);
  });

  it("treats a document expiring on the first day of the period as expiring during it", () => {
    const docs = validDocs().map((d) => (d.type === "passport" ? { ...d, expiryDate: "2026-11-01" } : d));
    expect(codes(checkEligibility(base({ documents: docs })).blockers)).toEqual(["DOCUMENT_EXPIRES_DURING_PERIOD"]);
  });

  it("warns when expiry falls exactly on the last day of the warning window", () => {
    const docs = validDocs().map((d) => (d.type === "passport" ? { ...d, expiryDate: "2026-12-30" } : d));
    expect(codes(checkEligibility(base({ documents: docs })).warnings)).toEqual(["DOCUMENT_EXPIRING_SOON"]);
  });

  it("accepts a single-day period", () => {
    expect(checkEligibility(base({ period: { from: "2026-11-05", to: "2026-11-05" } })).eligible).toBe(true);
  });

  it.each([
    [{ from: "2026-11-31", to: "2026-12-05" }],
    [{ from: "2026-11-01", to: "2026-13-01" }],
  ])("rejects an invalid calendar date in the period %o", (period) => {
    expect(() => checkEligibility(base({ period }))).toThrow(/period/i);
  });

  it.each([
    ["", "Renewal submitted"],
    ["ops.manager", "   "],
    ["   ", "Renewal submitted"],
  ])("refuses an override with approver %j and reason %j", (approvedBy, reason) => {
    expect(() =>
      checkEligibility(
        base({ overrides: [{ code: "DOCUMENT_EXPIRED", validUntil: "2026-12-31", approvedBy, reason }] }),
      ),
    ).toThrow(/approver/i);
  });

  it("does not apply an override for a different blocker on the same document", () => {
    const docs = validDocs().map((d) => (d.type === "medical" ? { ...d, expiryDate: "2026-11-15" } : d));
    const result = checkEligibility(
      base({
        documents: docs,
        overrides: [
          { code: "DOCUMENT_EXPIRED", documentType: "medical", validUntil: "2026-12-31", approvedBy: "hr", reason: "x" },
        ],
      }),
    );
    expect(result.eligible).toBe(false);
  });

  it.each(["available", "deployed", "on_leave"] as const)("treats status %s as active", (status) => {
    expect(checkEligibility(base({ worker: { id: "W-1", status } })).eligible).toBe(true);
  });

  it("explains each issue in words HR can act on", () => {
    const docs = [
      { type: "passport" as const, expiryDate: "2026-10-31", verified: true },
      { type: "residence_visa" as const, expiryDate: "2026-11-15", verified: true },
      { type: "medical" as const, expiryDate: null, verified: true },
      { type: "labour_card" as const, expiryDate: "2026-12-20", verified: false },
    ];
    const r = checkEligibility(
      base({
        worker: { id: "W-1", status: "exited" },
        documents: docs,
        site: { id: "S-1", requiredDocuments: ["driving_licence"] },
        leave: [{ from: "2026-11-10", to: "2026-11-12" }],
      }),
    );
    const text = [...r.blockers, ...r.warnings].map((i) => i.message);
    expect(text).toEqual(
      expect.arrayContaining([
        'Worker status is "exited"',
        "Passport expired on 2026-10-31",
        "Residence visa expires on 2026-11-15, before the period ends",
        "Medical fitness has no expiry date recorded",
        "Driving licence is missing",
        "Labour card expires on 2026-12-20 (20 days after the period)",
        "Labour card not yet verified by HR",
        "Approved leave 2026-11-10 → 2026-11-12 overlaps the period",
      ]),
    );
  });

  it("records the override in the warning message", () => {
    const docs = validDocs().map((d) => (d.type === "passport" ? { ...d, expiryDate: "2026-10-31" } : d));
    const r = checkEligibility(
      base({
        documents: docs,
        overrides: [
          { code: "DOCUMENT_EXPIRED", documentType: "passport", validUntil: "2026-11-30", approvedBy: "gm", reason: "Renewal at embassy" },
        ],
      }),
    );
    expect(r.warnings[0]?.message).toBe(
      "Passport expired on 2026-10-31 — overridden by gm until 2026-11-30: Renewal at embassy",
    );
  });
});

describe("documentLabel", () => {
  it("names every document type for display", () => {
    expect(DOCUMENT_TYPES.map(documentLabel)).toEqual([
      "Passport",
      "Residence visa",
      "Labour card",
      "Civil ID",
      "Medical fitness",
      "Driving licence",
      "Trade certificate",
      "Insurance",
    ]);
  });
});
