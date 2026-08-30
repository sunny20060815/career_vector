import type { CareerEvidence } from "@/lib/evidence";
import type { ParsedCareerQuery } from "@/types/career";

export interface ChatRequest {
  question: string;
  conversationId?: string;
}

export interface ChatResponse {
  conversationId: string;
  answer: string;
  query: ParsedCareerQuery | null;
  evidence: CareerEvidence;
  noData: boolean;
}
