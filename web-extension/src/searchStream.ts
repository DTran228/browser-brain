import type { SearchEvent } from "./types.ts";

// Fetch chunks are byte transport boundaries, so a line or Unicode character can span chunks.
export async function* searchEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SearchEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let pending = "";
    let completed = false;
    try {
        while (true) {
            const { value, done } = await reader.read();
            pending += decoder.decode(value, { stream: !done });
            let lineEnd = pending.indexOf("\n");
            while (lineEnd >= 0) {
                const line = pending.slice(0, lineEnd);
                pending = pending.slice(lineEnd + 1);
                if (line.trim()) {
                    const event: SearchEvent = JSON.parse(line);
                    if (event.type === "done") completed = true;
                    yield event;
                }
                lineEnd = pending.indexOf("\n");
            }
            if (done) break;
        }
        if (pending.trim() || !completed) throw new Error("Search response was interrupted.");
    } finally {
        reader.releaseLock();
    }
}
