import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  OctagonX,
  PackagePlus,
  TriangleAlert,
} from "lucide-react";
import { enqueueDownload, getModDetails, resolveInstallPlan, toAppError } from "../lib/api";
import { compareVersions } from "../lib/format";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import Spinner from "./ui/Spinner";
import type { ModDetails, ResolutionPlan } from "../types";

interface Props {
  name: string;
  title: string;
  onClose: () => void;
  onDone: () => void;
}

function pickLatestCompatible(details: ModDetails, target: string): string | null {
  const matching = details.releases.filter((r) => r.factorioVersion === target);
  const pool = matching.length > 0 ? matching : details.releases;
  const sorted = [...pool].sort((a, b) => compareVersions(b.version, a.version));
  return sorted[0]?.version ?? null;
}

export default function DependencyPlanModal({ name, title, onClose, onDone }: Props) {
  const [plan, setPlan] = useState<ResolutionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOptional, setSelectedOptional] = useState<Set<string>>(new Set());
  const [enqueuing, setEnqueuing] = useState(false);
  const [enqueueErrors, setEnqueueErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlan(await resolveInstallPlan(name));
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasConflicts = (plan?.conflicts.length ?? 0) > 0;
  const installCount = (plan?.toInstall.length ?? 0) + selectedOptional.size;

  async function confirm() {
    if (!plan) return;
    setEnqueuing(true);
    const errors: string[] = [];
    for (const entry of plan.toInstall) {
      try {
        await enqueueDownload(entry.name, entry.version);
      } catch (e) {
        errors.push(`${entry.name}: ${toAppError(e).message}`);
      }
    }
    for (const optName of selectedOptional) {
      try {
        const d = await getModDetails(optName);
        const v = pickLatestCompatible(d, plan.target);
        if (v) await enqueueDownload(optName, v);
        else errors.push(`${optName}: no compatible release found`);
      } catch (e) {
        errors.push(`${optName}: ${toAppError(e).message}`);
      }
    }
    setEnqueuing(false);
    if (errors.length > 0) setEnqueueErrors(errors);
    else onDone();
  }

  function toggleOptional(n: string) {
    setSelectedOptional((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      layer="z-[60]"
      title="Install with dependencies"
      subtitle={title}
      icon={
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-stone-300">
          <PackagePlus className="h-5 w-5" />
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void confirm()}
            disabled={enqueuing || hasConflicts || installCount === 0}
          >
            {enqueuing
              ? "Queueing…"
              : `Install ${installCount} mod${installCount === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      {loading && (
        <div className="py-6 text-center">
          <Spinner className="mx-auto h-5 w-5 text-stone-400" />
          <p className="mt-3 text-sm text-stone-400">Resolving dependency tree…</p>
          <p className="mt-1 text-xs text-stone-400">
            Fetches one page per mod involved — the first run can take up to a minute.
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3">
          <p className="text-xs text-red-400">{error}</p>
          <Button variant="ghost" size="sm" onClick={() => void load()} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {!loading && plan && (
        <>
          <p className="text-xs text-stone-400">
            Resolution target: Factorio{" "}
            <span className="font-mono text-stone-300">{plan.target}</span>
          </p>

          {plan.conflicts.length > 0 && (
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

          {plan.warnings.length > 0 && (
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

          <h4 className="mt-4 text-xs font-medium tracking-wide text-stone-400 uppercase">
            Will install ({plan.toInstall.length})
          </h4>
          {plan.toInstall.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-stone-400">
              <CheckCircle2 className="h-4 w-4 text-accent" />
              Nothing to install — everything is satisfied.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {plan.toInstall.map((e) => (
                <li key={e.name} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-stone-200">
                      {e.title}{" "}
                      <span className="font-mono text-xs text-stone-400">
                        v{e.version}
                      </span>
                      {!e.depsKnown && (
                        <Badge tone="amber" className="ml-2" title="No dependency info available for this mod — its own requirements can't be checked">
                          <AlertTriangle className="h-3 w-3" /> deps unknown
                        </Badge>
                      )}
                    </p>
                    <p className="text-[11px] text-stone-400">
                      {e.requiredBy === "" ? "requested by you" : `required by ${e.requiredBy}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {plan.satisfied.length > 0 && (
            <p className="mt-3 text-xs text-stone-400">
              Already installed and compatible ({plan.satisfied.length}):{" "}
              <span className="font-mono">
                {plan.satisfied.map((s) => s.name).join(", ")}
              </span>
            </p>
          )}

          {plan.optional.length > 0 && (
            <>
              <h4 className="mt-4 text-xs font-medium tracking-wide text-stone-400 uppercase">
                Optional ({plan.optional.length}) — tick any to also install
              </h4>
              <div className="mt-2 grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
                {plan.optional.map((n) => (
                  <label
                    key={n}
                    className="flex cursor-pointer items-center gap-2 text-xs text-stone-300"
                  >
                    <input
                      type="checkbox"
                      checked={selectedOptional.has(n)}
                      onChange={() => toggleOptional(n)}
                      className="accent-accent"
                    />
                    <span className="truncate font-mono">{n}</span>
                  </label>
                ))}
              </div>
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
        </>
      )}
    </Modal>
  );
}
