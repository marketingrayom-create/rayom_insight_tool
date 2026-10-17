import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./static/App.jsx";
import "./static/styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
