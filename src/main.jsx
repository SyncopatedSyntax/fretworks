import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@fretworks/design/styles.css";
import Brochure from "./App.jsx";
import Launcher from "./Launcher.jsx";
import Backup from "./Backup.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* / = marketing brochure (new visitors) */}
        <Route path="/" element={<Brochure />} />
        {/* /app = fast launcher grid (regulars; PWA start_url) */}
        <Route path="/app" element={<Launcher />} />
        {/* /backup = one backup for the whole toolbox. It lives in the shell
            because every trainer is proxied onto this origin, so one sweep of
            localStorage already covers all of them. */}
        <Route path="/backup" element={<Backup />} />
        {/* Unknown shell paths fall back to the brochure */}
        <Route path="*" element={<Brochure />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
