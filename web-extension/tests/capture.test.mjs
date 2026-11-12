import assert from "node:assert/strict";
import test from "node:test";
import { bytes, captureKey, MAX_TEXT_BYTES, sourceUrl, splitText } from "../src/capture.ts";

test("normalization is exact after NFC and whitespace normalization", () => {
    assert.deepEqual(splitText("  cafe\u0301\n lantern "), ["café lantern"]);
});

test("UTF-8 boundary preserves every code point", () => {
    const text = "a".repeat(MAX_TEXT_BYTES - 1) + "🚲à";
    const parts = splitText(text);
    assert.equal(parts.join(""), text);
    assert.ok(parts.every(part => bytes(part) <= MAX_TEXT_BYTES));
});

test("URLs and document IDs participate in deduplication without canonicalization", () => {
    const first = "https://example.test/page?edition=1#part";
    const second = "https://example.test/page?edition=2#part";
    assert.equal(sourceUrl(first, second), first);
    assert.equal(sourceUrl(first, "https://other.test"), undefined);
    assert.notEqual(captureKey("document", first, "same"), captureKey("document", second, "same"));
    assert.notEqual(captureKey("document", first, "same"), captureKey("new-document", first, "same"));
});
