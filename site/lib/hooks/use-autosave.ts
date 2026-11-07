import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutosave(
  value: string,
  save: (v: string) => Promise<unknown>,
  delayMs = 800,
): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const saveRef = useRef(save);
  const lastSaved = useRef<string | null>(value);
  const pending = useRef<string | null>(null);
  // Saves run one at a time so an older value can't land after a newer one.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    saveRef.current = save;
  });

  const flushRef = useRef(() => {
    const v = pending.current;
    if (v === null) return;
    pending.current = null;
    lastSaved.current = v;
    const run = ++latest.current;
    if (mounted.current) setStatus("saving");
    queue.current = queue.current
      .then(() => saveRef.current(v))
      .then(
        () => {
          if (mounted.current && run === latest.current) setStatus("saved");
        },
        () => {
          if (lastSaved.current === v) lastSaved.current = null;
          if (mounted.current && run === latest.current) setStatus("error");
        },
      );
  });

  useEffect(() => {
    if (value === lastSaved.current) {
      pending.current = null;
      return;
    }
    pending.current = value;
    const timer = setTimeout(() => flushRef.current(), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  useEffect(() => {
    mounted.current = true;
    const flush = flushRef.current;
    return () => {
      mounted.current = false;
      flush();
    };
  }, []);

  return status;
}
