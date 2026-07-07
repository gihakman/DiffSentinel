import { CSSProperties } from "react";

// Custom SVG mark + wordmark for DiffSentinel. Two diff bars (removed / added)
// crossed by a vertical scan line — the sentinel watching the diff.
export function Logo({
  showWordmark = true,
  size = 24,
  style,
}: {
  showWordmark?: boolean;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        color: "var(--text-primary)",
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          x="6"
          y="14"
          width="26"
          height="6"
          rx="1.5"
          fill="var(--diff-red)"
          fillOpacity="0.9"
        />
        <rect
          x="10"
          y="28"
          width="32"
          height="6"
          rx="1.5"
          fill="var(--diff-green)"
          fillOpacity="0.9"
        />
        <line
          x1="24"
          y1="4"
          x2="24"
          y2="44"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="24" cy="24" r="2.2" fill="var(--accent)" />
      </svg>
      {showWordmark && (
        <span
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontWeight: 600,
            letterSpacing: "-0.01em",
            fontSize: 15,
          }}
        >
          DiffSentinel
        </span>
      )}
    </span>
  );
}
