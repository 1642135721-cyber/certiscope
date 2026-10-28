type NumericCandidateValue = { key: string; value: unknown };

function candidateNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text) && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text))
    return null;
  const parsed = Number(text.replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Broader retrieval can include floor subtotals. When source text has an
 * explicit project total, a different LLM-only number is not a competing
 * project-total fact. Conflicting direct statements remain candidates.
 */
export function isScopedNumericCandidate(
  candidate: NumericCandidateValue,
  direct: readonly NumericCandidateValue[],
  guardProjectTotal: boolean,
): boolean {
  if (!guardProjectTotal || candidate.key !== "total_parking_spaces")
    return true;
  const directTotals = new Set(
    direct
      .filter((item) => item.key === "total_parking_spaces")
      .map((item) => candidateNumber(item.value))
      .filter((value): value is number => value !== null),
  );
  if (!directTotals.size) return true;
  const value = candidateNumber(candidate.value);
  return value !== null && directTotals.has(value);
}
