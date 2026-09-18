import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  OctagonX,
  Puzzle,
  TriangleAlert,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  enqueueDownload,
  getModDetails,
  getSettings,
  isNetworkOrHttpError,
  resolveInstallPlan,
  toAppError,
} from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import { useQueueStore } from "../store/useQueueStore";
import { useThumbnails, useThumbnailUrl } from "../lib/thumbnails";
import { compareVersions, formatBytes } from "../lib/format";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import ModTile from "./ui/ModTile";
import Modal from "./ui/Modal";
import Select from "./ui/Select";
import Spinner from "./ui/Spinner";
import Toggle from "./ui/Toggle";
import type { AppError, ModDetails, ModRelease, ModSummary, ResolutionPlan } from "../types";

function pickLatestCompatible(
  releases: ModRelease[],
  target: string,
): string | null {
  const matching = releases.filter((r) => r.factorioVersion === target);
  const pool = matching.length > 0 ? matching : releases;
  const sorted = [...pool].sort((a, b) => compareVersions(b.version, a.version));
  return sorted[0]?.version ?? null;
}

function DepCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        checked
          ? "border-accent bg-accent text-stone-950"
          : "border-stone-600 hover:border-stone-500"
      }`}
    >
      {checked && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}

function KeyValue({ label, mono, children }: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-stone-400">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-sm text-stone-200 ${mono ? "font-mono text-xs" : ""}`}
        title={typeof children === "string" ? children : undefined}
      >
        {children}
      </span>
    </div>
  );
}

