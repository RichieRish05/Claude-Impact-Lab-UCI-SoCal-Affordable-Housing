"use client";

import { useState } from "react";

type Props = {
  onAsk: (message: string) => void;
  pending: boolean;
  reply: string | null;
  error: string | null;
  onClear: () => void;
  children?: React.ReactNode;
};

export function AskBox({ onAsk, pending, reply, error, onClear, children }: Props) {
  const [text, setText] = useState("");

  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <form
        className="flex items-center gap-2 rounded-xl border border-border bg-background p-1.5 pl-4 shadow-md"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onAsk(text);
          setText("");
        }}
      >
        <input
          aria-label="Ask a question"
          className="min-w-0 grow bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder={pending ? "Thinking…" : "Ask where homes can go in Huntington Beach…"}
          value={text}
          disabled={pending}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-default disabled:opacity-50"
        >
          {pending ? "Thinking…" : "Ask"}
        </button>
      </form>
      {children}
      {(reply || error) && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-background/95 px-3 py-2 text-sm shadow-sm">
          <p className={error ? "grow text-red-700" : "grow"} aria-live="polite">
            {error ?? reply}
          </p>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            New question
          </button>
        </div>
      )}
    </div>
  );
}
