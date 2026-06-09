import { useLayoutEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";

interface EditorProps {
  /** Initial markdown. Only read on mount — remount (via key) to swap docs. */
  defaultValue: string;
  onChange: (markdown: string) => void;
}

export default function Editor({ defaultValue, onChange }: EditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useLayoutEffect(() => {
    const crepe = new Crepe({
      root: rootRef.current!,
      defaultValue,
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        onChangeRef.current(markdown);
      });
    });

    crepe.create();

    return () => {
      crepe.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor-host" ref={rootRef} />;
}
