import React, { useState, useRef, useEffect } from "react";
import { SendHorizonal } from "lucide-react";

const MAX_HEIGHT = 128;

const ChatInput: React.FC<{ onSend?: (msg: string) => void; disabled?: boolean }> = ({ onSend, disabled }) => {
    const [input, setInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = Math.min(textarea.scrollHeight, MAX_HEIGHT) + "px";
        }
    }, [input]);

    const handleSend = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!disabled && input.trim()) {
            onSend?.(input.trim());
            setInput("");
        }
    };

    return (
        <form
            onSubmit={handleSend}
            className="w-full flex justify-center z-20"
            autoComplete="off"
        >
            <div
                className={`
                    flex items-end gap-2
                    w-full max-w-xl
                    px-2 py-2
                    mb-4 mx-4
                    rounded-xl
                    bg-[var(--bb-input-bg-gradient)]
                    transition-all
                    overflow-hidden
                `}
                style={{
                    background: "linear-gradient(100deg, #1e293b 0%, #334155 100%)"
                }}
            >
                <textarea
                    ref={textareaRef}
                    className={`
                        flex-1 bg-transparent outline-none border-none resize-none
                        text-white placeholder:text-[var(--bb-blue-accent)]/60
                        px-2 py-1
                        font-sans
                        text-[12px]
                        max-h-32
                        scrollbar-none
                        transition-all
                        min-h-[40px]
                    `}
                    placeholder="Ask about pages you read…"
                    aria-label="Ask about pages you read"
                    disabled={disabled}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    rows={1}
                    maxLength={1000}
                    style={{
                        overflowY: "auto",
                    }}
                />
                <button
                    type="submit"
                    className={`
                        p-1 rounded-full
                        bg-[var(--bb-blue-accent)]
                        hover:bg-blue-400
                        transition-all
                        disabled:opacity-50
                    `}
                    disabled={disabled || !input.trim()}
                    title="Send"
                >
                    <SendHorizonal className="w-4 h-4 text-white" />
                </button>
            </div>
        </form>
    );
};

export default ChatInput;
