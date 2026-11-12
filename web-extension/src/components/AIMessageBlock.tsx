import { sourceUrl } from "@/capture";
import type { ChatMessage } from "@/types";

function dateLabel(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        second: "2-digit", timeZoneName: "short",
    });
}

export default function AIMessageBlock({ content, sources = [], notice }: Omit<ChatMessage, "role">) {
    const links = new Map(sources.flatMap(source => {
        const url = sourceUrl(source.url);
        return url ? [[source.id, url] as const] : [];
    }));

    return (
        <div className="my-2 text-sm space-y-2">
            {content && <p className="whitespace-pre-wrap break-words">{content.split(/(\[S\d+\])/g).map((part, index) => {
                const url = links.get(part.slice(1, -1));
                return url && /^\[S\d+\]$/.test(part)
                    ? <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="underline">{part}</a>
                    : part;
            })}</p>}
            {notice && <p className="text-amber-200" role="status">{notice}</p>}
            {sources.map(source => {
                const url = links.get(source.id);
                if (!url) return null;
                return (
                    <article key={source.id} className="rounded-lg border border-slate-600 bg-slate-900/55 p-2.5">
                        <a className="block break-all text-blue-200 underline" href={url} target="_blank"
                            rel="noopener noreferrer">{source.id} · {url}</a>
                        <p className="mt-1 break-words">{source.snippet}</p>
                        <p className="mt-1 text-xs text-slate-300">
                            {source.captured_at
                                ? <>Viewed <time dateTime={source.captured_at}>{dateLabel(source.captured_at)}</time></>
                                : <>View time unavailable{source.indexed_at && <> · Indexed <time
                                    dateTime={source.indexed_at}>{dateLabel(source.indexed_at)}</time></>}</>}
                        </p>
                    </article>
                );
            })}
        </div>
    );
}
