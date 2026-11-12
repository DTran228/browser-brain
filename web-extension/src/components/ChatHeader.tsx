import React from "react";
import { Sparkles } from "lucide-react"; // Example icon, replace with your own SVG/animation if desired

const ChatHeader: React.FC = () => {
    return (
        <header
        className={`
        flex items-center gap-3 px-6 py-4
        bg-white/5 backdrop-blur-sm
        border-b border-white/10
        rounded-t-2xl
        shadow-sm
        relative
        z-20
      `}
            >
            {/* Animated Logo */}
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 via-purple-500 to-indigo-500 shadow-lg animate-pulse">
            <Sparkles className="text-white drop-shadow-glow" size={28} />
            </div>
            {/* Title and tagline */}
            <div className="flex flex-col">
            <span className="text-lg font-bold tracking-wide text-white drop-shadow">
            Browser Brain
            </span>
            <span className="text-xs text-cyan-200 font-mono tracking-tight">
            Mistral AI is ready!
            </span>
            </div>
            {/* Optional: status indicator */}
            <span className="ml-auto flex items-center gap-1 text-xs text-green-400 font-semibold animate-pulse">
            ● Online
            </span>
            </header>
        );
    };

    export default ChatHeader;