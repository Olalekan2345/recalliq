"use client";

/**
 * Renders model-written text safely: no HTML is ever interpreted. Supports
 * paragraphs, "- " lists, `code`, **bold**, and [E3] evidence references
 * (turned into buttons). Anything else stays literal text.
 */
import { Fragment } from "react";

type Props = { text: string; onEvidence?: (ref: string) => void };

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[E\d{1,4}\](?:\[E\d{1,4}\])*)/g;

function Inline({ text, onEvidence }: Props) {
  const parts = text.split(TOKEN).filter((p) => p !== "");
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`"))
          return (
            <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] wrap-anywhere">
              {p.slice(1, -1)}
            </code>
          );
        if (/^\[E\d/.test(p)) {
          const refs = p.match(/E\d{1,4}/g) ?? [];
          return (
            <Fragment key={i}>
              {refs.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onEvidence?.(r)}
                  className="mx-0.5 inline-flex h-5 items-center rounded border border-border bg-accent px-1 align-baseline font-mono text-[0.75em] text-accent-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open evidence ${r}`}
                >
                  {r}
                </button>
              ))}
            </Fragment>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export function SafeText({ text, onEvidence }: Props) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm leading-6">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]!);
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={bi} className={ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
              {lines.map((l, li) => (
                <li key={li}>
                  <Inline text={l.replace(/^\s*([-*]|\d+\.)\s+/, "")} onEvidence={onEvidence} />
                </li>
              ))}
            </Tag>
          );
        }
        const heading = /^#{1,4}\s+(.*)$/.exec(lines[0] ?? "");
        if (heading && lines.length === 1) {
          return (
            <p key={bi} className="font-semibold">
              <Inline text={heading[1]!} onEvidence={onEvidence} />
            </p>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-wrap">
            <Inline text={block.replace(/^#{1,4}\s+/gm, "")} onEvidence={onEvidence} />
          </p>
        );
      })}
    </div>
  );
}
