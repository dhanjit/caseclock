/**
 * Commit-on-blur text inputs. Free-text fields that saved per keystroke were
 * resealing the entire encrypted vault once per character and fighting the
 * store-driven re-render mid-typing (review finding). These keep keystrokes
 * local and commit once — on blur or Enter (input) / blur (textarea) — syncing
 * from the prop only while not focused.
 */
import { useEffect, useRef, useState } from "react";

export function DeferredInput({
  value,
  onCommit,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);
  const commit = () => {
    if (local !== value) onCommit(local);
  };
  return (
    <input
      {...rest}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={(e) => {
        focused.current = true;
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        commit();
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        rest.onKeyDown?.(e);
      }}
    />
  );
}

export function DeferredTextarea({
  value,
  onCommit,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);
  return (
    <textarea
      {...rest}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={(e) => {
        focused.current = true;
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        if (local !== value) onCommit(local);
        rest.onBlur?.(e);
      }}
    />
  );
}
