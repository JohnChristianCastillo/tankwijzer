/** Entry point. Mounts the app and pulls in the stylesheets. */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";

import { App } from "./App";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/map.css";
import "./styles/stations.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("root element missing");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
