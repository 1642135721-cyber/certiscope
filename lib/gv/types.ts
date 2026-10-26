export type BusinessRole = "auditor" | "admin" | "rule_maintainer";

export type ReviewOutcome =
  | "PASS"
  | "FAIL"
  | "INSUFFICIENT_EVIDENCE"
  | "EVIDENCE_CONFLICT"
  | "UNCLEAR"
  | "NOT_APPLICABLE"
  | "NOT_COVERED"
  | "HUMAN_REVIEW_REQUIRED";

export type ExecutionStage =
  | "pending"
  | "parsing"
  | "extracting"
  | "calculating"
  | "checking_evidence"
  | "awaiting_human"
  | "failed"
  | "complete";

export type ConfirmationState = "candidate" | "confirmed" | "invalidated";
export type SemanticSupport =
  | "supports"
  | "partial"
  | "insufficient"
  | "conflicts"
  | "unknown";
export type IncentivePath = "A" | "B";
export type FacilityPath = "C" | "D";

export interface SourceLocation {
  materialVersionId: string;
  page?: number;
  image?: number;
  sheet?: string;
  cell?: string;
  region?: [number, number, number, number];
  paragraph?: number;
  note?: string;
}

export interface MaterialVersion {
  id: string;
  taskId: string;
  roundId: string;
  name: string;
  mimeType: string;
  extension: string;
  sha256: string;
  storagePath: string;
  version: number;
  convertedFrom?: string;
  createdAt: string;
}

export interface FactCandidate {
  key: string;
  value: string | number | boolean;
  unit?: string;
  scope?: string;
  source: SourceLocation;
  confidence?: number;
  state: ConfirmationState;
}

export interface RuleResult {
  ruleId: string;
  outcome: ReviewOutcome;
  explanation: string;
  inputs: Record<string, string | number | null>;
  formula?: string;
  sources: SourceLocation[];
  semanticSupport?: SemanticSupport;
  nextAction?: string;
}

export interface ReviewTask {
  id: string;
  projectId: string;
  currentAuditorId: string;
  currentRoundId: string;
  system: string;
  version: string;
  stage: string;
  incentivePath: IncentivePath | null;
  facilityPath: FacilityPath | null;
  ruleVersionId: string | null;
  archivedAt: string | null;
}

export interface ReviewRound {
  id: string;
  taskId: string;
  sequence: number;
  status: "open" | "submitted" | "returned" | "archived";
  ruleVersionId: string | null;
  selectedMaterialVersionIds: string[];
  submittedAt: string | null;
}
