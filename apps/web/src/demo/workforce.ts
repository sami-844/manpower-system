/**
 * DEMO DATA — the bridge from the REAL worker list (`GET /api/workers`) to the sample modules.
 * Deterministic per worker code: a deployed worker is always on the same site, earns the same
 * basic wage, and so on, across every screen and reload.
 */
import { useQuery } from "@tanstack/react-query";
import { api, type WorkerListItem } from "@/lib/api";
import { hash, money, rng } from "./core";
import { SITES, TRADES, type Site, type Trade } from "./reference";

export const WORKFORCE_QUERY_KEY = ["workers", "all"] as const;

/** Every worker with their compliance summary (≈700 rows, fetched in pages of 500, the API's cap). */
export function useWorkforce() {
  return useQuery({
    queryKey: WORKFORCE_QUERY_KEY,
    queryFn: async () => {
      const items: WorkerListItem[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await api.get<{ total: number; items: WorkerListItem[] }>(`/api/workers?limit=500&offset=${offset}`);
        items.push(...page.items);
        if (items.length >= page.total || page.items.length === 0) return items;
      }
    },
    staleTime: 60_000,
  });
}

/** Sites that have crews (the first six; the last two are newer, lightly staffed). */
const STAFFED: Site[] = SITES.slice(0, 6);

/** Where a deployed worker is assigned. null when not deployed. */
export function siteOf(w: Pick<WorkerListItem, "code" | "status">): Site | null {
  if (w.status !== "deployed") return null;
  const h = hash(w.code);
  // Weighted: big sites get more people.
  const weights = [30, 22, 16, 12, 12, 8];
  let n = h % weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    n -= weights[i]!;
    if (n < 0) return STAFFED[i]!;
  }
  return STAFFED[0]!;
}

/** Monthly basic wage by trade, OMR string, with a small per-worker variation. */
const BASIC: Record<Trade, [string, string]> = {
  "General labourer": ["95.000", "120.000"],
  Mason: ["140.000", "180.000"],
  Carpenter: ["140.000", "175.000"],
  "Steel fixer": ["145.000", "185.000"],
  Electrician: ["170.000", "230.000"],
  Plumber: ["160.000", "210.000"],
  Scaffolder: ["130.000", "165.000"],
  Welder: ["175.000", "240.000"],
  "Equipment operator": ["210.000", "290.000"],
  Driver: ["150.000", "190.000"],
};

export function basicWage(w: Pick<WorkerListItem, "code" | "trade">): string {
  const trade = (TRADES as readonly string[]).includes(w.trade) ? (w.trade as Trade) : "General labourer";
  const [lo, hi] = BASIC[trade];
  // Whole 5-rial steps, as wages are usually agreed.
  return money.between(rng(`wage:${w.code}`), lo, hi, "5.000");
}

/** Days a non-deployed, available worker has been on the bench. */
export function daysIdle(w: Pick<WorkerListItem, "code">): number {
  return 1 + (hash(`bench:${w.code}`) % 45);
}
