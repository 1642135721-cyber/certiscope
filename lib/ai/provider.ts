import type { FactCandidate, RuleResult, SourceLocation } from "@/lib/gv/types";

export interface LocatedContent {
  text?: string;
  imageDataUrl?: string;
  pdfDataUrl?: string;
  pdfUrl?: string;
  pdfFileName?: string;
  pdfPageCount?: number;
  pdfOriginalPages?: number[];
  source: SourceLocation;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  billablePages?: number;
  durationMs: number;
}

export type AiErrorKind =
  | "CONFIGURATION"
  | "RATE_LIMIT"
  | "TEMPORARY"
  | "INVALID_RESPONSE";

export type AiResult<T> =
  | {
      ok: true;
      provider: string;
      model: string;
      requestId?: string;
      usage: AiUsage;
      value: T;
    }
  | {
      ok: false;
      provider: string;
      model: string;
      kind: AiErrorKind;
      message: string;
      retryable: boolean;
      usage?: Partial<AiUsage>;
    };

export interface EvidenceAssessment {
  support: "supports" | "partial" | "insufficient" | "conflicts" | "unknown";
  citations: SourceLocation[];
  gaps: string[];
  humanQuestions: string[];
  supportedFindings?: { text: string; citations: SourceLocation[] }[];
  unverifiedFindings?: { text: string; citations: SourceLocation[] }[];
}

export interface RuleEvidenceAssessment extends EvidenceAssessment {
  ruleCode: string;
  supportedFindings: { text: string; citations: SourceLocation[] }[];
  unverifiedFindings: { text: string; citations: SourceLocation[] }[];
}

export interface RuleGuidanceSuggestion {
  ruleCode: string;
  questionIndex: number;
  text: string;
  chunkId: string;
}

export interface R05SignageAssessment {
  visible: boolean;
  finding: string;
  citations: SourceLocation[];
}

export interface AiProvider {
  answerGvQuestion(input: {
    question: string;
    history: { question: string; answer: string }[];
    chunks: { id: string; clause: string; page: number; quote: string }[];
  }): Promise<
    AiResult<{ answer: string; chunkIds: string[]; insufficient: boolean }>
  >;
  extractCandidates(input: {
    taskId: string;
    roundId: string;
    materialVersions: string[];
    contentParts: LocatedContent[];
    requestedFields: string[];
  }): Promise<AiResult<FactCandidate[]>>;
  checkEvidence(input: {
    taskId: string;
    roundId: string;
    ruleVersion: string;
    question: string;
    ruleExcerpts: LocatedContent[];
    facts: FactCandidate[];
    evidenceParts: LocatedContent[];
  }): Promise<AiResult<EvidenceAssessment>>;
  checkRules(input: {
    taskId: string;
    roundId: string;
    ruleVersion: string;
    questions: {
      ruleCode: string;
      question: string;
      ruleSource: string;
      evidenceParts: LocatedContent[];
    }[];
  }): Promise<AiResult<RuleEvidenceAssessment[]>>;
  inspectR05Signage(input: {
    ruleVersion: string;
    visualParts: LocatedContent[];
  }): Promise<AiResult<R05SignageAssessment>>;
  explainRuleGuidance(input: {
    ruleVersion: string;
    questions: {
      ruleCode: string;
      questionIndex: number;
      question: string;
      chunks: { id: string; clause: string; page: number; quote: string }[];
    }[];
  }): Promise<AiResult<RuleGuidanceSuggestion[]>>;
  draftOpinion(input: {
    taskId: string;
    roundId: string;
    evaluatedResults: RuleResult[];
    openIssues: string[];
    confirmedFacts: FactCandidate[];
    historicalOpinions?: {
      sourceTaskId: string;
      submittedAt: string;
      englishOpinion: string;
      chineseExplanation: string;
    }[];
  }): Promise<AiResult<{ englishDraft: string; chineseExplanation: string }>>;
}
