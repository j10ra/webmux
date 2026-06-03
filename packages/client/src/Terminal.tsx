import { useEffect, useRef, useState, type ReactNode } from "react";
import { Terminal as Xterm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { themeFor, observeTheme } from "./theme.js";
import { writeClipboard, clipboardProvider } from "./clipboard.js";
import { imageMime, uploadImage } from "./image.js";
import { previewImage, Lightbox } from "./image-ui.js";
import { fileLinkProvider, webLinksHandler, type OnOpenLink } from "./links.js";
import { decideKey } from "./keybindings.js";

export interface TerminalProps {
  sessionId: string;
  wsUrl: (sessionId: string) => string;
  uploadEndpoint?: string; // enables image paste/drop
  onOpenLink?: OnOpenLink;
  theme?: "auto" | { light: ITheme; dark: ITheme };
  notify?: (content: ReactNode | string) => void;
  fontFamily?: string;
  fontSize?: number;
  scrollback?: number;
  // Scroll the viewport to the bottom on user input. Default true (xterm's default). Set false with
  // mouse passthrough, where a click/drag emits a mouse-report that counts as input and would
  // otherwise yank the viewport to the bottom whenever you click while scrolled up.
  scrollOnUserInput?: boolean;
}

export function Terminal(props: TerminalProps) {
  const { sessionId, wsUrl, uploadEndpoint, onOpenLink, notify } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const [expand, setExpand] = useState<File | null>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const term = new Xterm({
      cursorBlink: true,
      fontSize: props.fontSize ?? 13,
      fontFamily: props.fontFamily ?? "Consolas, Menlo, Monaco, 'Courier New', monospace",
      theme:
        props.theme && props.theme !== "auto"
          ? document.documentElement.classList.contains("dark")
            ? props.theme.dark
            : props.theme.light
          : themeFor(),
      macOptionClickForcesSelection: true,
      scrollback: props.scrollback ?? 20000,
      scrollOnUserInput: props.scrollOnUserInput ?? true,
      allowProposedApi: true,
    });
    const fit = new FitAddon();

    term.loadAddon(fit);
    term.loadAddon(new ClipboardAddon(undefined, clipboardProvider));
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
    term.loadAddon(new WebLinksAddon(webLinksHandler(onOpenLink)));
    if (onOpenLink) term.registerLinkProvider(fileLinkProvider(term, onOpenLink));
    term.open(host);

    try {
      term.loadAddon(new WebglAddon());
    } catch {
      /* canvas/DOM fallback */
    }

    term.focus();

    const disposeTheme = observeTheme((t) => {
      term.options.theme = t;
    });

    const ws = new WebSocket(wsUrl(sessionId));

    ws.onmessage = (e) => {
      const data = typeof e.data === "string" ? e.data : "";

      if (!data) return;
      if (term.hasSelection()) {
        const top = term.buffer.active.viewportY;

        term.write(data, () => {
          if (term.hasSelection()) term.scrollToLine(top);
        });
      } else term.write(data);
    };

    term.onData((d) => ws.readyState === ws.OPEN && ws.send(d));

    term.attachCustomKeyEventHandler((e) => {
      const d = decideKey(e, term.hasSelection());

      if (d.action === "passthrough") return true;
      if (d.action === "copy") void writeClipboard(term.getSelection());
      if (d.action === "send") {
        if (ws.readyState === ws.OPEN) ws.send(d.data);
        e.preventDefault();
      }
      // copy/paste ("none"): return false so xterm ignores the key, but do NOT preventDefault —
      // cancelling the Cmd/Ctrl+V keydown default would also suppress the browser `paste` event
      // that onPaste depends on (text and image paste both flow through it).
      return false;
    });

    const copyOnMouseUp = () => {
      const s = term.getSelection();

      if (s) void writeClipboard(s);
    };

    host.addEventListener("mouseup", copyOnMouseUp);
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    host.addEventListener("contextmenu", onContextMenu);

    const injectImage = (file: File) => {
      if (!uploadEndpoint || !imageMime(file)) return false;
      void uploadImage(file, uploadEndpoint).then((p) => {
        if (p) {
          term.paste(p);
          previewImage(file, notify, setExpand);
        }
      });

      return true;
    };

    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (items)
        for (let i = 0; i < items.length; i++) {
          const it = items[i];

          if (it.kind === "file") {
            const f = it.getAsFile();

            if (f && injectImage(f)) {
              e.preventDefault();
              e.stopPropagation();

              return;
            }
          }
        }

      const text = e.clipboardData?.getData("text/plain");

      if (text) {
        e.preventDefault();
        e.stopPropagation();
        term.paste(text);
      }
    };

    const onDrop = (e: DragEvent) => {
      const imgs = Array.from(e.dataTransfer?.files ?? []).filter((f) => imageMime(f));

      if (!imgs.length) return;
      e.preventDefault();
      e.stopPropagation();
      imgs.forEach(injectImage);
    };

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };

    host.addEventListener("paste", onPaste, true);
    host.addEventListener("drop", onDrop, true);
    host.addEventListener("dragover", onDragOver, true);

    let disposed = false;
    const sendResize = () => {
      if (disposed) return;
      fit.fit();
      if (ws.readyState === ws.OPEN) ws.send(`\x00resize:${term.cols},${term.rows}`);
    };

    ws.onopen = sendResize;
    const ro = new ResizeObserver(sendResize);

    ro.observe(host);
    // Cell metrics aren't ready at mount: the web font loads asynchronously and the WebGL renderer
    // measures cell size only on its first frame(s). A single early fit therefore computes the wrong
    // column count ("cut off" width) and the pane stays mis-sized until a resize forces a re-fit —
    // notably when opening a terminal into an already-laid-out page (a new tab), where no resize
    // follows. So re-fit on every readiness signal: next frame, font load, and two short delays to
    // catch the renderer/layout settling. Each is idempotent and cheap.
    const initialFit = requestAnimationFrame(sendResize);
    const fitTimers = [setTimeout(sendResize, 120), setTimeout(sendResize, 350)];

    void document.fonts?.ready?.then(sendResize);

    return () => {
      disposed = true;
      host.removeEventListener("mouseup", copyOnMouseUp);
      host.removeEventListener("contextmenu", onContextMenu);
      host.removeEventListener("paste", onPaste, true);
      host.removeEventListener("drop", onDrop, true);
      host.removeEventListener("dragover", onDragOver, true);
      cancelAnimationFrame(initialFit);
      fitTimers.forEach(clearTimeout);
      disposeTheme();
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <>
      <div style={{ height: "100%", width: "100%" }} ref={hostRef} />
      <Lightbox file={expand} onClose={() => setExpand(null)} />
    </>
  );
}
