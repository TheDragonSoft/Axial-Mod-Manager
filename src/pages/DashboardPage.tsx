import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpCircle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Compass,
  HardDrive,
  LayoutDashboard,
  Package,
  Play,
  RefreshCw,
  Settings as SettingsIcon,
  XCircle,
} from "lucide-react";
import {
  checkUpdates,
  getSettings,
  getStorageReport,
  isNetworkOrHttpError,
  listInstalled,
  listPacks,
  ping,
  validateModsDir,
} from "../lib/api";
import { formatBytes } from "../lib/format";
import { onInstalledChanged } from "../lib/events";
import type {
  InstalledSnapshot,
  ModsDirStatus,
  PackMeta,
  Settings,
  StorageReport,
  UpdatesReport,
} from "../types";
import { useAppStore } from "../store/useAppStore";
import {
  useActivityStore,
  type ActivityKind,
} from "../store/useActivityStore";
import PageHeader from "../components/ui/PageHeader";
import Panel, { IconTile } from "../components/ui/Panel";
import StatCard from "../components/ui/StatCard";
import StatusDot from "../components/ui/StatusDot";
import Spinner from "../components/ui/Spinner";
import Button from "../components/ui/Button";

function timeAgo(at: number): string {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const ACTIVITY_ICONS: Record<
  ActivityKind,
  { icon: typeof CheckCircle2; className: string }
> = {
  "download-completed": { icon: CheckCircle2, className: "text-accent" },
  "download-failed": { icon: XCircle, className: "text-red-400" },
  "pack-activated": { icon: Boxes, className: "text-[#DA9FF8]" },
  "updates-found": { icon: ArrowUpCircle, className: "text-amber-400" },
  "game-launched": { icon: Play, className: "text-accent" },
};

function StatusRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="text-sm text-stone-400">{label}</span>
      <div className="flex min-w-0 items-center gap-2 text-sm">{children}</div>
    </div>
  );
}

