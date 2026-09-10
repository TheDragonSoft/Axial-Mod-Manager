import { Download, Heart } from "lucide-react";
import type { ModSummary } from "../types";
import { formatCount } from "../lib/format";
import { useFavoritesStore } from "../store/useFavoritesStore";
import { useThumbnailUrl } from "../lib/thumbnails";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Card from "./ui/Card";
import ModTile from "./ui/ModTile";

interface ModCardProps {
  mod: ModSummary;
  /** Settings target the compat badge compares against. */
  targetVersion?: string;
  /** Opens the install dialog (card click and the Details button). */
  onOpen?: (mod: ModSummary) => void;
  /** The Install button never queues directly — it opens the install dialog. */
  onInstall?: (mod: ModSummary) => void;
}

export default function ModCard({
  mod,
  targetVersion = "2.0",
  onOpen,
  onInstall,
}: ModCardProps) {
  const favorite = useFavoritesStore((s) => s.favorites.includes(mod.name));
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const thumbnail = useThumbnailUrl(mod.name);
  const compatible = mod.factorioVersion === targetVersion;

  return (
    <Card
      onClick={() => onOpen?.(mod)}
      title="View details"
      className={`flex flex-col p-5 transition-colors hover:border-stone-600 ${
        onOpen ? "cursor-pointer" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <ModTile name={mod.name} url={thumbnail} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-stone-200">
            {mod.title}
          </h3>
          <p className="truncate font-mono text-xs text-stone-600">{mod.name}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(mod.name);
          }}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          title={favorite ? "Remove from favorites" : "Add to favorites"}
          className={`shrink-0 rounded-lg p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
            favorite
              ? "text-accent"
              : "text-stone-600 hover:bg-surface-2 hover:text-stone-300"
          }`}
        >
          <Heart className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <Download className="h-3.5 w-3.5" />
          {formatCount(mod.downloads)}
        </span>
        <Badge tone={compatible ? "green" : "neutral"}>
          Factorio {mod.factorioVersion}
          {compatible ? " ✓" : ""}
        </Badge>
      </div>

      <p className="mt-2 line-clamp-2 min-h-10 flex-1 text-sm leading-relaxed text-stone-400">
        {mod.summary}
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <span className="font-mono text-xs text-stone-600">
          v{mod.latestVersion}
        </span>
        <div className="flex items-center gap-1">
          {onOpen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(mod);
              }}
            >
              Details
            </Button>
          )}
          {onInstall && (
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onInstall(mod);
              }}
            >
              Install
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
