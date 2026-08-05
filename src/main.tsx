import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { isBetaExpired } from "./platform/betaExpiry";
import "./styles.css";

const marketingRoute = window.location.pathname === "/marketing" || window.location.pathname === "/marketing/";
const desktopAuthRoute = window.location.pathname === "/desktop-auth" || window.location.pathname === "/desktop-auth/";
const AppEntry = lazy(() => import("./App").then((module) => ({ default: module.App })));
const MarketingEntry = lazy(() => import("./marketing/MarketingPage").then((module) => ({ default: module.MarketingPage })));
const DesktopAuthEntry = lazy(() => import("./DesktopAuthPage").then((module) => ({ default: module.DesktopAuthPage })));
const BetaExpiredEntry = lazy(() => import("./components/BetaExpiredScreen").then((module) => ({ default: module.BetaExpiredScreen })));
const Entry = desktopAuthRoute ? DesktopAuthEntry : marketingRoute ? MarketingEntry : isBetaExpired() ? BetaExpiredEntry : AppEntry;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}><Entry /></Suspense>
  </StrictMode>,
);