export default function DashboardPage() {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const updateCount = useAppStore((s) => s.updateCount);
  const setUpdateCount = useAppStore((s) => s.setUpdateCount);
  const updatesChecked = useAppStore((s) => s.updatesChecked);
  const setUpdatesChecked = useAppStore((s) => s.setUpdatesChecked);
  const activity = useActivityStore((s) => s.entries);
  const isFactorioDetected = useAppStore((s) => s.isFactorioDetected);
  const detectedGame = useAppStore((s) => s.detectedGame);
  const effectiveModsDir = useAppStore((s) => s.effectiveModsDir);
  const detectionChecked = useAppStore((s) => s.detectionChecked);

  const [snapshot, setSnapshot] = useState<InstalledSnapshot | null>(null);
  const [packs, setPacks] = useState<PackMeta[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dirStatus, setDirStatus] = useState<ModsDirStatus | null>(null);
  const [storageReport, setStorageReport] = useState<StorageReport | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [report, setReport] = useState<UpdatesReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateOffline, setUpdateOffline] = useState(false);

  const refreshInstalled = useCallback(() => {
    listInstalled()
      .then(setSnapshot)
      .catch(() => setSnapshot(null));
    // Orphan cleanup elsewhere (Settings) also fires installed-changed.
    getStorageReport()
      .then(setStorageReport)
      .catch(() => setStorageReport(null));
  }, []);

  useEffect(() => {
    setBackendOk(null);
    ping("dash")
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
    getSettings()
      .then((s) => setSettings(s))
      .catch(() => setSettings(null));
    refreshInstalled();
    listPacks()
      .then(setPacks)
      .catch(() => setPacks([]));
  }, [refreshInstalled]);

  // When effectiveModsDir or settings.modsDir is available, validate the mods directory
  useEffect(() => {
    const targetDir = settings?.modsDir || effectiveModsDir;
    if (targetDir) {
      validateModsDir(targetDir)
        .then(setDirStatus)
        .catch(() => setDirStatus(null));
    } else {
      setDirStatus(null);
    }
  }, [settings?.modsDir, effectiveModsDir]);

  // Downloads/toggles elsewhere keep the installed stats honest while visible.
  useEffect(() => {
    const unlisten = onInstalledChanged(() => refreshInstalled());
    return () => {
      void unlisten.then((f) => f());
    };
  }, [refreshInstalled]);

  const runUpdateCheck = useCallback(async () => {
    setChecking(true);
    setUpdateOffline(false);
    try {
      const r = await checkUpdates();
      setReport(r);
      setUpdateCount(r.updates.length);
      setUpdatesChecked(true);
      if (r.updates.length > 0) {
        useActivityStore
          .getState()
          .push(
            "updates-found",
            `${r.updates.length} update${r.updates.length === 1 ? "" : "s"} available`,
            `target Factorio ${r.target}`,
          );
      }
    } catch (e) {
      if (isNetworkOrHttpError(e)) {
        setUpdateOffline(true);
      }
    } finally {
      setChecking(false);
    }
  }, [setUpdateCount, setUpdatesChecked]);

  // Auto-check once per session, never blocking the page.
  const checkStarted = useRef(false);
  useEffect(() => {
    if (!updatesChecked && !checkStarted.current) {
      checkStarted.current = true;
      void runUpdateCheck();
    }
  }, [updatesChecked, runUpdateCheck]);

  const enabledCount = snapshot?.mods.filter((m) => m.enabled).length ?? 0;
  const problemCount = snapshot?.mods.filter((m) => m.problem).length ?? 0;
  const orphanCount = storageReport?.orphans.length ?? 0;
  const totalPackMods = packs.reduce((n, p) => n + p.modCount, 0);
  const downloadsDone = activity.filter(
    (a) => a.kind === "download-completed",
  ).length;
  const downloadsFailed = activity.filter(
    (a) => a.kind === "download-failed",
  ).length;
  const packsActivated = activity.filter(
    (a) => a.kind === "pack-activated",
  ).length;

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Monitor and manage your Factorio mod setup"
        actions={
          <Button variant="secondary" onClick={() => void runUpdateCheck()} disabled={checking}>
            {checking ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        }
      />

      {/* Factorio not found alert banner */}
      {detectionChecked && isFactorioDetected === false && (
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-amber-900/60 bg-amber-950/30 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-stone-200">Factorio not found</p>
              <p className="text-xs text-stone-400">
                Set your mods folder in Settings to manage installed mods, updates, and packs.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setActiveTab("settings")} className="shrink-0">
            Open Settings
          </Button>
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Installed Mods"
          icon={Package}
          iconTone="blue"
          value={isFactorioDetected === false ? "—" : snapshot ? snapshot.mods.length : "—"}
          sub={
            isFactorioDetected === false
              ? "Factorio not found — set in Settings"
              : snapshot
              ? `${enabledCount} enabled${problemCount > 0 ? ` · ${problemCount} problem(s)` : ""}`
              : "loading mods…"
          }
          onClick={() => setActiveTab(isFactorioDetected === false ? "settings" : "installed")}
        />
        <StatCard
          label="Updates"
          icon={ArrowUpCircle}
          iconTone="green"
          value={
            checking ? (
              <Spinner className="h-7 w-7 text-stone-400" />
            ) : isFactorioDetected === false ? (
              "—"
            ) : (
              (updateCount ?? "—")
            )
          }
          sub={
            isFactorioDetected === false
              ? "Factorio not found"
              : updateOffline
              ? "can't reach the portal"
              : report
              ? `${report.upToDate.length} up to date${report.errors.length > 0 ? ` · ${report.errors.length} error(s)` : ""}`
              : "not checked yet"
          }
          onClick={() => setActiveTab(isFactorioDetected === false ? "settings" : "installed")}
        />
        <StatCard
          label="Mod Packs"
          icon={Boxes}
          iconTone="violet"
          value={packs.length}
          sub={`${totalPackMods} mods across packs`}
          onClick={() => setActiveTab("packs")}
        />
        <StatCard
          label="Mods Storage"
          icon={HardDrive}
          iconTone="orange"
          value={
            isFactorioDetected === false ? (
              "—"
            ) : storageReport ? (
              formatBytes(storageReport.totalSizeBytes)
            ) : (
              "—"
            )
          }
          sub={
            isFactorioDetected === false
              ? "Factorio not found — set in Settings"
              : storageReport
              ? `${orphanCount === 0 ? "no orphans" : `${orphanCount} orphan${orphanCount === 1 ? "" : "s"}`} · ${storageReport.zipCount} zip${storageReport.zipCount === 1 ? "" : "s"}`
              : "measuring…"
          }
          onClick={() => {
            // Deep-link straight to Settings → Storage.
            useAppStore.getState().setSettingsSection("storage");
            setActiveTab("settings");
          }}
        />
      </div>

      {/* Status + activity */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          icon={LayoutDashboard}
          iconTone="green"
          title="System Status"
          subtitle="Live view of your setup"
          className="xl:col-span-2"
        >
          <div className="divide-y divide-line">
            <StatusRow label="Backend">
              {backendOk === null ? (
                <Spinner className="text-stone-400" />
              ) : backendOk ? (
                <>
                  <StatusDot tone="green" />
                  <span className="text-stone-300">Operational</span>
                </>
              ) : (
                <>
                  <StatusDot tone="red" />
                  <span className="text-red-400">Unreachable</span>
                </>
              )}
            </StatusRow>
            <StatusRow label="Mods directory">
              {isFactorioDetected === false ? (
                <>
                  <StatusDot tone="amber" />
                  <button
                    className="text-amber-400 hover:underline"
                    onClick={() => setActiveTab("settings")}
                  >
                    Factorio not found — set your mods folder in Settings
                  </button>
                </>
              ) : effectiveModsDir && dirStatus?.writable ? (
                <>
                  <StatusDot tone="green" />
                  <span className="truncate font-mono text-xs text-stone-300" title={effectiveModsDir}>
                    {effectiveModsDir}
                  </span>
                  {!settings?.modsDir && (
                    <span className="text-stone-400 font-sans text-xs">(auto-detected)</span>
                  )}
                </>
              ) : effectiveModsDir ? (
                <>
                  <StatusDot tone="red" />
                  <span className="truncate font-mono text-xs text-red-400" title={effectiveModsDir}>
                    {effectiveModsDir}
                  </span>
                </>
              ) : (
                <>
                  <StatusDot tone="amber" />
                  <button
                    className="text-amber-400 hover:underline"
                    onClick={() => setActiveTab("settings")}
                  >
                    Not configured — set it in Settings
                  </button>
                </>
              )}
            </StatusRow>
            <StatusRow label="Factorio install">
              {detectedGame ? (
                <>
                  <StatusDot tone="green" />
                  <span className="text-stone-300">
                    {detectedGame.version ?? "unknown version"}{" "}
                    <span className="text-stone-400">via {detectedGame.source}</span>
                  </span>
                </>
              ) : (
                <>
                  <StatusDot tone="amber" />
                  <button
                    className="text-amber-400 hover:underline"
                    onClick={() => setActiveTab("settings")}
                  >
                    Not detected — configure in Settings
                  </button>
                </>
              )}
            </StatusRow>
            <StatusRow label="Target version">
              <span className="text-stone-300">
                Factorio {settings?.targetFactorioVersion ?? "—"}
              </span>
              {detectedGame?.targetVersion ? (
                <span className="text-stone-400">(detected)</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab("settings")}
                  className="text-stone-400 hover:text-stone-300 underline decoration-stone-700 transition-colors"
                >
                  (set your game folder)
                </button>
              )}
            </StatusRow>
          </div>
        </Panel>

        <Panel
          icon={RefreshCw}
          iconTone="violet"
          title="Recent Activity"
          subtitle="This session"
        >
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-400">
              Nothing yet — downloads and pack activations show up here.
            </p>
          ) : (
            <ul className="space-y-3">
              {activity.slice(0, 8).map((a) => {
                const { icon: Icon, className } = ACTIVITY_ICONS[a.kind];
                return (
                  <li key={a.id} className="flex items-start gap-2.5">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-stone-300" title={a.label}>{a.label}</p>
                      <p className="text-xs text-stone-400">
                        {a.detail ? `${a.detail} · ` : ""}
                        {timeAgo(a.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Bottom row */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          icon={Compass}
          iconTone="blue"
          title="Quick Links"
          subtitle="Jump straight in"
        >
          <div className="space-y-2">
            {(
              [
                { label: "Browse mods", tab: "browse", icon: Compass },
                { label: "Installed mods", tab: "installed", icon: Package },
                { label: "Mod packs", tab: "packs", icon: Boxes },
                { label: "Settings", tab: "settings", icon: SettingsIcon },
              ] as const
            ).map(({ label, tab, icon: Icon }) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-stone-300 transition-colors hover:border-stone-600 hover:text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Icon className="h-4 w-4 text-stone-400" />
                <span className="flex-1 text-left">{label}</span>
                <ChevronRight className="h-4 w-4 text-stone-400" />
              </button>
            ))}
          </div>
        </Panel>

        <Panel
          icon={HardDrive}
          iconTone="green"
          title="Storage"
          subtitle="Where your mods live"
        >
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-stone-400">Mods directory</p>
              <p className="mt-0.5 truncate font-mono text-xs text-stone-300">
                {isFactorioDetected === false ? (
                  <span className="text-amber-400 font-sans">Factorio not found — set in Settings</span>
                ) : (
                  <>
                    <span title={effectiveModsDir ?? settings?.modsDir ?? undefined}>
                      {effectiveModsDir ?? settings?.modsDir ?? "not configured"}
                    </span>
                    {!settings?.modsDir && effectiveModsDir && (
                      <span className="text-stone-400 font-sans"> (auto-detected)</span>
                    )}
                  </>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="text-lg font-bold text-stone-200">
                  {isFactorioDetected === false ? "—" : dirStatus?.zipCount ?? "—"}
                </p>
                <p className="text-xs text-stone-400">mod zips</p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="flex items-center gap-1.5 text-lg font-bold text-stone-200">
                  {isFactorioDetected === false ? (
                    "—"
                  ) : dirStatus ? (
                    dirStatus.hasModList ? (
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                    ) : (
                      <XCircle className="h-4 w-4 text-amber-400" />
                    )
                  ) : (
                    "—"
                  )}
                </p>
                <p className="text-xs text-stone-400">mod-list.json</p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          icon={ArrowUpCircle}
          iconTone="orange"
          title="Session"
          subtitle="Since the app started"
        >
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <p className="text-2xl font-bold text-accent">{downloadsDone}</p>
              <p className="text-xs text-stone-400">downloaded</p>
            </div>
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <p className="text-2xl font-bold text-red-400">
                {downloadsFailed}
              </p>
              <p className="text-xs text-stone-400">failed</p>
            </div>
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <p className="text-2xl font-bold text-[#DA9FF8]">
                {packsActivated}
              </p>
              <p className="text-xs text-stone-400">packs activated</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3">
            <IconTile
              icon={Package}
              tone="green"
              size="sm"
              className="bg-accent/10 text-accent"
            />
            <p className="text-xs text-stone-400">
              Tip: use{" "}
              <button
                className="text-stone-300 underline decoration-stone-700 hover:text-stone-100"
                onClick={() => setActiveTab("packs")}
              >
                packs
              </button>{" "}
              to snapshot your current mod set or import one from a friend.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
