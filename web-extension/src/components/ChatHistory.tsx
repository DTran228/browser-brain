import React, { useRef, useEffect } from "react";
import UserMessageBubble from "./UserMessageBubble";
import AIMessageBlock from "./AIMessageBlock";
import LoadingIndicator from "./LoadingIndicator";
import type { ChatMessage } from "@/types";

interface ChatHistoryProps {
    messages: ChatMessage[];
    isAwaitingResponse?: boolean;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, isAwaitingResponse }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, isAwaitingResponse]);

    return (
        <div
            ref={scrollRef}
            className={`
                flex-1 overflow-y-auto px-4 py-6
                space-y-2
                rounded-2xl
                scrollbar-thin scrollbar-thumb-[#232946] scrollbar-track-transparent
                transition-all
                bg-transparent
            `}
            style={{
                minHeight: 0,
            }}
        >
            {messages.map((msg, index) =>
                msg.role === "user" ? (
                    <UserMessageBubble key={index} content={msg.content} />
                ) : (
                    <AIMessageBlock key={index} {...msg} />
                )
            )}
            {isAwaitingResponse && <LoadingIndicator />}
        </div>
    );
};

export default ChatHistory;
