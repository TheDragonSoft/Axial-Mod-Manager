import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { enqueueDownload, getModDetails, toAppError } from "../lib/api";
import { compareVersions, formatBytes } from "../lib/format";
import { useQueueStore } from "../store/useQueueStore";
import { useThumbnailUrl } from "../lib/thumbnails";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
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

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getModDetails(mod.name)
      .then(setDetails)
      .catch((e) => setError(toAppError(e)))
      .finally(() => setLoading(false));
  }, [mod.name]);
  useEffect(load, [load]);

  async function install(version: string) {
    setInstalling(version);
    try {
      await enqueueDownload(mod.name, version);
      onClose();
      useQueueStore.getState().open();
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setInstalling(null);
    }
  }

  const releases = details
    ? [...details.releases].sort((a, b) => compareVersions(b.version, a.version))
    : [];

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
      {loading && <p className="text-sm text-zinc-500">Loading releases…</p>}
      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3">
          <p className="text-xs text-red-400">{error.message}</p>
          <Button variant="ghost" size="sm" onClick={load} className="mt-2">
            Retry
          </Button>
        </div>
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
                  <p className="font-mono text-sm text-zinc-200">
                    v{r.version}
                    {isInstalled && (
                      <Badge tone="green" className="ml-2">
                        installed
                      </Badge>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-500">
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
