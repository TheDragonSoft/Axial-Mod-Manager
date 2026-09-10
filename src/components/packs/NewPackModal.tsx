import { useState } from "react";
import { Camera, ClipboardPaste, Network } from "lucide-react";
import {
  createPackFromInstalled,
  createPackFromMods,
  importPack,
  resolveInstallPlan,
  toAppError,
} from "../../lib/api";
import Button from "../ui/Button";
import Input, { INPUT_CLASS } from "../ui/Input";
import Modal from "../ui/Modal";
import type { ResolutionPlan, PackMod } from "../../types";

type Mode = "choose" | "snapshot" | "root" | "import";

const OPTIONS: { id: Exclude<Mode, "choose">; icon: typeof Camera; title: string; hint: string }[] = [
  {
    id: "snapshot",
    icon: Camera,
    title: "Snapshot current mods",
    hint: "Capture everything installed right now, with enable states.",
  },
  {
    id: "root",
    icon: Network,
    title: "Build from a root mod",
    hint: "Resolve a dependency tree (e.g. SeaBlock) into a pack without installing anything.",
  },
  {
    id: "import",
    icon: ClipboardPaste,
    title: "Paste exported JSON",
    hint: "Import a pack someone shared with you.",
  },
];

export default function NewPackModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const [packName, setPackName] = useState("");
  const [rootName, setRootName] = useState("");
  const [rootVersion, setRootVersion] = useState("");
  const [plan, setPlan] = useState<ResolutionPlan | null>(null);
  const [importJson, setImportJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onCreated();
      onClose();
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  }

  async function resolveRoot() {
    setBusy(true);
    setError(null);
    try {
      setPlan(
        await resolveInstallPlan(rootName.trim(), rootVersion.trim() || undefined),
      );
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Button variant="ghost" onClick={() => { setPlan(null); setError(null); setMode("choose"); }}>
      Back
    </Button>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      layer="z-[60]"
      title={
        mode === "choose"
          ? "New mod pack"
          : mode === "snapshot"
            ? "Snapshot current mods"
            : mode === "root"
              ? "Build from a root mod"
              : "Import pack JSON"
      }
      subtitle={
        mode === "choose"
          ? "Choose how this pack starts out"
          : undefined
      }
    >
      {mode === "choose" && (
        <div className="space-y-2">
          {OPTIONS.map(({ id, icon: Icon, title, hint }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 text-left transition-colors hover:border-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                <Icon className="h-4 w-4" />
              </div>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-100">{title}</span>
                <span className="block text-xs text-zinc-500">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {mode === "snapshot" && (
        <form
          id="new-pack-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => createPackFromInstalled(packName));
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-zinc-400 uppercase">
              Pack name
            </span>
            <Input
              autoFocus
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              placeholder="My current setup"
            />
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      )}

      {mode === "root" && (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-zinc-400 uppercase">
              Root mod name (portal id)
            </span>
            <Input
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              placeholder="SeaBlock"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-zinc-400 uppercase">
              Version (optional — latest compatible)
            </span>
            <Input
              value={rootVersion}
              onChange={(e) => setRootVersion(e.target.value)}
              placeholder="1.2.0"
            />
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {!plan ? (
            <Button
              variant="primary"
              onClick={() => void resolveRoot()}
              disabled={busy || !rootName.trim()}
            >
              {busy ? "Resolving…" : "Resolve dependencies"}
            </Button>
          ) : (
            <>
              <div className="rounded-lg border border-line bg-surface-2 p-3 text-xs text-zinc-400">
                <p>
                  <span className="text-zinc-200">{plan.toInstall.length}</span> to install ·{" "}
                  <span className="text-zinc-200">{plan.satisfied.length}</span> already
                  installed · {plan.optional.length} optional (not included)
                </p>
                {plan.conflicts.length > 0 && (
                  <p className="mt-1 text-red-400">
                    {plan.conflicts.length} conflict(s) — resolve before saving.
                  </p>
                )}
                <ul className="mt-2 max-h-32 overflow-y-auto font-mono text-[11px] text-zinc-500">
                  {plan.toInstall.map((e) => (
                    <li key={e.name}>
                      {e.name} @{e.version}
                    </li>
                  ))}
                  {plan.satisfied.map((s) => (
                    <li key={s.name}>
                      {s.name} @{s.version}{" "}
                      <span className="text-zinc-600">(installed)</span>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium tracking-wide text-zinc-400 uppercase">
                  Pack name
                </span>
                <Input
                  value={packName}
                  onChange={(e) => setPackName(e.target.value)}
                  placeholder={plan.rootName}
                />
              </label>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <Button
                variant="primary"
                onClick={() =>
                  void run(() => {
                    const mods: PackMod[] = [
                      ...plan.toInstall.map((e) => ({ name: e.name, version: e.version, enabled: true })),
                      ...plan.satisfied.map((s) => ({ name: s.name, version: s.version, enabled: true })),
                    ];
                    return createPackFromMods(packName.trim() || plan.rootName, mods);
                  })
                }
                disabled={busy || plan.conflicts.length > 0}
              >
                {busy ? "Saving…" : "Save as pack"}
              </Button>
            </>
          )}
        </div>
      )}

      {mode === "import" && (
        <form
          id="new-pack-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => importPack(importJson));
          }}
        >
          <textarea
            autoFocus
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='{"name":"SeaBlock","mods":[…]}'
            rows={10}
            className={`w-full rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none ${INPUT_CLASS}`}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      )}

      {mode !== "choose" && (
        <div className="mt-5 flex items-center justify-end gap-2">
          {back}
          {mode === "snapshot" && (
            <Button
              variant="primary"
              type="submit"
              form="new-pack-form"
              disabled={busy || !packName.trim()}
            >
              {busy ? "Creating…" : "Create pack"}
            </Button>
          )}
          {mode === "import" && (
            <Button
              variant="primary"
              type="submit"
              form="new-pack-form"
              disabled={busy || !importJson.trim()}
            >
              {busy ? "Importing…" : "Import"}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
