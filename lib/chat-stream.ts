export type ChatStreamEvent =
  | { type: "status"; payload: { stage: "understanding" | "searching" | "writing" | "fallback"; message: string } }
  | { type: "evidence"; payload: Record<string, unknown> }
  | { type: "complete"; payload: Record<string, unknown> }
  | { type: "error"; payload: { message: string } };

export function encodeChatStreamEvent(event: ChatStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
}

export function decodeChatStream(buffer: string): { events: ChatStreamEvent[]; remaining: string } {
  const chunks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const remaining = chunks.pop() ?? "";
  const events = chunks.flatMap((chunk) => {
    const type = chunk.match(/^event:\s*(\w+)$/m)?.[1];
    const data = chunk.match(/^data:\s*(.+)$/m)?.[1];
    if (!type || !data || !["status", "evidence", "complete", "error"].includes(type)) return [];
    try {
      return [{ type, payload: JSON.parse(data) as Record<string, unknown> } as ChatStreamEvent];
    } catch {
      return [];
    }
  });
  return { events, remaining };
}
