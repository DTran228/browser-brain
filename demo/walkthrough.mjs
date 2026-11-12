import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const backend = join(root, "backend");
const python = process.env.BROWSER_BRAIN_PYTHON || join(backend, ".venv", "Scripts", "python.exe");
const chrome = process.env.BROWSER_BRAIN_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const dist = join(root, "web-extension", "dist");
const demo = "http://127.0.0.1:8765";
const upstream = "http://127.0.0.1:8001";
const alpha = demo + "/alpha.html?edition=lab#shared";
const beta = demo + "/beta.html?edition=field#shared";
const shared = "The cobalt lantern protocol records nighttime harbor visibility.";
const question = "What does the cobalt lantern protocol record?";
const paths = ["/alpha.html", "/beta.html"];
const pages = Object.fromEntries(paths.map(path => [path, readFileSync(join(root, "demo", path.slice(1)))]));
readFileSync(join(dist, "manifest.json"));
mkdirSync(join(root, ".local"), { recursive: true });
const work = mkdtempSync(join(root, ".local", "walkthrough-"));
const env = { ...process.env, PYTHONPATH: "src", BROWSER_BRAIN_PROVIDER: "fixture", BROWSER_BRAIN_DATA: work,
    BROWSER_BRAIN_COLLECTION: "browser_brain_v1", QDRANT_URL: "" };

async function until(check, label, seconds = 20) {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
        const result = await check();
        if (result) return result;
        await sleep(150);
    }
    throw new Error("Timed out: " + label);
}

function startBrowser() {
    const child = spawn(chrome, ["--headless=new", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging",
        "--disable-background-networking", "--no-first-run", "--no-default-browser-check",
        "--window-size=1050,800", "--user-data-dir=" + join(work, "chrome"), "about:blank"],
    { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
    const pending = new Map();
    let serial = 0;
    let buffer = "";
    function abort(error) {
        for (const { reject } of pending.values()) reject(error);
        pending.clear();
    }
    child.on("error", abort);
    child.on("exit", code => abort(new Error("Chrome exited: " + code)));
    child.stdio[4].setEncoding("utf8").on("data", chunk => {
        buffer += chunk;
        let boundary;
        while ((boundary = buffer.indexOf("\0")) >= 0) {
            const message = JSON.parse(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 1);
            if (!pending.has(message.id)) continue;
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) reject(new Error(message.error.message));
            else resolve(message.result);
        }
    });
    child.stdio[3].on("error", abort);

    function call(method, params = {}, sessionId) {
        if (child.exitCode !== null) throw new Error("Chrome already exited.");
        const id = ++serial;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 12_000);
            pending.set(id, {
                resolve(value) { clearTimeout(timer); resolve(value); },
                reject(error) { clearTimeout(timer); reject(error); },
            });
            child.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
        });
    }

    async function tab(url) {
        const { targetId } = await call("Target.createTarget", { url });
        const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
        return {
            id: targetId,
            command: (method, params) => call(method, params, sessionId),
            async js(expression) {
                const response = await call("Runtime.evaluate", {
                    expression, awaitPromise: true, returnByValue: true, userGesture: true,
                }, sessionId);
                if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description);
                return response.result.value;
            },
        };
    }
    async function close() {
        if (child.exitCode !== null) return;
        const done = once(child, "exit");
        try { await call("Browser.close"); } catch { child.kill(); }
        await done;
    }
    return { call, tab, close };
}

const attempts = [];
let dropped = false;
const fixtures = createServer((req, res) => {
    const page = pages[new URL(req.url, demo).pathname];
    res.writeHead(page ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page);
});
const proxy = createServer(async (req, res) => {
    try {
        const parts = [];
        for await (const part of req) parts.push(part);
        const body = Buffer.concat(parts);
        const headers = {};
        if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
        if (req.headers.origin) headers.origin = req.headers.origin;
        const start = Date.now();
        const response = await fetch(upstream + req.url, { method: req.method, headers, body: body.length ? body : undefined });
        if (req.url === "/pages/upload" && req.method === "POST") {
            const batch = JSON.parse(body);
            const ack = await response.text();
            const loseResponse = !dropped && response.ok;
            attempts.push({ batch, start, committed: Date.now(), status: response.status, dropped: loseResponse });
            if (loseResponse) {
                dropped = true;
                // Start a 200 response so the browser cannot automatically replay a request on a dead keep-alive socket.
                res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(ack) });
                res.write(ack.slice(0, 3));
                setTimeout(() => res.destroy(), 100);
                return;
            }
            res.writeHead(response.status, { "Content-Type": "application/json" });
            res.end(ack);
        } else {
            res.writeHead(response.status, { "Content-Type": response.headers.get("content-type") || "text/plain" });
            Readable.fromWeb(response.body).pipe(res);
        }
    } catch {
        if (!res.headersSent) res.writeHead(503);
        res.end();
    }
});

