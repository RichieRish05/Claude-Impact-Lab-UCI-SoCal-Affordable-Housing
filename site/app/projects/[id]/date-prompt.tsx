"use client";

import { useState } from "react";
import { todayInLA } from "@/lib/projects/review-clock";

export function DatePrompt({
  label,
  pending,
  error,
  onConfirm,
  onCancel,
  initial = todayInLA(new Date()),
  confirmLabel = "Confirm",
}: {
  label: string;
  pending: boolean;
  error?: string | null;
  onConfirm: (day: string) => void;
  onCancel: () => void;
  initial?: string;
  confirmLabel?: string;
}) {
  const [day, setDay] = useState(initial);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">{label}</span>
        <input
          type="date"
          autoFocus
          required
          value={day}
          onChange={(e) => setDay(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={!day || pending}
        onClick={() => onConfirm(day)}
        className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving…" : confirmLabel}
      </button>
      <button type="button" onClick={onCancel} className="text-sm text-muted-foreground">
        Cancel
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
