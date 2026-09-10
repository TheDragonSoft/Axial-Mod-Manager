import { useCallback, useEffect, useState } from "react";
import { enqueueDownload, getModDetails, resolveInstallPlan, toAppError } from "../lib/api";
import { compareVersions } from "../lib/format";
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Install with dependencies</h3>
            <p className="text-xs text-zinc-500">{title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-zinc-200">
            ✕
          </button>
        </div>

        {loading && (
          <div className="mt-6 text-center">
            <p className="text-sm text-zinc-400">Resolving dependency tree…</p>
            <p className="mt-1 text-xs text-zinc-600">
              Fetches one page per mod involved — the first run can take up to a minute.
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="mt-4 rounded border border-red-900/60 bg-red-950/40 p-3">
            <p className="text-xs text-red-400">{error}</p>
            <button onClick={() => void load()} className="mt-2 text-xs text-zinc-400 underline hover:text-zinc-200">
              Retry
            </button>
          </div>
        )}

        {!loading && plan && (
          <>
            <p className="mt-3 text-xs text-zinc-500">
              Resolution target: Factorio <span className="font-mono text-zinc-400">{plan.target}</span>
            </p>

            {plan.conflicts.length > 0 && (
              <div className="mt-3 rounded border border-red-900/60 bg-red-950/40 p-3">
                <p className="text-xs font-semibold text-red-400">
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
              <div className="mt-3 rounded border border-amber-900/60 bg-amber-950/30 p-3">
                <p className="text-xs font-semibold text-amber-400">Warnings</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-300/90">
                  {plan.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Will install ({plan.toInstall.length})
            </h4>
            {plan.toInstall.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">Nothing to install — everything is satisfied.</p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-800/60 rounded border border-zinc-800">
                {plan.toInstall.map((e) => (
                  <li key={e.name} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-200">
                        {e.title}{" "}
                        <span className="font-mono text-xs text-zinc-500">v{e.version}</span>
                        {!e.depsKnown && (
                          <span className="ml-2 text-[10px] text-amber-400" title="No dependency info available for this mod — its own requirements can't be checked">
                            ⚠ deps unknown
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-zinc-600">
                        {e.requiredBy === "" ? "requested by you" : `required by ${e.requiredBy}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {plan.satisfied.length > 0 && (
              <p className="mt-3 text-xs text-zinc-500">
                Already installed and compatible ({plan.satisfied.length}):{" "}
                <span className="font-mono">{plan.satisfied.map((s) => s.name).join(", ")}</span>
              </p>
            )}

            {plan.optional.length > 0 && (
              <>
                <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Optional ({plan.optional.length}) — tick any to also install
                </h4>
                <div className="mt-2 grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded border border-zinc-800 p-2 sm:grid-cols-2">
                  {plan.optional.map((n) => (
                    <label key={n} className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={selectedOptional.has(n)}
                        onChange={() => toggleOptional(n)}
                        className="accent-amber-500"
                      />
                      <span className="truncate font-mono">{n}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            {enqueueErrors.length > 0 && (
              <div className="mt-3 rounded border border-red-900/60 bg-red-950/40 p-3">
                <p className="text-xs font-semibold text-red-400">Some downloads could not be queued:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-red-300">
                  {enqueueErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              <button onClick={onClose} className="text-sm text-zinc-400 hover:text-zinc-200">
                Cancel
              </button>
              <button
                onClick={() => void confirm()}
                disabled={enqueuing || hasConflicts || installCount === 0}
                className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enqueuing ? "Queueing…" : `Install ${installCount} mod${installCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
