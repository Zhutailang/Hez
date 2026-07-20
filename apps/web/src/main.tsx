import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import "./index.css";

// Keep the app on localhost/127.0.0.1 so the browser treats it as a secure
// context (required for navigator.mediaDevices / getUserMedia). LiveKit media
// still connects to the LAN IP returned by the API token endpoint.
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>,
);
