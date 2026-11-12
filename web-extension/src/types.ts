export const BASE_URL = "http://127.0.0.1:8000";

export type Source = {
    id: string;
    url: string;
    snippet: string;
    captured_at: string | null;
    indexed_at: string | null;
};

export type ChatMessage = {
    role: "user" | "assistant";
    content: string;
    sources?: Source[];
    notice?: string | null;
};

export type SearchEvent =
    | { type: "sources"; sources: Source[] }
    | { type: "answer"; text: string }
    | { type: "notice"; message: string }
    | { type: "done" };
