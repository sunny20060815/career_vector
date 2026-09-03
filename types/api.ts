import type { CareerEvidence } from "@/lib/evidence";
import type { EvidencePreview } from "@/lib/career-presentation";
import type { ParsedCareerQuery, UserAudience } from "@/types/career";

export interface ChatRequest {
  question: string;
  conversationId?: string;
  audience?: UserAudience;
}

export interface ChatResponse {
  conversationId: string;
  answer: string;
  suggestedQuestions: string[];
  query: ParsedCareerQuery | null;
  evidence: CareerEvidence;
  noData: boolean;
  audience?: UserAudience;
}

export interface ChatProgress {
  stage: "understanding" | "searching" | "writing" | "fallback";
  message: string;
}

export interface ChatEvidenceEvent {
  preview: EvidencePreview;
}
