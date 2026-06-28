import { useState } from "react";
import type { DeckCard } from "@/lib/deck";
import { thumbnailSrc } from "./cardImage";
import { formatUsd } from "./labels";

interface CardRowProps {
  entry: DeckCard;
}

/**
 * One card line in the upgrade plan: a lazy-loaded front-face thumbnail (or a
 * same-sized placeholder tile when no image resolved) beside the quantity-prefixed
 * name. Shared by the Remove/Add columns and the shared-cards disclosure so all
 * three sections render identically.
 *
 * Hovering or keyboard-focusing the thumbnail reveals a readable full-size card.
 * The large image is mounted only while the preview is active, so it is fetched on
 * first hover/focus rather than for every card up front — preserving the bandwidth
 * win of the small thumbnail. The thumbnail itself is decorative (alt=""); the
 * button carries the card name as its accessible label.
 */
export function CardRow({ entry }: CardRowProps) {
  const { card, quantity } = entry;
  const thumb = thumbnailSrc(card.imageUrl);
  const label = quantity > 1 ? `${quantity}× ${card.name}` : card.name;
  const [preview, setPreview] = useState(false);

  return (
    <li className="text-secondary-foreground flex items-center gap-[9px] text-[12px]">
      {thumb !== null ? (
        <button
          type="button"
          aria-label={card.name}
          onMouseEnter={() => {
            setPreview(true);
          }}
          onMouseLeave={() => {
            setPreview(false);
          }}
          onFocus={() => {
            setPreview(true);
          }}
          onBlur={() => {
            setPreview(false);
          }}
          className="focus-visible:ring-ring relative shrink-0 cursor-zoom-in rounded-sm p-0 focus:outline-none focus-visible:ring-2"
        >
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className="border-border bg-card h-9 w-[26px] rounded-sm border object-cover"
          />
          {preview && card.imageUrl !== null ? (
            <img
              src={card.imageUrl}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-80 max-w-none rounded-lg shadow-xl ring-1 ring-black/40"
            />
          ) : null}
        </button>
      ) : (
        <span
          aria-hidden="true"
          className="border-border bg-card text-muted-foreground/60 flex h-9 w-[26px] shrink-0 items-center justify-center rounded-sm border text-center text-[7px] leading-tight"
        >
          no img
        </span>
      )}
      <span className="flex-1">{label}</span>
      <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">{formatUsd(card.priceUsd)}</span>
    </li>
  );
}
