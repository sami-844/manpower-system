/**
 * Fictional data for development and demos. Never put real worker data here (CLAUDE.md).
 * Deterministic: the same seed always produces the same people.
 */
import { addDays } from "@mms/core";
import { omanClock } from "../common/clock";
import { createDatabase } from "./client";
import { sites, workerDocuments, workers } from "./schema";

let state = 20261014;
const rand = () => {
  state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
  return state / 2_147_483_648;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const FIRST = ["Rahim", "Karim", "Suresh", "Anil", "Bikash", "Imran", "Ravi", "Hasan", "Joseph", "Manoj", "Sabbir", "Arjun", "Faisal", "Ramesh", "Dipak", "Nasir", "Vinod", "Shakil", "Pradeep", "Asif"];
const LAST = ["Uddin", "Hossain", "Kumar", "Thapa", "Khan", "Rana", "Pillai", "Mia", "Nair", "Gurung", "Ahmed", "Islam", "Singh", "Shrestha", "Rahman", "Menon", "Ali", "Das", "Tamang", "Iqbal"];
const COUNTRIES = ["Bangladesh", "India", "Nepal", "Pakistan"];
const TRADES = ["General labourer", "Mason", "Carpenter", "Steel fixer", "Electrician", "Plumber", "Scaffolder", "Welder", "Equipment operator", "Driver"];

async function seed() {
  const url = process.env.DATABASE_URL ?? "postgres://mms:mms@localhost:5432/mms_dev";
  if (url.includes("prod")) throw new Error("Refusing to seed a production database");
  const db = createDatabase(url);
  const today = omanClock.today();
  const count = Number(process.env.SEED_WORKERS ?? 120);

  await db.orm.insert(sites).values([
    { code: "SOH-PORT", name: "Sohar Port Phase 3", clientName: "Gulf Build LLC", requiredDocuments: [] },
    { code: "MCT-TWR", name: "Muscat Tower Block B", clientName: "Al Noor Contracting", requiredDocuments: ["trade_certificate"] },
    { code: "SOH-IND", name: "Sohar Industrial Yard", clientName: "Batinah Steel", requiredDocuments: ["driving_licence"] },
  ]).onConflictDoNothing();

  for (let i = 0; i < count; i++) {
    const [w] = await db.orm
      .insert(workers)
      .values({
        fullName: `${pick(FIRST)} ${pick(LAST)}`,
        nationality: pick(COUNTRIES),
        trade: pick(TRADES),
        // Roughly a healthy labour-supply mix: ~86% deployed, ~8% on the bench, ~6% on leave.
        status: rand() < 0.86 ? "deployed" : rand() < 0.6 ? "available" : "on_leave",
        phone: `+968 9${int(1000000, 9999999)}`,
        joinedOn: addDays(today, -int(30, 2000)),
      })
      .returning();

    // Most workers are in order; some are expiring, a few expired or missing papers.
    const roll = rand();
    const baseExpiry = (offset: number) => addDays(today, offset + int(0, 400));
    const docs: (typeof workerDocuments.$inferInsert)[] = [
      { workerId: w!.id, type: "passport", number: `P${int(1000000, 9999999)}`, expiryDate: baseExpiry(500), verified: true },
      { workerId: w!.id, type: "residence_visa", number: `RV${int(100000, 999999)}`, expiryDate: roll < 0.12 ? addDays(today, int(1, 85)) : roll < 0.17 ? addDays(today, -int(1, 40)) : baseExpiry(120), verified: true },
      { workerId: w!.id, type: "labour_card", number: `LC${int(100000, 999999)}`, expiryDate: roll > 0.9 ? addDays(today, int(1, 60)) : baseExpiry(150), verified: rand() > 0.05 },
    ];
    if (roll > 0.04) docs.push({ workerId: w!.id, type: "medical", expiryDate: baseExpiry(60), verified: true });
    await db.orm.insert(workerDocuments).values(docs);
  }

  console.log(`Seeded ${count} fictional workers and 3 sites`);
  await db.sql.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
