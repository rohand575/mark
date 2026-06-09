import { useMemo } from "react";

interface Heading {
  level: number;
  text: string;
}

const cleanText = (s: string) => s.replace(/[*_`~[\]]/g, "").trim();

// Indices must stay aligned with the h1–h6 elements the editor renders, so
// blockquoted ATX headings and setext headings are included too.
function parseHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  let fenceChar: string | null = null;
  let prevParagraph: string | null = null;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    const fence = /^(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const char = fence[1][0];
      if (!fenceChar) fenceChar = char;
      else if (char === fenceChar) fenceChar = null;
      prevParagraph = null;
      continue;
    }
    if (fenceChar) continue;

    const stripped = line.replace(/^(>\s*)+/, "");
    const atx = /^(#{1,6})\s+(.+)/.exec(stripped);
    if (atx) {
      headings.push({ level: atx[1].length, text: cleanText(atx[2]) });
      prevParagraph = null;
      continue;
    }

    // Setext: a ===/--- underline directly below a paragraph line.
    if (prevParagraph && /^(=+|-+)\s*$/.test(line)) {
      headings.push({
        level: line[0] === "=" ? 1 : 2,
        text: cleanText(prevParagraph),
      });
      prevParagraph = null;
      continue;
    }

    // Only plain paragraph lines can carry a setext underline (not blanks,
    // list items, blockquotes, or headings).
    prevParagraph =
      stripped && !/^([-*+>#]|\d+[.)])/.test(stripped) ? stripped : null;
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
