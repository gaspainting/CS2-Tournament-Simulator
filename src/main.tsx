import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppStoreProvider } from "./state/AppStore";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  </React.StrictMode>
);