function DepRow({
  name,
  version,
  badge,
  badgeTone,
  note,
  checked,
  onToggle,
}: {
  name: string;
  version?: string;
  badge: string;
  badgeTone: "red" | "neutral";
  note?: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
}) {
  const thumbnail = useThumbnailUrl(name);
  return (
    <li
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        checked ? "border-stone-600 bg-surface-2" : "border-line bg-surface"
      }`}
    >
      <ModTile name={name} url={thumbnail} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-stone-200">{name}</p>
          <Badge tone={badgeTone}>{badge}</Badge>
        </div>
        <p className="truncate font-mono text-[11px] text-stone-400">
          {version ? `v${version}` : "version picked at install time"}
          {note && ` · ${note}`}
        </p>
      </div>
      <DepCheck checked={checked} onChange={onToggle} label={`Include ${name}`} />
    </li>
  );
}

/**
 * Modrinth-style install dialog: pick the release, review the dependency
 * tree the resolver produced, check the target file facts, then queue
 * everything. Opened from the mod cards' Install button instead of
 * enqueueing directly.
 */
export default function InstallModal({
  mod,
  onClose,
}: {
  mod: ModSummary;
  onClose: () => void;
}) {
  const isFactorioDetected = useAppStore((s) => s.isFactorioDetected);
  const effectiveModsDir = useAppStore((s) => s.effectiveModsDir);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const openQueue = useQueueStore((s) => s.open);

  const [details, setDetails] = useState<ModDetails | null>(null);
  const [detailsError, setDetailsError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState("2.0");
  const [modsDir, setModsDir] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [plan, setPlan] = useState<ResolutionPlan | null>(null);
  const [planError, setPlanError] = useState<AppError | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState(false);
  const [enqueueErrors, setEnqueueErrors] = useState<string[]>([]);

  const loadDetails = useCallback(() => {
    setLoading(true);
    setDetailsError(null);
    Promise.all([getModDetails(mod.name), getSettings()])
      .then(([d, s]) => {
        setDetails(d);
        setTarget(s.targetFactorioVersion);
        setModsDir(s.modsDir);
        setSelectedVersion((v) => v ?? pickLatestCompatible(d.releases, s.targetFactorioVersion));
      })
      .catch((e) => setDetailsError(toAppError(e)))
      .finally(() => setLoading(false));
  }, [mod.name]);

  useEffect(loadDetails, [loadDetails]);

  const releases = useMemo(
    () =>
      details
        ? [...details.releases].sort((a, b) => compareVersions(b.version, a.version))
        : [],
    [details],
  );
  const selectedRelease =
    releases.find((r) => r.version === selectedVersion) ?? null;

  // The plan is version-dependent — re-resolve whenever the pick changes.
  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const p = await resolveInstallPlan(mod.name, selectedVersion ?? undefined);
      setPlan(p);
      // Required dependencies pre-checked; optionals start unchecked.
      setSelected(
        new Set(p.toInstall.filter((e) => e.requiredBy !== "").map((e) => e.name)),
      );
    } catch (e) {
      setPlan(null);
      setPlanError(toAppError(e));
    } finally {
      setPlanLoading(false);
    }
  }, [mod.name, selectedVersion]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const requiredDeps = plan?.toInstall.filter((e) => e.requiredBy !== "") ?? [];
  useThumbnails([mod.name, ...requiredDeps.map((d) => d.name)]);

  const hasConflicts = (plan?.conflicts.length ?? 0) > 0;
  const selectedCount = 1 + selected.size;

  function toggleDep(name: string, v: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  async function install() {
    if (!plan || !selectedVersion) return;
    setInstalling(true);
    setEnqueueErrors([]);
    const errors: string[] = [];
    try {
      await enqueueDownload(mod.name, selectedVersion, selectedRelease?.sha1 ?? null);
    } catch (e) {
      const err = toAppError(e);
      if (err.kind === "not_found") {
        errors.push("Factorio not found — set your mods folder in Settings.");
      } else {
        errors.push(`${mod.name}: ${err.message}`);
      }
    }
    for (const dep of requiredDeps) {
      if (!selected.has(dep.name)) continue;
      try {
        await enqueueDownload(dep.name, dep.version);
      } catch (e) {
        const err = toAppError(e);
        if (err.kind === "not_found") {
          errors.push("Factorio not found — set your mods folder in Settings.");
        } else {
          errors.push(`${dep.name}: ${err.message}`);
        }
      }
    }
    // Optionals have no resolver-provided version — pick latest compatible.
    for (const optName of plan.optional) {
      if (!selected.has(optName)) continue;
      try {
        const d = await getModDetails(optName);
        const v = pickLatestCompatible(d.releases, plan.target);
        if (v) await enqueueDownload(optName, v, d.releases.find((r) => r.version === v)?.sha1 ?? null);
        else errors.push(`${optName}: no compatible release found`);
      } catch (e) {
        const err = toAppError(e);
        if (err.kind === "not_found") {
          errors.push("Factorio not found — set your mods folder in Settings.");
        } else {
          errors.push(`${optName}: ${err.message}`);
        }
      }
    }
    setInstalling(false);
    if (errors.length > 0) {
      setEnqueueErrors(errors);
    } else {
      // Auto-close the modal and open the queue drawer on successful queue submission
      onClose();
      openQueue();
    }
  }

  const depCount = requiredDeps.length + (plan?.optional.length ?? 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          {mod.title}
          <Badge>MOD</Badge>
          {selectedRelease && selectedRelease.factorioVersion === target && (
            <Badge tone="green">✓ Factorio {target}</Badge>
          )}
        </span>
      }
      subtitle={
        details?.owner
          ? `by ${details.owner}${details.downloads !== null ? ` · ${details.downloads.toLocaleString()} downloads` : ""}`
          : mod.name
      }
      icon={<ModTile name={mod.name} url={details?.thumbnail} size="lg" />}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              try {
                void openUrl(`https://mods.factorio.com/mod/${encodeURIComponent(mod.name)}`);
              } catch {
                /* opener unavailable (e.g. plain-browser dev) */
              }
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View on Factorio Portal
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void install()}
              disabled={isFactorioDetected === false || installing || loading || planLoading || hasConflicts || !selectedVersion}
              title={
                isFactorioDetected === false
                  ? "Factorio not found — set your mods folder in Settings"
                  : undefined
              }
            >
              {installing ? (
                <Spinner className="text-stone-400" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {installing
                ? "Queueing…"
                : `Install (${selectedCount} item${selectedCount === 1 ? "" : "s"})`}
            </Button>
          </div>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-stone-400">{mod.summary}</p>

      {isFactorioDetected === false && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">
              Factorio not found — set your mods folder in Settings before installing.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onClose();
              setActiveTab("settings");
            }}
          >
            Open Settings
          </Button>
        </div>
      )}

      {/* ---- Version / File ---- */}
      <section className="mt-5 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-200">
            <Download className="h-4 w-4 text-stone-400" />
            Version / File
          </h3>
          <label className="flex items-center gap-2 text-xs text-stone-400">
            Show all versions
            <Toggle
              checked={showAllVersions}
              onChange={setShowAllVersions}
              label="Show all versions"
            />
          </label>
        </div>

        {loading && (
          <p className="mt-3 flex items-center gap-2 text-sm text-stone-400">
            <Spinner /> Loading releases…
          </p>
        )}
        {detailsError &&
          (isNetworkOrHttpError(detailsError) ? (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <p className="text-xs text-amber-300">
                  Can't reach the portal to load mod details.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={loadDetails}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 p-3">
              <p className="text-xs text-red-400">{detailsError.message}</p>
              <Button variant="ghost" size="sm" onClick={loadDetails} className="mt-2">
                Retry
              </Button>
            </div>
          ))}

        {!loading && !detailsError && releases.length === 0 && (
          <p className="mt-3 text-sm text-stone-400">No releases available.</p>
        )}

        {!loading && !detailsError && selectedRelease && !showAllVersions && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="green">RELEASE</Badge>
                <p className="truncate font-semibold text-stone-200">
                  v{selectedRelease.version} for Factorio{" "}
                  {selectedRelease.factorioVersion || "?"}
                </p>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-stone-400">
                <span
                  className={
                    selectedRelease.factorioVersion === target ? "text-accent" : ""
                  }
                >
                  {selectedRelease.factorioVersion === target ? "✓ " : ""}
                  Factorio {selectedRelease.factorioVersion || "?"}
                </span>
                {selectedRelease.fileSize !== null && (
                  <span>· {formatBytes(selectedRelease.fileSize)}</span>
                )}
                {selectedRelease.releasedAt && (
                  <span>
                    · {new Date(selectedRelease.releasedAt).toLocaleDateString()}
                  </span>
                )}
              </p>
            </div>
            <Select
              value={selectedVersion ?? ""}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="w-32 shrink-0"
            >
              {releases.map((r) => (
                <option key={r.version} value={r.version}>
                  v{r.version}
                </option>
              ))}
            </Select>
          </div>
        )}

        {!loading && !detailsError && showAllVersions && releases.length > 0 && (
          <ul className="mt-3 max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {releases.map((r) => {
              const isSel = r.version === selectedVersion;
              const isLatest = r.version === releases[0].version;
              return (
                <li key={r.version}>
                  <button
                    onClick={() => setSelectedVersion(r.version)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      isSel ? "bg-surface-2" : "hover:bg-surface-2/60"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-stone-200">
                        v{r.version}
                        {isSel && (
                          <Badge tone="green" className="ml-2">
                            selected
                          </Badge>
                        )}
                        {isLatest && !isSel && (
                          <Badge tone="violet" className="ml-2">
                            latest
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-stone-400">
                        Factorio {r.factorioVersion || "?"}
                        {r.fileSize !== null && ` · ${formatBytes(r.fileSize)}`}
                        {r.releasedAt &&
                          ` · ${new Date(r.releasedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    {isSel && <Check className="h-4 w-4 shrink-0 text-accent" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- Dependencies ---- */}
      <section className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-200">
            <Puzzle className="h-4 w-4 text-stone-400" />
            Dependencies ({depCount})
          </h3>
          {!planLoading && !planError && (
            <Badge tone={selected.size > 0 ? "green" : "neutral"}>
              {selected.size} selected for auto-install
            </Badge>
          )}
        </div>
        <p className="mt-1.5 text-xs text-stone-400">
          These mods will be downloaded and installed alongside {mod.title}.
        </p>

        {planLoading && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface-2 p-3">
            <Spinner className="mt-0.5 text-stone-400" />
            <p className="text-xs text-stone-400">
              Resolving dependency tree — fetches one page per mod involved, so
              the first run can take up to a minute.
            </p>
          </div>
        )}
        {planError &&
          (isNetworkOrHttpError(planError) ? (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <p className="text-xs text-amber-300">
                  Can't reach the portal or community mirror to resolve dependencies.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadPlan()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 p-3">
              <p className="text-xs text-red-400">{planError.message}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadPlan()}
                className="mt-2"
              >
                Retry
              </Button>
            </div>
          ))}

        {plan && plan.conflicts.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
              <OctagonX className="h-3.5 w-3.5" />
              Conflicts — installation blocked
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-red-300">
              {plan.conflicts.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {plan && plan.warnings.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5" />
              Warnings
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-300/90">
              {plan.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {plan && !planError && (
          <>
            {depCount === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-stone-400">
                <Check className="h-4 w-4 text-accent" />
                No additional mods will be installed alongside this one.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {requiredDeps.map((dep) => (
                  <DepRow
                    key={dep.name}
                    name={dep.name}
                    version={dep.version}
                    badge="REQUIRED"
                    badgeTone="red"
                    note={
                      dep.requiredBy === ""
                        ? undefined
                        : `required by ${dep.requiredBy}`
                    }
                    checked={selected.has(dep.name)}
                    onToggle={(v) => toggleDep(dep.name, v)}
                  />
                ))}
                {plan.optional.map((name) => (
                  <DepRow
                    key={name}
                    name={name}
                    badge="OPTIONAL"
                    badgeTone="neutral"
                    checked={selected.has(name)}
                    onToggle={(v) => toggleDep(name, v)}
                  />
                ))}
              </ul>
            )}
            {requiredDeps.some((d) => !d.depsKnown) && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                Some dependencies publish no dependency info — their own
                requirements can't be checked.
              </p>
            )}
          </>
        )}

        {enqueueErrors.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 p-3">
            <p className="text-xs font-semibold text-red-400">
              Some downloads could not be queued:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-red-300">
              {enqueueErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---- File facts ---- */}
      {selectedRelease && (
        <section className="mt-4 border-t border-line pt-4">
          <div className="rounded-lg border border-line bg-surface px-4 py-2">
            <KeyValue label="Target Directory" mono>
              {isFactorioDetected === false
                ? "Factorio not found — set in Settings"
                : modsDir ?? effectiveModsDir ?? "auto-detected on launch"}
            </KeyValue>
            <KeyValue label="File Name" mono>
              {`${mod.name}_${selectedRelease.version}.zip`}
            </KeyValue>
            <KeyValue label="File Size">
              {selectedRelease.fileSize !== null
                ? formatBytes(selectedRelease.fileSize)
                : "—"}
            </KeyValue>
            <KeyValue label="Factorio Version">
              {`Factorio ${selectedRelease.factorioVersion || "?"}`}
            </KeyValue>
          </div>
        </section>
      )}
    </Modal>
  );
}
