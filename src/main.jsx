import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@fretworks/design/styles.css";
import Brochure from "./App.jsx";
import Launcher from "./Launcher.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* / = marketing brochure (new visitors) */}
        <Route path="/" element={<Brochure />} />
        {/* /app = fast launcher grid (regulars; PWA start_url) */}
        <Route path="/app" element={<Launcher />} />
        {/* Unknown shell paths fall back to the brochure */}
        <Route path="*" element={<Brochure />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
