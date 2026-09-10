import { useCallback, useEffect, useState } from "react";
import DependencyPlanModal from "./DependencyPlanModal";
import { enqueueDownload, getModDetails, getSettings, toAppError } from "../lib/api";
import { useQueueStore } from "../store/useQueueStore";
import { useThumbnailUrl } from "../lib/thumbnails";
import { compareVersions, formatBytes, formatCount } from "../lib/format";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import ModTile from "./ui/ModTile";
import Modal from "./ui/Modal";
import Spinner from "./ui/Spinner";
import type { AppError, ModDetails, ModRelease, ModSummary } from "../types";

interface Props {
  mod: ModSummary;
  onClose: () => void;
}

function ReleaseRow({
  release,
  isLatest,
  target,
  onDownload,
}: {
  release: ModRelease;
  isLatest: boolean;
  target: string;
  onDownload: (version: string) => void;
}) {
  const compatible = release.factorioVersion === target;
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pr-3 font-mono text-stone-200">
        v{release.version}
        {isLatest && (
          <Badge tone="violet" className="ml-2">
            latest
          </Badge>
        )}
      </td>
      <td className="py-2.5 pr-3">
        <span
          title={
            compatible
              ? "Compatible with your target version"
              : `Targets game ${release.factorioVersion}`
          }
        >
          <Badge tone={compatible ? "green" : "neutral"}>
            {compatible ? `✓ ${release.factorioVersion}` : `needs ${release.factorioVersion}`}
          </Badge>
        </span>
      </td>
      <td className="py-2.5 pr-3 text-xs text-stone-500">
        {release.releasedAt ? new Date(release.releasedAt).toLocaleDateString() : "—"}
      </td>
      <td className="py-2.5 pr-3 text-xs text-stone-500">
        {release.fileSize !== null ? formatBytes(release.fileSize) : "—"}
      </td>
      <td className="py-2.5 pr-3 text-xs text-stone-500">
        {release.downloadsCount !== null ? formatCount(release.downloadsCount) : "—"}
      </td>
      <td className="py-2.5 text-right">
        <Button variant="primary" size="sm" onClick={() => onDownload(release.version)}>
          Download
        </Button>
      </td>
    </tr>
  );
}

export default function ModDetailsModal({ mod, onClose }: Props) {
  const [details, setDetails] = useState<ModDetails | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState("2.0");
  const [showPlan, setShowPlan] = useState(false);
  const searchThumbnail = useThumbnailUrl(mod.name);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([getModDetails(mod.name), getSettings()])
      .then(([d, s]) => {
        setDetails(d);
        setTarget(s.targetFactorioVersion);
      })
      .catch((e) => setError(toAppError(e)))
      .finally(() => setLoading(false));
  }, [mod.name]);

  useEffect(load, [load]);

  const releases = details
    ? [...details.releases].sort((a, b) => compareVersions(b.version, a.version))
    : [];

  const startDownload = (version: string) => {
    void enqueueDownload(mod.name, version);
    useQueueStore.getState().open();
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={mod.title}
        subtitle={mod.name}
        icon={
          <ModTile
            name={mod.name}
            url={details?.thumbnail ?? searchThumbnail}
            size="md"
          />
        }
        footer={
          <Button
            variant="primary"
            onClick={() => setShowPlan(true)}
            disabled={loading || error !== null}
          >
            Install with dependencies
          </Button>
        }
      >
        <p className="text-sm leading-relaxed text-stone-300">
          {details?.summary ?? mod.summary}
        </p>

        {details?.owner && (
          <p className="mt-2 text-xs text-stone-500">
            by <span className="text-stone-400">{details.owner}</span>
            {details.downloads !== null && (
              <> · {formatCount(details.downloads)} downloads</>
            )}
          </p>
        )}

        {details && (
          <p className="mt-2 text-xs text-stone-500">
            Dependencies:{" "}
            {details.dependencies.length > 0 ? (
              <span
                className="cursor-help font-mono text-stone-400 underline decoration-dotted"
                title={details.dependencies.join("\n")}
              >
                {details.dependencies.length} declared
              </span>
            ) : (
              "none reported by the index"
            )}
          </p>
        )}

        <h4 className="mt-5 border-t border-line pt-4 text-xs font-medium tracking-wide text-stone-500 uppercase">
          Releases {details && `(${details.releases.length})`}
          <span className="ml-2 normal-case text-stone-600">
            · compatibility vs target {target}
          </span>
        </h4>

        {loading && (
          <p className="mt-4 flex items-center gap-2 text-sm text-stone-500">
            <Spinner /> Loading releases…
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/40 p-3">
            <p className="text-xs text-red-400">{error.message}</p>
            <Button variant="ghost" size="sm" onClick={load} className="mt-2">
              Retry
            </Button>
          </div>
        )}

        {details && (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-wide text-stone-600 uppercase">
                <th className="pb-1 pr-3 font-medium">Version</th>
                <th className="pb-1 pr-3 font-medium">Game</th>
                <th className="pb-1 pr-3 font-medium">Released</th>
                <th className="pb-1 pr-3 font-medium">Size</th>
                <th className="pb-1 pr-3 font-medium">DLs</th>
                <th className="pb-1 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {releases.map((r, i) => (
                <ReleaseRow
                  key={r.version}
                  release={r}
                  isLatest={i === 0}
                  target={target}
                  onDownload={startDownload}
                />
              ))}
            </tbody>
          </table>
        )}
      </Modal>
      {showPlan && (
        <DependencyPlanModal
          name={mod.name}
          title={mod.title}
          onClose={() => setShowPlan(false)}
          onDone={() => {
            setShowPlan(false);
            onClose();
            useQueueStore.getState().open();
          }}
        />
      )}
    </>
  );
}
