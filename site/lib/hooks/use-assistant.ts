"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { mergeAssistantFilters } from "@/lib/assistant-filters";
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
  const latestFilters = useRef(filters);
  useEffect(() => {
    latestFilters.current = filters;
  });

  const ask = (message: string) => {
    const text = message.trim();
    if (!text || mutation.isPending) return;
    const sent = filters;
    mutation.mutate(
      { message: text, history, filters: sent, selectedApn: selectedApn ?? undefined },
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
          onFilters(mergeAssistantFilters(sent, result.filters, latestFilters.current));
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
