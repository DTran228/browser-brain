import { LRUCache } from "lru-cache";
import { bytes, captureKey, MAX_BATCH_BYTES, MAX_BATCH_ITEMS, MAX_TEXT_BYTES, normalizeText } from "./capture.ts";

export type Observation = { text: string; captured_at: string };
export type Batch = { batch_id: string; document_id: string; url: string; observations: Observation[] };
type Item = { batch: Batch; due: number; sealed: boolean; attempts: number; error?: string; terminal?: boolean };
export type QueueState = {
    items: Item[];
    enabled: boolean;
    full: boolean;
    clearBefore?: string;
};
type Storage = { load(): Promise<QueueState | undefined>; save(state: QueueState): Promise<void> };
export type UploadResult = { ok: true } | { ok: false; error: string; terminal?: boolean; retryAfter?: number };

export const WAIT_MS = 5000;
const FLUSH_BYTES = 8192;
const MAX_QUEUE_BYTES = 2 * 1024 * 1024;
const MAX_BATCHES = 256;
export const QUEUE_KEY = "browserBrainQueueV1";

export function retryAfter(value: string | null, now: number): number {
    if (!value) return 0;
    const seconds = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
    return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

export class UploadQueue {
    private storage: Storage;
    private sequence: Promise<unknown> = Promise.resolve();
    private running?: Promise<void>;
    private seen = new LRUCache<string, true>({
        max: 2000, maxSize: 1024 * 1024, sizeCalculation: (_, key) => bytes(key),
    });

    constructor(storage: Storage) {
        this.storage = storage;
    }

    private serial<T>(operation: (state: QueueState) => T | Promise<T>): Promise<T> {
        const result = this.sequence.then(async () => operation(
            await this.storage.load() ?? { items: [], enabled: false, full: false },
        ));
        this.sequence = result.catch(() => {});
        return result;
    }

    status() {
        return this.serial(state => ({
            enabled: state.enabled,
            full: state.full,
            clearing: Boolean(state.clearBefore),
            pending: state.items.filter(item => !item.terminal).length,
            failed: state.items.filter(item => item.error).map(item => ({
                id: item.batch.batch_id, error: item.error!, terminal: Boolean(item.terminal),
            })),
        }));
    }

    setEnabled(enabled: boolean) {
        return this.serial(async state => {
            if (!state.clearBefore) {
                state.enabled = enabled;
                await this.storage.save(state);
            }
            return state.enabled;
        });
    }

    enqueue(documentId: string, url: string, observations: Observation[], now = Date.now()) {
        return this.serial(async state => {
            if (!state.enabled || state.clearBefore) return { accepted: false, paused: true };
            const pending = state.items.filter(item => item.batch.document_id === documentId && item.batch.url === url);
            const known = new Set(pending.flatMap(item => item.batch.observations.map(o => o.text)));
            const fresh: Observation[] = [];
            for (const observation of observations) {
                const text = normalizeText(observation.text);
                if (!text || bytes(text) > MAX_TEXT_BYTES || !Number.isFinite(Date.parse(observation.captured_at))) {
                    throw new Error("Invalid observation.");
                }
                if (!known.has(text) && !this.seen.get(captureKey(documentId, url, text))) {
                    fresh.push({ text, captured_at: observation.captured_at });
                    known.add(text);
                }
            }
            if (!fresh.length) return { accepted: true };

            let open = pending.find(item => !item.sealed && item.due > now);
            for (const observation of fresh) {
                if (open) {
                    const candidate = { ...open.batch, observations: [...open.batch.observations, observation] };
                    if (candidate.observations.length <= MAX_BATCH_ITEMS && bytes(JSON.stringify(candidate)) <= MAX_BATCH_BYTES) {
                        open.batch = candidate;
                        if (bytes(JSON.stringify(candidate)) >= FLUSH_BYTES || candidate.observations.length === MAX_BATCH_ITEMS) {
                            open.due = now;
                            open.sealed = true;
                            open = undefined;
                        }
                        continue;
                    }
                    open.due = now;
                    open.sealed = true;
                }
                const batch = { batch_id: crypto.randomUUID(), document_id: documentId, url, observations: [observation] };
                const sealed = bytes(JSON.stringify(batch)) >= FLUSH_BYTES;
                open = { batch, due: sealed ? now : now + WAIT_MS, attempts: 0, sealed };
                state.items.push(open);
                if (sealed) open = undefined;
            }

            if (state.items.length > MAX_BATCHES || bytes(JSON.stringify(state)) > MAX_QUEUE_BYTES) {
                // Reload the last persisted state so a rejected capture cannot change existing batches.
                const saved = await this.storage.load();
                if (saved && !saved.full) await this.storage.save({ ...saved, full: true });
                return { accepted: false, full: true };
            }
            state.full = false;
            await this.storage.save(state);
            for (const { text } of fresh) this.seen.set(captureKey(documentId, url, text), true);
            return { accepted: true };
        });
    }

    nextDue() {
        return this.serial(state => {
            if (state.clearBefore) return Infinity;
            return Math.min(...state.items.filter(item => !item.terminal).map(item => item.due));
        });
    }

    drain(upload: (batch: Batch) => Promise<UploadResult>, now = Date.now): Promise<void> {
        if (this.running) return this.running;
        this.running = this.uploadDue(upload, now).finally(() => { this.running = undefined; });
        return this.running;
    }

    private async uploadDue(upload: (batch: Batch) => Promise<UploadResult>, now: () => number) {
        while (true) {
            const item = await this.serial(async state => {
                if (state.clearBefore) return;
                const next = state.items.find(candidate => !candidate.terminal && candidate.due <= now());
                if (next && !next.sealed) {
                    next.sealed = true;
                    await this.storage.save(state);
                }
                return next;
            });
            if (!item) return;
            const result = await upload(item.batch).catch((): UploadResult => ({
                ok: false, error: "Backend unreachable. Waiting to retry.",
            }));
            await this.serial(async state => {
                const current = state.items.find(candidate => candidate.batch.batch_id === item.batch.batch_id);
                if (!current) return;
                if (result.ok) {
                    state.items = state.items.filter(candidate => candidate !== current);
                    state.full = false;
                } else {
                    current.error = result.error;
                    current.terminal = result.terminal;
                    current.attempts += 1;
                    const backoff = Math.min(300_000, 5000 * 2 ** Math.min(current.attempts - 1, 6));
                    current.due = now() + Math.max(backoff, result.retryAfter ?? 0);
                }
                await this.storage.save(state);
            });
        }
    }

    manage(id: string, action: "retry" | "delete", now = Date.now()) {
        return this.serial(async state => {
            const item = state.items.find(candidate => candidate.batch.batch_id === id && candidate.terminal);
            if (!item || state.clearBefore) return;
            if (action === "delete") {
                state.items = state.items.filter(candidate => candidate !== item);
                state.full = false;
                for (const { text } of item.batch.observations) {
                    this.seen.delete(captureKey(item.batch.document_id, item.batch.url, text));
                }
            } else {
                item.terminal = false;
                item.attempts = 0;
                item.due = now;
            }
            await this.storage.save(state);
        });
    }

    async clear(remote: (before: string) => Promise<void>, pause: () => Promise<void>) {
        const before = await this.serial(async state => {
            state.enabled = false;
            state.clearBefore ??= new Date().toISOString();
            await this.storage.save(state);
            return state.clearBefore;
        });
        await pause();
        await this.running;
        await remote(before);
        await this.serial(async state => {
            if (state.clearBefore !== before) return;
            await this.storage.save({ items: [], enabled: false, full: false });
            this.seen.clear();
        });
    }
}
