import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import {
  enqueueDownload,
  getModDetails,
  isNetworkOrHttpError,
  toAppError,
} from "../lib/api";
import { fetchChangelog, useChangelog } from "../lib/changelog";
import { compareVersions, formatBytes } from "../lib/format";
import { useQueueStore } from "../store/useQueueStore";
import { useThumbnailUrl } from "../lib/thumbnails";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import ChangelogView from "./ChangelogView";
import ModTile from "./ui/ModTile";
import Modal from "./ui/Modal";
import type { AppError, InstalledMod, ModDetails } from "../types";

export default function VersionsModal({
  mod,
  onClose,
}: {
  mod: InstalledMod;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<ModDetails | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const thumbnail = useThumbnailUrl(mod.name);
  const changelog = useChangelog(mod.name);

  // Changelog is fetched once per mod (cached in the store); the section
  // below shows the newest release's entry.
  useEffect(() => {
    fetchChangelog(mod.name);
  }, [mod.name]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    let cancelled = false;
    getModDetails(mod.name)
      .then((d) => {
        if (cancelled) return;
        setDetails(d);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(toAppError(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true; // a closed/retried load must not overwrite fresh state
    };
  }, [mod.name]);
  useEffect(load, [load]);

  async function install(version: string) {
    setInstalling(version);
    try {
      const sha1 = details?.releases.find((r) => r.version === version)?.sha1 ?? null;
      await enqueueDownload(mod.name, version, sha1);
      onClose();
      useQueueStore.getState().open();
    } catch (e) {
      const err = toAppError(e);
      if (err.kind === "not_found") {
        setError({
          kind: "not_found",
          message: "Factorio not found — set your mods folder in Settings.",
        });
      } else {
        setError(err);
      }
    } finally {
      setInstalling(null);
    }
  }

  const releases = details
    ? [...details.releases].sort((a, b) => compareVersions(b.version, a.version))
    : [];

  const newestChangelog =
    changelog && changelog.length > 0 && releases.length > 0
      ? changelog.find((e) => e.version === releases[0].version) ?? null
      : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      layer="z-[60]"
      title={`Versions — ${mod.name}`}
      subtitle="switching versions replaces the old zip"
      icon={<ModTile name={mod.name} url={thumbnail} size="md" />}
    >
      {loading && <p className="text-sm text-stone-400">Loading releases…</p>}
      {error &&
        (isNetworkOrHttpError(error) ? (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-xs text-amber-300">
                Can't reach the portal to load versions.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="mb-3 rounded-lg border border-red-900/60 bg-red-950/40 p-3">
            <p className="text-xs text-red-400">
              {error.kind === "not_found"
                ? "Factorio not found — set your mods folder in Settings."
                : error.message}
            </p>
            <Button variant="ghost" size="sm" onClick={load} className="mt-2">
              Retry
            </Button>
          </div>
        ))}

      {/* Changelog preview for the newest release (A3) — above the version
          list so it's visible without scrolling past dozens of releases.
          Failures degrade to a muted inline note — never a toast. */}
      {newestChangelog && (
        <div className="mb-3 border-b border-line pb-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">
            What's new in v{newestChangelog.version}
          </p>
          <ChangelogView entries={[newestChangelog]} />
        </div>
      )}
      {changelog !== undefined && details !== null && !newestChangelog && (
        <p className="mb-3 text-xs italic text-stone-400">
          {changelog === null
            ? "Changelog unavailable"
            : "No changelog entries for the newest release"}
        </p>
      )}

      {details && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {releases.map((r) => {
            const isInstalled = r.version === mod.version;
            return (
              <li
                key={r.version}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm text-stone-200">
                    v{r.version}
                    {isInstalled && (
                      <Badge tone="green" className="ml-2">
                        installed
                      </Badge>
                    )}
                  </p>
                  <p className="text-[11px] text-stone-400">
                    game {r.factorioVersion || "?"}
                    {r.fileSize !== null && ` · ${formatBytes(r.fileSize)}`}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void install(r.version)}
                  disabled={isInstalled || installing !== null}
                >
                  {installing === r.version ? (
                    "…"
                  ) : isInstalled ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    "Install"
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
