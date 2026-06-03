import { createRoot } from "react-dom/client";
import { Terminal } from "@jalipalo/webmux";

createRoot(document.getElementById("root")!).render(
  <div style={{ height: "100vh" }}>
    <Terminal
      sessionId="demo"
      wsUrl={(id) => `ws://${location.host}/terminal/ws/${id}`}
      uploadEndpoint="/terminal/paste-image"
      onOpenLink={(l) =>
        l.type === "url"
          ? window.open(l.value, "_blank", "noopener,noreferrer")
          : alert(`open ${l.value}:${l.line ?? ""}`)
      }
    />
  </div>,
);
