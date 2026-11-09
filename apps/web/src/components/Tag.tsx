import type { TagTone } from "../lib/format";

/** A scaffold-style status tag: colour plus words, never colour alone. */
export function Tag({ tone, children }: { tone: TagTone; children: React.ReactNode }) {
  return (
    <span className={`tag tag-${tone}`}>
      <span className="tag-hole" aria-hidden="true" />
      {children}
    </span>
  );
}
