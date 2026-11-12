import { MAX_BATCH_ITEMS, sourceUrl } from "./capture.ts";
import { QUEUE_KEY, retryAfter, UploadQueue, type Batch, type Observation, type UploadResult } from "./queue.ts";
import { BASE_URL } from "./types";

const ALARM = "browser-brain-upload";
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
const queue = new UploadQueue({
    async load() {
        await storageReady;
        return (await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY];
    },
    async save(state) {
        await chrome.storage.local.set({ [QUEUE_KEY]: state });
    },
});
let timer: ReturnType<typeof setTimeout> | undefined;
let clearInProgress: Promise<void> | undefined;
let storageError = false;

async function upload(batch: Batch): Promise<UploadResult> {
    const response = await fetch(`${BASE_URL}/pages/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(27_000),
    });
    if (response.ok) {
        const acknowledgement = await response.json();
        return acknowledgement.batch_id === batch.batch_id
            ? { ok: true }
            : { ok: false, error: "Backend sent an invalid acknowledgement." };
    }
    const terminal = response.status < 500 && ![408, 429].includes(response.status);
    const detail = (await response.json().catch(() => null))?.detail;
    return {
        ok: false,
        terminal,
        error: typeof detail === "string" ? detail : `Upload failed (HTTP ${response.status}).`,
        retryAfter: retryAfter(response.headers.get("Retry-After"), Date.now()),
    };
}

async function badge() {
    const status = await queue.status();
    const issue = storageError || status.full || status.clearing || status.failed.length > 0;
    await chrome.action.setBadgeText({ text: issue ? "!" : status.pending ? String(Math.min(status.pending, 99)) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: issue ? "#b45309" : "#2457a7" });
}

async function run() {
    try {
        await queue.drain(upload);
        const next = await queue.nextDue();
        clearTimeout(timer);
        if (Number.isFinite(next)) timer = setTimeout(() => void run(), Math.max(0, Math.min(300_000, next - Date.now())));
        await badge();
    } catch {
        storageError = true;
        await chrome.action.setBadgeText({ text: "!" });
    }
}

async function ensureAlarm() {
    if (!await chrome.alarms.get(ALARM)) await chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
    await run();
}

async function broadcastSetting(enabled: boolean, reset = false) {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(tabs.flatMap(tab => tab.id === undefined ? [] : [
        chrome.tabs.sendMessage(tab.id, { type: "capture-setting", enabled, reset }),
    ]));
}

type Message = { type: string; url?: string; observations?: Observation[]; enabled?: boolean; id?: string };

async function handle(message: Message, sender: chrome.runtime.MessageSender) {
    if (message.type === "capture-setting") return { enabled: (await queue.status()).enabled };
    if (message.type === "capture") {
        const url = message.url && sender.url && sourceUrl(message.url, sender.url);
        if (!url || sender.frameId !== 0 || sender.tab?.incognito || !sender.documentId
            || sender.documentLifecycle !== "active" || !Array.isArray(message.observations)
            || message.observations.length > MAX_BATCH_ITEMS) return { accepted: false, paused: true };
        const result = await queue.enqueue(sender.documentId, url, message.observations);
        storageError = false;
        void run();
        return result;
    }

    if (sender.url !== chrome.runtime.getURL("src/popup/popup.html")) return;
    switch (message.type) {
        case "status":
            return { ...await queue.status(), storageError };
        case "set-enabled":
            await broadcastSetting(await queue.setEnabled(Boolean(message.enabled)));
            break;
        case "retry":
        case "delete":
            if (message.id) await queue.manage(message.id, message.type);
            break;
        case "clear":
            clearInProgress ??= queue.clear(async before => {
                const response = await fetch(`${BASE_URL}/history/clear`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ before }),
                    signal: AbortSignal.timeout(25_000),
                });
                if (!response.ok) throw new Error("Could not clear local history.");
            }, () => broadcastSetting(false, true)).finally(() => { clearInProgress = undefined; });
            await clearInProgress;
            break;
    }
    void run();
    return { ok: true };
}

chrome.runtime.onMessage.addListener((message: Message, sender, respond) => {
    void handle(message, sender).then(respond, () => {
        if (message.type === "capture") {
            storageError = true;
            void chrome.action.setBadgeText({ text: "!" });
        }
        respond({ ok: false, accepted: false });
    });
    return true;
});
chrome.runtime.onStartup.addListener(() => { void ensureAlarm(); });
chrome.runtime.onInstalled.addListener(() => { void ensureAlarm(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) void run(); });
void ensureAlarm();
