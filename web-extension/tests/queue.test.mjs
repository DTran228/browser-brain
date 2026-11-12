import assert from "node:assert/strict";
import test from "node:test";
import { UploadQueue, WAIT_MS, retryAfter } from "../src/queue.ts";

const doc = "e6dc0594-d0bf-4b16-98c1-22dd4f233900";
const alpha = "http://127.0.0.1:8765/alpha.html?edition=lab#shared";
const beta = "http://127.0.0.1:8765/beta.html?edition=field#shared";
const observed = { text: "The cobalt lantern protocol records nighttime harbor visibility.", captured_at: "2025-01-01T12:00:00.000Z" };

async function setup() {
    let persisted;
    const storage = {
        async load() { return structuredClone(persisted); },
        async save(state) { persisted = structuredClone(state); },
    };
    const queue = new UploadQueue(storage);
    await queue.setEnabled(true);
    return { queue, storage };
}

test("batches within one source; identical paragraph survives same-tab navigation", async () => {
    const { queue, storage } = await setup();
    await queue.enqueue(doc, alpha, [observed], 0);
    await queue.enqueue(doc, alpha, [{ ...observed, text: "  " + observed.text }], 100);
    await queue.enqueue(doc, alpha, [{ ...observed, text: "Harbor observers log the wind." }], 200);
    await queue.enqueue(doc, beta, [observed], 250);
    const state = await storage.load();
    assert.deepEqual(state.items.map(item => item.batch.url), [alpha, beta]);
    assert.deepEqual(state.items.map(item => item.batch.observations.length), [2, 1]);
    assert.equal(state.items[0].batch.observations[0].captured_at, observed.captured_at);
    assert.equal(await queue.nextDue(), WAIT_MS);
});

test("persist before ack; worker restart and lost acknowledgement repeat identical bytes", async () => {
    const { queue, storage } = await setup();
    await queue.enqueue(doc, alpha, [observed], 0);
    const firstWorker = new UploadQueue(storage);
    let committed;
    await firstWorker.drain(async batch => {
        committed = JSON.stringify(batch);
        throw new Error("connection lost after commit");
    }, () => WAIT_MS);
    const secondWorker = new UploadQueue(storage);
    assert.equal((await secondWorker.status()).pending, 1);
    let uploadCount = 0;
    await secondWorker.drain(async batch => {
        ++uploadCount;
        assert.equal(JSON.stringify(batch), committed);
        return { ok: true };
    }, () => WAIT_MS * 2);
    assert.equal(uploadCount, 1);
    assert.equal((await secondWorker.status()).pending, 0);
});

test("enqueue during upload completion and concurrent drain do not lose or duplicate a batch", async () => {
    const { queue } = await setup();
    await queue.enqueue(doc, alpha, [observed], 0);
    let start;
    const started = new Promise(resolve => { start = resolve; });
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let sent = 0;
    const draining = queue.drain(async () => {
        sent++;
        start();
        await held;
        return { ok: true };
    }, () => WAIT_MS);
    await started;
    assert.equal(queue.drain(() => assert.fail("second uploader")), draining);
    await queue.enqueue(doc, alpha, [{ ...observed, text: "New paragraph" }], WAIT_MS);
    release();
    await draining;
    assert.equal(sent, 1);
    assert.equal((await queue.status()).pending, 1);
});

test("terminal and rate-limited items leave the next batch eligible", async () => {
    const { queue } = await setup();
    await queue.enqueue(doc, alpha, [observed], 0);
    await queue.enqueue(doc, beta, [observed], 0);
    await queue.drain(async ({ url }) => url === alpha
        ? { ok: false, error: "bad batch", terminal: true }
        : { ok: true }, () => WAIT_MS);
    const [failed] = (await queue.status()).failed;
    assert.equal(failed.terminal, true);
    await queue.manage(failed.id, "retry", WAIT_MS);
    await queue.drain(async () => ({ ok: false, error: "rate limit", retryAfter: 60_000 }), () => WAIT_MS);
    assert.equal(await queue.nextDue(), WAIT_MS + 60_000);
    assert.equal(retryAfter("60", 0), 60_000);
    assert.equal(retryAfter("Thu, 01 Jan 1970 00:01:00 GMT", 0), 60_000);
});

test("clear intent survives a disconnect and blocks uploads until acknowledged", async () => {
    const { queue, storage } = await setup();
    await queue.enqueue(doc, alpha, [observed], 0);
    let clearBefore;
    await assert.rejects(queue.clear(async before => {
        clearBefore = before;
        throw new Error("offline");
    }, async () => {}));
    const restored = new UploadQueue(storage);
    assert.equal((await restored.status()).clearing, true);
    assert.equal(await restored.nextDue(), Infinity);
    await restored.drain(() => assert.fail("clear must block old uploads"), () => WAIT_MS);
    await restored.clear(async before => { assert.equal(before, clearBefore); }, async () => {});
    assert.deepEqual(await restored.status(), { enabled: false, full: false, clearing: false, pending: 0, failed: [] });
});

test("full queue rejects new data without removing persisted batches", async () => {
    const { queue, storage } = await setup();
    for (let index = 0; index < 256; index++) {
        assert.equal((await queue.enqueue(doc, alpha + index, [observed], 0)).accepted, true);
    }
    assert.deepEqual(await queue.enqueue(doc, beta, [observed], 0), { accepted: false, full: true });
    assert.equal((await storage.load()).items.length, 256);
    assert.equal((await queue.status()).full, true);
});