let pythonProcess;
let browser;
let report;
try {
    fixtures.listen(8765, "127.0.0.1");
    proxy.listen(8000, "127.0.0.1");
    await Promise.all([once(fixtures, "listening"), once(proxy, "listening")]);
    pythonProcess = spawn(python, ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8001", "--no-access-log"],
        { cwd: backend, env, windowsHide: true, stdio: ["ignore", "ignore", "inherit"] });
    await until(() => fetch(upstream + "/health").then(r => r.ok).catch(() => false), "fixture backend");
    browser = startBrowser();
    const version = await browser.call("Browser.getVersion");
    const { id } = await browser.call("Extensions.loadUnpacked", { path: resolve(dist) });
    const panelUrl = "chrome-extension://" + id + "/src/popup/popup.html";
    let panel = await browser.tab(panelUrl);
    const body = () => panel.js('document.body?.innerText ?? ""');
    const status = () => panel.js('chrome.runtime.sendMessage({ type: "status" })');
    await until(async () => (await body()).includes("Connected · fixture mode"), "extension health");
    await panel.js('[...document.querySelectorAll("button")].find(b => b.textContent === "Enable capture").click()');
    await until(async () => (await status()).enabled, "capture enabled");
    const page = await browser.tab(alpha);
    await page.command("Page.bringToFront");
    await until(async () => (await status()).pending === 1, "first source persisted");
    await page.js('document.querySelector("main").append(document.querySelector("#shared").cloneNode(true))');
    await sleep(350);
    await page.js('document.querySelector("#next").click()');
    await until(async () => (await status()).pending === 2, "second source persisted in the same tab");
    try {
        await until(async () => (await status()).failed.some(item => /unreachable/i.test(item.error)), "lost response visible");
    } catch (error) {
        console.error(await status(), attempts.map(({ status, dropped }) => ({ status, dropped })));
        throw error;
    }
    const worker = await until(async () => {
        const { targetInfos } = await browser.call("Target.getTargets");
        return targetInfos.find(target => target.type === "service_worker" && target.url.startsWith("chrome-extension://" + id));
    }, "running extension service worker");
    await panel.command("ServiceWorker.enable");
    await panel.command("ServiceWorker.stopAllWorkers");
    await until(async () => {
        const { targetInfos } = await browser.call("Target.getTargets");
        return !targetInfos.some(target => target.targetId === worker.targetId);
    }, "old worker stopped", 5);
    await browser.call("Target.closeTarget", { targetId: panel.id });
    panel = await browser.tab(panelUrl);
    await until(async () => (await body()).includes("Connected · fixture mode"), "reopened extension");
    await until(async () => (await status()).pending === 0, "recovered queue drained", 45);
    await panel.js(`(() => {
        const input = document.querySelector("textarea");
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, ${JSON.stringify(question)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await until(() => panel.js('!document.querySelector("button[type=submit]").disabled'), "search enabled");
    await panel.js('document.querySelector("button[type=submit]").click()');
    const cards = await until(async () => {
        const items = await panel.js(`Array.from(document.querySelectorAll("article"), card => ({
            url: card.querySelector("a").href, capturedAt: card.querySelector("time").dateTime,
            hasViewLabel: card.innerText.includes("Viewed")
        }))`);
        return items.length === 2 && items;
    }, "two source cards");
    for (const card of cards) {
        const sent = attempts.find(item => item.batch.url === card.url);
        assert.equal(card.hasViewLabel, true);
        assert.equal(Date.parse(card.capturedAt), Date.parse(sent.batch.observations.find(item => item.text === shared).captured_at));
    }
    assert.deepEqual(cards.map(card => card.url).sort(), [alpha, beta].sort());
    const beforeClick = new Set((await browser.call("Target.getTargets")).targetInfos.map(target => target.targetId));
    await panel.js('document.querySelector("article a").click()');
    const opened = await until(async () => {
        const { targetInfos } = await browser.call("Target.getTargets");
        return targetInfos.find(target => target.type === "page" && !beforeClick.has(target.targetId) && target.url === cards[0].url)?.url;
    }, "clicked original URL opened");
    assert.equal(attempts.length, 3);
    assert.deepEqual(attempts.filter(item => item.batch.url === alpha).map(item => item.batch), [attempts[0].batch, attempts[0].batch]);
    report = { chrome: version.product, fixture: "demo/alpha.html + demo/beta.html", sameTabNavigation: true, question,
        persistedBatchesBeforeFailure: 2, lostResponses: 1, workerStopped: true, recoveredQueue: true,
        captureCount: attempts[0].batch.observations.length + attempts.find(item => item.batch.url === beta).batch.observations.length,
        uploadRequests: attempts.length, uniqueBatches: new Set(attempts.map(item => item.batch.batch_id)).size,
        cards, opened, attempts };
} finally {
    if (browser) await browser.close();
    if (pythonProcess && pythonProcess.exitCode === null) {
        const stopped = once(pythonProcess, "exit");
        pythonProcess.kill();
        await stopped;
    }
    proxy.closeAllConnections();
    proxy.close();
    fixtures.closeAllConnections();
    fixtures.close();
}
const indexed = JSON.parse(execFileSync(python, ["-c",
    "import json; from qdrant_client import QdrantClient; from config.config import settings; q=QdrantClient(path=str(settings.profile_dir/'qdrant')); print(json.dumps([p.payload for p in q.scroll(settings.collection, limit=100)[0]])); q.close()"],
{ cwd: backend, env, encoding: "utf8", windowsHide: true }));
assert.equal(indexed.length, report.captureCount);
const unique = new Set(indexed.map(point => JSON.stringify([point.document_id, point.url, point.content])));
report.indexedPoints = indexed.length;
report.duplicateLogicalRecords = indexed.length - unique.size;
assert.equal(report.duplicateLogicalRecords, 0);
report.indexingLatencyMs = indexed.map(point => ({
    url: point.url, text: point.content,
    milliseconds: Date.parse(point.indexed_at) - Date.parse(point.captured_at),
}));
console.log(JSON.stringify(report, null, 2));
