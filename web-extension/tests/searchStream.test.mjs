import assert from "node:assert/strict";
import test from "node:test";
import { searchEvents } from "../src/searchStream.ts";

function byteStream(text) {
    const data = new TextEncoder().encode(text);
    return new ReadableStream({
        start(controller) {
            for (const byte of data) controller.enqueue(Uint8Array.of(byte));
            controller.close();
        },
    });
}

test("parses NDJSON across arbitrary network and UTF-8 boundaries", async () => {
    const expected = [{ type: "sources", sources: [] }, { type: "answer", text: "Hải đăng 🚲" }, { type: "done" }];
    const actual = await Array.fromAsync(searchEvents(byteStream(expected.map(JSON.stringify).join("\n") + "\n")));
    assert.deepEqual(actual, expected);
});

test("interruptions surface after already received sources", async () => {
    const stream = searchEvents(byteStream('{"type":"sources","sources":[]}\n{"type":"ans'));
    assert.deepEqual((await stream.next()).value, { type: "sources", sources: [] });
    await assert.rejects(stream.next(), /interrupted/);
});
