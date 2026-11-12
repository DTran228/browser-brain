import React from "react";
import { Loader2 } from "lucide-react";

const LoadingIndicator: React.FC = () => (
    <div className="w-full flex justify-center my-2">
        <div className="flex items-center gap-2 px-4 py-1 rounded-lg bg-[#1e293b]">
            <Loader2 className="w-4 h-4 text-[var(--bb-blue-accent)] animate-spin" />
            <span className="text-[var(--bb-blue-accent)] text-xs font-mono opacity-80">
                Awaiting response…
            </span>
        </div>
    </div>
);

export default LoadingIndicator;