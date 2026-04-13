import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PaulyPocket from "./PaulyPocket.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PaulyPocket />
  </StrictMode>
);
