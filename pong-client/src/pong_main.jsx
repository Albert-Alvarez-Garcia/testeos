// pong_main.jsx · Punto de entrada. Apunta tu index.html a este fichero:
//   <script type="module" src="/src/pong_main.jsx"></script>
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./pong_styles.css";
import PongApp from "./pong_App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PongApp />
  </StrictMode>
);
