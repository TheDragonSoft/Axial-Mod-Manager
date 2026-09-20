import { useAppStore } from "../store/useAppStore";
import { useQueueStore } from "../store/useQueueStore";
import type { ActivationDiff } from "../types";

export type Status = { kind: "ok" | "err"; text: string };

/**
 * Handles side-effects for an activation diff (opening the download queue if downloads are needed,
 * or clearing the activating pack ID if done immediately) and formats a user-facing status.
 */
export function handleActivationDiff(diff: ActivationDiff): Status {
  if (diff.toDownload.length > 0) {
    useQueueStore.getState().open();
  } else {
    useAppStore.getState().setActivatingPackId(null);
  }

  if (diff.errors.length > 0) {
    return { kind: "err", text: diff.errors.join(" · ") };
  }

  const parts = [
    `enabled ${diff.toEnable.length}`,
    `disabled ${diff.toDisable.length}`,
    diff.toDownload.length > 0 && `downloading ${diff.toDownload.length}`,
  ].filter(Boolean);

  return {
    kind: "ok",
    text: `Activating "${diff.packName}": ${parts.join(", ")}`,
  };
}
