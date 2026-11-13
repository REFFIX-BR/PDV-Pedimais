/**
 * Arquivo: src/site/main.tsx
 * Objetivo: abre a página pública do PDV-Pedimais, separada do caixa.
 * Entradas esperadas: espera o elemento #root em site.html.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PdvSitePage from "./PdvSitePage";
import "./site.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PdvSitePage />
  </StrictMode>,
);
