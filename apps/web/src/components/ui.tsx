/**
 * Small presentational primitives for the web prototype. Accessible by default: buttons have
 * real button semantics, badges pair icon + text (color is never the only signal — docs/03),
 * and messages use role="status"/"alert".
 */

import type { CSSProperties, ReactNode } from "react";
import { buttonStyle, card, color, input, label, space } from "../ui/theme";

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <section style={{ ...card, ...style }}>{children}</section>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  title,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      style={{ ...buttonStyle(variant), opacity: disabled ? 0.55 : 1 }}
    >
      {children}
    </button>
  );
}

export function Field({
  id,
  label: labelText,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: space(3) }}>
      <label htmlFor={id} style={label}>
        {labelText}
      </label>
      {children}
      {hint ? (
        <p style={{ color: color.muted, fontSize: 12, margin: `${space(1)}px 0 0` }}>{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput(props: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      id={props.id}
      type={props.type ?? "text"}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
      style={input}
    />
  );
}

export function TextArea(props: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      id={props.id}
      value={props.value}
      placeholder={props.placeholder}
      rows={props.rows ?? 3}
      onChange={(e) => props.onChange(e.target.value)}
      style={{ ...input, minHeight: 72, resize: "vertical" }}
    />
  );
}

export type Tone = "verified" | "warn" | "danger" | "neutral";

const TONE_STYLE: Record<Tone, { bg: string; fg: string }> = {
  verified: { bg: color.verifiedSurface, fg: color.verified },
  warn: { bg: color.warnSurface, fg: color.warn },
  danger: { bg: color.dangerSurface, fg: color.danger },
  neutral: { bg: color.subtle, fg: color.body },
};

export function Badge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: string; children: ReactNode }) {
  const t = TONE_STYLE[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: t.bg,
        color: t.fg,
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
}

export function Message({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  if (!children) return null;
  const t = TONE_STYLE[tone];
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      style={{
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.fg}33`,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 13,
        margin: `${space(2)}px 0 0`,
      }}
    >
      {children}
    </p>
  );
}

export function SectionHeading({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ marginBottom: space(3) }}>
      <h2 style={{ margin: 0, fontSize: 20, color: color.ink }}>{children}</h2>
      {sub ? <p style={{ color: color.muted, margin: `${space(1)}px 0 0`, fontSize: 14 }}>{sub}</p> : null}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        color: color.muted,
        fontSize: 12,
        lineHeight: 1.5,
        margin: `${space(2)}px 0 0`,
      }}
    >
      {children}
    </p>
  );
}
