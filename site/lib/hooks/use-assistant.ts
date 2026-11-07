"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ParcelFilters } from "@/lib/parcel-filters";
import { useTRPC } from "@/lib/trpc/client";

type Turn = { role: "user" | "assistant"; text: string };

type Options = {
  filters: ParcelFilters;
  selectedApn: string | null;
  onFilters: (filters: ParcelFilters) => void;
};

export function useAssistant({ filters, selectedApn, onFilters }: Options) {
  const trpc = useTRPC();
  const [history, setHistory] = useState<Turn[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  const mutation = useMutation(trpc.assistant.ask.mutationOptions());

  const ask = (message: string) => {
    const text = message.trim();
    if (!text || mutation.isPending) return;
    mutation.mutate(
      { message: text, history, filters, selectedApn: selectedApn ?? undefined },
      {
        onSuccess: (result) => {
          setHistory((turns) =>
            [
              ...turns,
              { role: "user", text } satisfies Turn,
              { role: "assistant", text: result.reply } satisfies Turn,
            ].slice(-20),
          );
          setReply(result.reply);
          onFilters(result.filters);
        },
      },
    );
  };

  const clear = () => {
    setHistory([]);
    setReply(null);
    mutation.reset();
  };

  return {
    ask,
    reply,
    pending: mutation.isPending,
    error: mutation.error?.message ?? null,
    clear,
  };
}
