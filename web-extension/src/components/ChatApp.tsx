import { useEffect, useRef, useState } from "react";
import ChatHistory from "./ChatHistory";
import ChatInput from "./ChatInput";
import { searchEvents } from "@/searchStream";
import { BASE_URL, type ChatMessage } from "@/types";

type QueueStatus = {
    enabled: boolean;
    full: boolean;
    clearing: boolean;
    pending: number;
    failed: { id: string; error: string; terminal: boolean }[];
    storageError: boolean;
};
type Health = { qdrant: boolean; provider_ready: boolean; provider: "openai" | "fixture" };

const control = "rounded border border-slate-500 px-2 py-1 hover:bg-slate-700 disabled:opacity-50";

export default function ChatApp() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [status, setStatus] = useState<QueueStatus>();
    const [health, setHealth] = useState<Health | null>();
    const [awaiting, setAwaiting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState("");
    const historyRevision = useRef(0);

    async function refreshQueue() {
        const value = await chrome.runtime.sendMessage({ type: "status" }).catch(() => null);
        if (value && typeof value.pending === "number") setStatus(value);
    }

    useEffect(() => {
        async function refresh() {
            void refreshQueue();
            const value = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000), cache: "no-store" })
                .then(response => response.ok ? response.json() : null).catch(() => null);
            setHealth(value);
        }
        void refresh();
        const timer = setInterval(() => void refresh(), 4000);
        return () => clearInterval(timer);
    }, []);

    const backendOnline = Boolean(health?.qdrant);
    const clearing = Boolean(status?.clearing);
    useEffect(() => {
        if (!backendOnline || clearing) return;
        const revision = historyRevision.current;
        const controller = new AbortController();
        void fetch(`${BASE_URL}/chat/messages`, { signal: controller.signal, cache: "no-store" })
            .then(response => response.ok ? response.json() : null)
            .then(data => {
                if (data && revision === historyRevision.current) setMessages(previous => previous.length ? previous : data.messages);
            }).catch(() => {});
        return () => controller.abort();
    }, [backendOnline, clearing]);

    async function manage(message: { type: string; enabled?: boolean; id?: string }) {
        setBusy(true);
        setProblem("");
        if (message.type === "clear") historyRevision.current++;
        try {
            const result = await chrome.runtime.sendMessage(message);
            if (!result?.ok) throw new Error(message.type === "clear"
                ? "Clear is paused. Reconnect the backend, then finish clearing."
                : "Extension storage is unavailable. Try again.");
            if (message.type === "clear") setMessages([]);
        } catch (error) {
            setProblem(error instanceof Error ? error.message : "Extension action failed.");
        } finally {
            await refreshQueue();
            setBusy(false);
        }
    }

    async function send(query: string) {
        if (awaiting || busy || clearing) return;
        historyRevision.current++;
        setAwaiting(true);
        setProblem("");
        const assistant: ChatMessage = { role: "assistant", content: "", sources: [] };
        setMessages(previous => [...previous, { role: "user", content: query }, { ...assistant }]);
        try {
            const response = await fetch(`${BASE_URL}/chat/query/stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
                signal: AbortSignal.timeout(60_000),
            });
            if (!response.ok) {
                const detail = (await response.json().catch(() => null))?.detail;
                throw new Error(typeof detail === "string" ? detail : `Search failed (HTTP ${response.status}).`);
            }
            if (!response.body) throw new Error("Search response was empty.");
            for await (const event of searchEvents(response.body)) {
                if (event.type === "sources") assistant.sources = event.sources;
                if (event.type === "answer") assistant.content += event.text;
                if (event.type === "notice") {
                    assistant.notice = event.message;
                    if (!assistant.sources?.length && status?.pending) {
                        assistant.notice += " Uploads are pending. Try again after indexing.";
                    }
                }
                const snapshot = { ...assistant };
                setMessages(previous => [...previous.slice(0, -1), snapshot]);
            }
        } catch (error) {
            assistant.notice = error instanceof TypeError
                ? "Backend disconnected or the search connection was interrupted."
                : error instanceof Error ? error.message : "Search failed.";
            setMessages(previous => [...previous.slice(0, -1), { ...assistant }]);
        } finally {
            setAwaiting(false);
            void refreshQueue();
        }
    }

    let connection = "Checking connection…";
    if (health === null) connection = "Backend disconnected. Start it on port 8000.";
    else if (health && !health.qdrant) connection = "Qdrant unavailable. Check backend storage.";
    else if (health && !health.provider_ready) connection = "Set OPENAI_API_KEY in backend/.env and restart.";
    else if (health?.provider === "fixture") connection = "Connected · fixture mode";
    else if (health) connection = "Connected to local backend";

    return (
        <main className="flex h-full w-full flex-col text-slate-100">
            <header className="border-b border-slate-600 px-4 py-3 text-xs">
                <h1 className="text-lg font-semibold">Browser Brain</h1>
                <p role="status" className="mt-1 text-slate-200">{connection}</p>
                <p className="mt-1 text-slate-300">OpenAI mode sends captured text, queries, and retrieved excerpts to OpenAI.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={control} disabled={!status || busy || clearing}
                        onClick={() => void manage({ type: "set-enabled", enabled: !status?.enabled })}>
                        {status?.enabled ? "Pause capture" : "Enable capture"}
                    </button>
                    <button type="button" className={control} disabled={!status || busy || awaiting}
                        onClick={() => {
                            if (clearing || window.confirm("Clear indexed pages, chat, and pending uploads for this profile?")) {
                                void manage({ type: "clear" });
                            }
                        }}>{clearing ? "Finish clearing" : "Clear history"}</button>
                </div>
                {status && <p className="mt-2" role="status">
                    {status.enabled ? "Capture on" : "Capture paused"} · {status.pending} pending upload{status.pending === 1 ? "" : "s"}
                </p>}
                {status?.full && <p className="mt-1 text-amber-200" role="alert">Queue full. Keep the page open and reconnect to resume capture.</p>}
                {status?.storageError && <p className="mt-1 text-amber-200" role="alert">Extension storage write failed.</p>}
                {status?.failed.length ? <ul className="mt-2 max-h-24 overflow-y-auto space-y-2">
                    {status.failed.map(failure => <li key={failure.id} className="text-amber-200">
                        {failure.error}
                        {failure.terminal && <div className="mt-1 flex gap-2">
                            <button className={control} disabled={busy || clearing}
                                onClick={() => void manage({ type: "retry", id: failure.id })}>Retry</button>
                            <button className={control} disabled={busy || clearing}
                                onClick={() => void manage({ type: "delete", id: failure.id })}>Delete batch</button>
                        </div>}
                    </li>)}
                </ul> : null}
                {problem && <p className="mt-1 text-amber-200" role="alert">{problem}</p>}
            </header>
            <ChatHistory messages={clearing ? [] : messages} isAwaitingResponse={awaiting} />
            <ChatInput onSend={send} disabled={awaiting || busy || clearing || !backendOnline || !health?.provider_ready} />
        </main>
    );
}
