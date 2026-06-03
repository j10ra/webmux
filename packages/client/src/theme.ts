import type { ITheme } from "@xterm/xterm";

// VSCode Dark+ / Light+ 16-color ANSI palettes.
export const DARK: ITheme = {
  background: "#1e1e1e",
  foreground: "#cccccc",
  cursor: "#cccccc",
  selectionBackground: "#264f78",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};
export const LIGHT: ITheme = {
  background: "#ffffff",
  foreground: "#333333",
  cursor: "#333333",
  selectionBackground: "#add6ff",
  black: "#000000",
  red: "#cd3131",
  green: "#107c10",
  yellow: "#949800",
  blue: "#0451a5",
  magenta: "#bc05bc",
  cyan: "#0598bc",
  white: "#555555",
  brightBlack: "#666666",
  brightRed: "#cd3131",
  brightGreen: "#14ce14",
  brightYellow: "#b5ba00",
  brightBlue: "#0451a5",
  brightMagenta: "#bc05bc",
  brightCyan: "#0598bc",
  brightWhite: "#a5a5a5",
};
export const themeFor = (): ITheme =>
  document.documentElement.classList.contains("dark") ? DARK : LIGHT;

// Calls back whenever the `dark` class on <html> toggles; returns a disposer.
export function observeTheme(onChange: (t: ITheme) => void): () => void {
  const obs = new MutationObserver(() => onChange(themeFor()));

  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  return () => obs.disconnect();
}
