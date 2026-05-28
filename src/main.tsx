import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrate, pruneExpiredStories, tryAutoLoadLinkedFile } from "./lib/store";
import { initSimulation, runSimulationTick } from "./lib/simulation";

hydrate().finally(async () => {
  await tryAutoLoadLinkedFile().catch(() => {});
  pruneExpiredStories();
  await initSimulation();
  runSimulationTick();
  // Live drip: every 60s while the tab is open.
  setInterval(() => { runSimulationTick(); }, 60_000);
  createRoot(document.getElementById("root")!).render(<App />);
});
