import { useMemo } from "react";

interface Heading {
  level: number;
  text: string;
}

function parseHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^(```|~~~)/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.+)/.exec(line);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].replace(/[*_`~[\]]/g, "").trim(),
      });
    }
  }
  return headings;
}

function scrollToHeading(index: number) {
  const els = document.querySelectorAll(
    ".editor-host .ProseMirror :is(h1,h2,h3,h4,h5,h6)"
  );
  els[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Outline({ content }: { content: string }) {
  const headings = useMemo(() => parseHeadings(content), [content]);

  return (
    <nav className="outline">
      <div className="outline-label">Outline</div>
      {headings.length === 0 ? (
        <div className="outline-empty">No headings yet</div>
      ) : (
        headings.map((h, i) => (
          <button
            key={`${i}-${h.text}`}
            className="outline-item"
            style={{ paddingLeft: 10 + (h.level - 1) * 12 }}
            onClick={() => scrollToHeading(i)}
            title={h.text}
          >
            {h.text}
          </button>
        ))
      )}
    </nav>
  );
}
