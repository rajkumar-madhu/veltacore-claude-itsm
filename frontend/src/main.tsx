import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { installDemo } from "./demo/installDemo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles.css";

const DEMO = import.meta.env.VITE_DEMO === "1";
if (DEMO) installDemo();
const Router = DEMO ? MemoryRouter : BrowserRouter;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 0, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </React.StrictMode>,
);
