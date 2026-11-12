import { LRUCache } from "lru-cache";
import { bytes, MAX_BATCH_BYTES, MAX_BATCH_ITEMS, sourceUrl, splitText } from "./capture.ts";
import type { Observation } from "./queue.ts";

const blockSelector = "p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,dt,dd";
const editable = "input,textarea,select,[contenteditable]:not([contenteditable='false'])";
const seen = new LRUCache<string, true>({ max: 512 });
let enabled = false;
let currentUrl = location.href;
let timer: ReturnType<typeof setTimeout> | undefined;
let scanning = false;
let scanAgain = false;
let pending: { url: string; observations: Observation[]; more: boolean } | undefined;

function schedule(delay = 200) {
    if (!enabled || timer !== undefined) return;
    timer = setTimeout(() => {
        timer = undefined;
        void scan();
    }, delay);
}

function visible(element: HTMLElement): boolean {
    if (element.closest(editable) || !element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) return false;
    const box = element.getBoundingClientRect();
    return box.height > 0 && box.width > 0 && box.top < innerHeight && box.bottom > 0
        && box.left < innerWidth && box.right > 0;
}

function collect(url: string) {
    const captured_at = new Date().toISOString();
    const texts = new Set<string>();
    const observations: Observation[] = [];
    let size = 0;
    for (const element of document.querySelectorAll<HTMLElement>(blockSelector)) {
        if (element.querySelector(blockSelector) || element.querySelector(editable) || !visible(element)) continue;
        for (const text of splitText(element.innerText)) {
            if (texts.has(text) || seen.get(text)) continue;
            const observation = { text, captured_at };
            const itemSize = bytes(JSON.stringify(observation)) + 1;
            // Reserve space for the batch envelope and escaped URL.
            if (size + itemSize > MAX_BATCH_BYTES - 2 * bytes(url) - 512 || observations.length >= MAX_BATCH_ITEMS) {
                return { url, observations, more: true };
            }
            texts.add(text);
            observations.push(observation);
            size += itemSize;
        }
    }
    return { url, observations, more: false };
}

async function scan() {
    if (scanning) {
        scanAgain = true;
        return;
    }
    if (!enabled || document.visibilityState !== "visible") return;
    if (location.href !== currentUrl) {
        currentUrl = location.href;
        seen.clear();
    }
    const url = sourceUrl(currentUrl);
    pending ??= url ? collect(url) : undefined;
    const snapshot = pending;
    if (!snapshot?.observations.length) {
        pending = undefined;
        return;
    }

    scanning = true;
    try {
        const result = await chrome.runtime.sendMessage({
            type: "capture", url: snapshot.url, observations: snapshot.observations,
        });
        if (pending !== snapshot) return;
        if (result?.paused) {
            configure(false);
        } else if (result?.accepted) {
            pending = undefined;
            if (snapshot.url === currentUrl) {
                for (const { text } of snapshot.observations) seen.set(text, true);
            }
            if (snapshot.more || snapshot.url !== currentUrl) schedule();
        } else {
            schedule(3000);
        }
    } catch {
        if (chrome.runtime.id) schedule(3000);
    } finally {
        scanning = false;
        if (scanAgain) {
            scanAgain = false;
            schedule();
        }
    }
}

const observer = new MutationObserver(() => schedule());
function configure(next: boolean, reset = false) {
    enabled = next;
    if (reset) seen.clear();
    if (enabled) {
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true,
            attributeFilter: ["hidden", "class", "style", "open"] });
        schedule();
    } else {
        observer.disconnect();
        pending = undefined;
    }
}

chrome.runtime.onMessage.addListener(message => {
    if (message.type === "capture-setting") configure(message.enabled, message.reset);
});
void chrome.runtime.sendMessage({ type: "capture-setting" }).then(
    result => { if (result) configure(result.enabled); },
    () => {},
);

window.addEventListener("scroll", () => schedule(), { passive: true, capture: true });
window.addEventListener("resize", () => schedule());
window.addEventListener("pageshow", () => schedule());
document.addEventListener("visibilitychange", () => schedule());
window.addEventListener("hashchange", () => schedule());
window.addEventListener("popstate", () => schedule());
// pushState/replaceState can change the URL without producing a DOM event.
setInterval(() => { if (location.href !== currentUrl) schedule(); }, 1000);
