import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Suppress the webview's default right-click menu (Back / Refresh / Print /
// More tools) — it reads as browser chrome inside the app. Editable fields
// keep the native menu so right-click copy/paste still works.
document.addEventListener("contextmenu", (e) => {
  const t = e.target;
  const editable =
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLElement && t.isContentEditable);
  if (!editable) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
