import type { GvRuleCode } from "./rule-catalog";
import type { NumericField } from "./rule-engine";

const affectedRules: Record<NumericField, GvRuleCode[]> = {
  total_parking_spaces: ["R01", "R03", "R04", "R05", "R06", "R07"],
  preferred_spaces: ["R03"],
  evse_spaces: ["R05", "R06"],
  normal_rate: ["R04"],
  green_rate: ["R04"],
  daily_service_capacity: ["R07"],
};

export function decisionNeedsReconfirmation(
  code: GvRuleCode,
  decisionAt: string,
  confirmations: { field_key: string; created_at: string }[],
): boolean {
  return confirmations.some((item) =>
    affectedRules[item.field_key as NumericField]?.includes(code) &&
    Date.parse(item.created_at) > Date.parse(decisionAt),
  );
}
