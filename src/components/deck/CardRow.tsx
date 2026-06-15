import type { DeckCard } from "@/lib/deck";
import { thumbnailSrc } from "./cardImage";

interface CardRowProps {
  entry: DeckCard;
}

/**
 * One card line in the upgrade plan: a lazy-loaded front-face thumbnail (or a
 * same-sized placeholder tile when no image resolved) beside the quantity-prefixed
 * name. Shared by the Remove/Add columns and the shared-cards disclosure so all
 * three sections render identically. The image is decorative (alt="") because the
 * card name sits right beside it in text.
 */
export function CardRow({ entry }: CardRowProps) {
  const { card, quantity } = entry;
  const thumb = thumbnailSrc(card.imageUrl);
  const label = quantity > 1 ? `${quantity}× ${card.name}` : card.name;

  return (
    <li className="flex items-center gap-2 text-sm text-blue-100/80">
      {thumb !== null ? (
        <img src={thumb} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-sm bg-white/5 object-cover" />
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
