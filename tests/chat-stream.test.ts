import { describe, expect, it } from "vitest";

import { decodeChatStream, encodeChatStreamEvent } from "@/lib/chat-stream";

describe("chat stream protocol", () => {
  it("keeps an incomplete SSE event buffered until the next network chunk", () => {
    const encoded = encodeChatStreamEvent({ type: "evidence", payload: { skills: ["Python"] } });
    const splitAt = Math.floor(encoded.length / 2);
    const first = decodeChatStream(encoded.slice(0, splitAt));
    const second = decodeChatStream(first.remaining + encoded.slice(splitAt));

    expect(first.events).toEqual([]);
    expect(second.remaining).toBe("");
    expect(second.events).toEqual([{ type: "evidence", payload: { skills: ["Python"] } }]);
  });
});
