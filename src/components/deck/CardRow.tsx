import { useState } from "react";
import type { DeckCard } from "@/lib/deck";
import { thumbnailSrc } from "./cardImage";

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
    <li className="flex items-center gap-2 text-sm text-blue-100/80">
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
          className="relative shrink-0 cursor-default rounded-sm p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          <img src={thumb} alt="" loading="lazy" className="h-14 w-10 rounded-sm bg-white/5 object-cover" />
          {preview && card.imageUrl !== null ? (
            <img
              src={card.imageUrl}
              alt=""
              className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-80 max-w-none rounded-lg shadow-xl ring-1 ring-black/40"
            />
          ) : null}
        </button>
      ) : (
        <span
          aria-hidden="true"
          className="flex h-14 w-10 shrink-0 items-center justify-center rounded-sm border border-white/10 bg-white/5 text-center text-[8px] leading-tight text-blue-100/30"
        >
          no image
        </span>
      )}
      <span>{label}</span>
    </li>
  );
}
