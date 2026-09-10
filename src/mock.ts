// ============================================================
// MOCK DATA — deleted/replaced in Phases 4–6.
// Everything the UI renders before the backend is wired lives here.
// ============================================================

import type { InstalledMod, ModSummary } from "./types";

export const MOCK_MODS: ModSummary[] = [
  {
    name: "krastorio2",
    title: "Krastorio 2",
    downloads: 1_842_000,
    latestVersion: "1.8.1",
    factorioVersion: "2.0",
    summary:
      "A major overhaul adding new buildings, resources, technologies, power systems, and a fully reworked tech tree.",
  },
  {
    name: "space-exploration",
    title: "Space Exploration",
    downloads: 2_104_000,
    latestVersion: "0.6.128",
    factorioVersion: "1.1",
    summary:
      "A large-scale exploration and production overhaul across multiple planets, moons, and deep-space structures.",
  },
  {
    name: "seablock",
    title: "Sea Block",
    downloads: 612_000,
    latestVersion: "1.2.4",
    factorioVersion: "1.1",
    summary:
      "Start on a tiny patch of land in an endless ocean and build everything from raw seawater. A famously brutal overhaul.",
  },
  {
    name: "aai-industry",
    title: "AAI Industry",
    downloads: 1_101_000,
    latestVersion: "0.5.31",
    factorioVersion: "2.0",
    summary:
      "Rewrites the early game with alternative power, modular logistics, and a grounded industrial progression.",
  },
  {
    name: "boblibrary",
    title: "Bob's Functions Library",
    downloads: 1_402_000,
    latestVersion: "2.1.0",
    factorioVersion: "2.0",
    summary:
      "Shared library required by all of Bob's mods. Provides common functions, events, and technologies.",
  },
  {
    name: "angelsrefining",
    title: "Angel's Refining",
    downloads: 986_000,
    latestVersion: "0.12.4",
    factorioVersion: "2.0",
    summary:
      "Replaces ore patches with six mixed ores that must be refined and processed through multi-stage production chains.",
  },
  {
    name: "pycoalprocessing",
    title: "Pyanodons Coal Processing",
    downloads: 421_000,
    latestVersion: "0.7.9",
    factorioVersion: "2.0",
    summary:
      "The entry point to the Pyanodon suite: deeply complex coal, tar, and gas processing chains. Not for the faint of heart.",
  },
  {
    name: "waterfill",
    title: "Waterfill",
    downloads: 3_318_000,
    latestVersion: "1.3.2",
    factorioVersion: "2.0",
    summary:
      "Adds a placeable water item so you can create water tiles anywhere. A ubiquitous quality-of-life utility.",
  },
  {
    name: "even-distribution",
    title: "Even Distribution",
    downloads: 1_655_000,
    latestVersion: "1.0.0",
    factorioVersion: "2.0",
    summary:
      "Makes inserters balance items evenly across output targets instead of round-robin. Invisible, invaluable polish.",
  },
  {
    name: "factoryplanner",
    title: "Factory Planner",
    downloads: 784_000,
    latestVersion: "1.3.11",
    factorioVersion: "2.0",
    summary:
      "Design and optimize production ratios in-game with a powerful visual planner, independent of your actual factory.",
  },
];

export const MOCK_INSTALLED: InstalledMod[] = [
  { name: "krastorio2", version: "1.8.1", enabled: true, factorioVersion: "2.0" },
  { name: "aai-industry", version: "0.5.31", enabled: true, factorioVersion: "2.0" },
  { name: "boblibrary", version: "2.1.0", enabled: true, factorioVersion: "2.0" },
  { name: "even-distribution", version: "1.0.0", enabled: false, factorioVersion: "2.0" },
  { name: "space-exploration", version: "0.6.128", enabled: false, factorioVersion: "1.1" },
];
