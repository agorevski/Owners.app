/**
 * Minimal design tokens for the v0 web prototype.
 *
 * Inline-style based (no CSS pipeline needed for the prototype). Values chosen for adequate
 * contrast and ≥44px touch targets per docs/03 accessibility notes.
 */

import type { CSSProperties } from "react";

export const color = {
  ink: "#111418",
  body: "#3a4149",
  muted: "#5a636c",
  line: "#dfe3e8",
  surface: "#ffffff",
  subtle: "#f5f7f9",
  accent: "#0b5cad",
  accentInk: "#ffffff",
  verified: "#0a7d33",
  verifiedSurface: "#e9f6ee",
  warn: "#8a5a00",
  warnSurface: "#fbf1dd",
  danger: "#b3261e",
  dangerSurface: "#fbe9e8",
} as const;

export const space = (n: number): number => n * 4;

export const card: CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.line}`,
  borderRadius: 10,
  padding: space(4),
};

export const label: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: color.body,
  marginBottom: space(1),
};

export const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  fontSize: 14,
  border: `1px solid ${color.line}`,
  borderRadius: 8,
  fontFamily: "inherit",
  minHeight: 44,
};

export function buttonStyle(variant: "primary" | "secondary" | "ghost" = "primary"): CSSProperties {
  const base: CSSProperties = {
    minHeight: 44,
    padding: "10px 16px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
  if (variant === "primary") {
    return { ...base, background: color.accent, color: color.accentInk, border: `1px solid ${color.accent}` };
  }
  if (variant === "secondary") {
    return { ...base, background: color.surface, color: color.ink, border: `1px solid ${color.ink}` };
  }
  return { ...base, background: "transparent", color: color.accent, border: "1px solid transparent" };
}
