import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const marketingRoute = window.location.pathname === "/marketing" || window.location.pathname === "/marketing/";
const AppEntry = lazy(() => import("./App").then((module) => ({ default: module.App })));
const MarketingEntry = lazy(() => import("./marketing/MarketingPage").then((module) => ({ default: module.MarketingPage })));
const Entry = marketingRoute ? MarketingEntry : AppEntry;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}><Entry /></Suspense>
  </StrictMode>,
);
