import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";

export const FILE_LINK_RE =
  /(\/workspace\/)?([\w.\-/]*\w+\.(?:tsx?|jsx?|mjs|cjs|json|md|html?|s?css|sass|less|ya?ml|toml|xml|sh|bash|zsh|py|go|rs|java|kt|swift|cpp?|cc|hpp?|rb|php|sql|conf|ini|env|lock|txt|log|cs|csproj|sln|vbproj|vue|svelte|astro|razor|cshtml|aspx|gradle|properties|dockerfile))(?![a-zA-Z0-9])(?::(\d+)(?::(?=(\d+)))?)?/gi;

export interface ParsedFileLink {
  value: string;
  line?: number;
  col?: number;
  index: number;
  length: number;
}

// Find the FIRST file link in a line of text (helper used by tests + the provider).
export function parseFileLink(text: string): ParsedFileLink | null {
  FILE_LINK_RE.lastIndex = 0;
  const m = FILE_LINK_RE.exec(text);

  if (!m) return null;

  return {
    value: m[2],
    line: m[3] ? Number(m[3]) : undefined,
    col: m[4] ? Number(m[4]) : undefined,
    index: m.index,
    length: m[0].length,
  };
}

export type OnOpenLink = (l: {
  type: "url" | "file";
  value: string;
  line?: number;
  col?: number;
}) => void;

export function fileLinkProvider(
  term: Terminal,
  onOpen: OnOpenLink,
  pattern = FILE_LINK_RE,
): ILinkProvider {
  return {
    provideLinks(y, callback) {
      const line = term.buffer.active.getLine(y - 1);

      if (!line) return callback(undefined);
      const text = line.translateToString(true);
      const links: ILink[] = [];

      pattern.lastIndex = 0;

      for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
        const full = m[0];
        const captured = m;

        links.push({
          range: {
            start: { x: captured.index + 1, y },
            end: { x: captured.index + full.length, y },
          },
          text: full,
          activate: (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            onOpen({
              type: "file",
              value: captured[2],
              line: captured[3] ? Number(captured[3]) : undefined,
              col: captured[4] ? Number(captured[4]) : undefined,
            });
          },
        });
      }

      callback(links.length ? links : undefined);
    },
  };
}

// Handler for WebLinksAddon: modifier-click opens URLs (default: a new window).
export const webLinksHandler = (onOpen?: OnOpenLink) => (event: MouseEvent, uri: string) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (onOpen) onOpen({ type: "url", value: uri });
  else window.open(uri, "_blank", "noopener,noreferrer");
};
