import "@fontsource-variable/inter";
import "@fontsource-variable/literata";
import "./index.css";
import "./screens.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { api } from "./lib/api";
import { applyAppearance, loadSkin } from "./theme";

// Antes del primer pintado, para no mostrar un destello con el estilo equivocado.
applyAppearance(loadSkin(), "system");

// Con los efectos de transparencia de Windows apagados, el acrílico es gris opaco: fondo sólido.
// Solo desarrollo: ?solid pinta el panel sin transparencia, para capturas fieles fuera de Tauri.
const solid = import.meta.env.DEV && new URLSearchParams(window.location.search).has("solid");
api.transparencyEnabled().then(
  (on) => document.documentElement.classList.toggle("no-glass", !on || solid),
  () => undefined,
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
