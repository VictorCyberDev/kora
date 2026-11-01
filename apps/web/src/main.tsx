import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./AppV6";
import { AuthProvider } from "./auth";
import "./styles.css";
import "./brand-v3.css";
import "./brand-v5.css";
import "./builder-v5.css";
import "./studio-v5.css";
import "./mobile-v5.css";
import "./landing-v6.css";
import "./landing-v6-layout.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
