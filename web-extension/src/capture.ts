export const MAX_TEXT_BYTES = 4096;
export const MAX_BATCH_BYTES = 24 * 1024;
export const MAX_BATCH_ITEMS = 24;
export const MAX_URL_BYTES = 4096;

const encoder = new TextEncoder();

export function bytes(value: string): number {
    return encoder.encode(value).length;
}

export function normalizeText(text: string): string {
    return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

// Split on Unicode code points so a multibyte character survives a boundary.
export function splitText(raw: string): string[] {
    const text = normalizeText(raw);
    if (!text) return [];
    if (bytes(text) <= MAX_TEXT_BYTES) return [text];

    const parts: string[] = [];
    let part = "";
    let size = 0;
    for (const character of text) {
        const length = bytes(character);
        if (size + length > MAX_TEXT_BYTES) {
            parts.push(part.trim());
            part = "";
            size = 0;
        }
        part += character;
        size += length;
    }
    if (part.trim()) parts.push(part.trim());
    return parts;
}

export function sourceUrl(url: string, senderUrl?: string): string | undefined {
    try {
        const parsed = new URL(url);
        if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return;
        if (bytes(url) > MAX_URL_BYTES || (senderUrl && parsed.origin !== new URL(senderUrl).origin)) return;
        return url;
    } catch {
        return;
    }
}

export function captureKey(documentId: string, url: string, text: string): string {
    return JSON.stringify([documentId, url, text]);
}
