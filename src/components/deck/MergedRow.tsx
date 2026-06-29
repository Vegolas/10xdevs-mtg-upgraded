import { useState } from "react";
import type { DeckCard } from "@/lib/deck";
import { thumbnailSrc } from "./cardImage";
import { categoryLabel, formatSignedUsd } from "./labels";

/** Which side of the diff a merged row represents. */
export type MergedKind = "remove" | "add" | "stay";

interface MergedRowProps {
  entry: DeckCard;
  kind: MergedKind;
}

/** Per-kind skin: marker glyph + colour, left border, row bg, price tone. */
const KINDS = {
  remove: {
    glyph: "−",
    glyphClass: "text-destructive font-bold text-[16px]",
    border: "border-l-4 border-l-[#9c443c] bg-[#1f1410]",
    priceClass: "text-destructive",
  },
  add: {
    glyph: "+",
    glyphClass: "text-add font-bold text-[16px]",
    border: "border-l-4 border-l-[#5a7a3f] bg-[#161d10]",
    priceClass: "text-add",
  },
  stay: {
    glyph: "=",
    glyphClass: "text-muted-foreground text-[15px]",
    border: "border-l-4 border-l-[#4a4230] opacity-55",
    priceClass: "text-muted-foreground",
  },
} as const;

/**
 * One row of the merged ledger: a −/+/= marker, a hover-zoom thumbnail, the
 * quantity-prefixed name, a card-type pill, and a signed/coloured price. `kind`
 * drives the marker glyph + colour, the coloured left border and row background,
 * and the price tone. A `stay` row carries no cost (its price renders as the
 * em-dash marker) and a muted "· stays" suffix, matching the v3 merged mock.
 */
export function MergedRow({ entry, kind }: MergedRowProps) {
  const { card, quantity } = entry;
  const skin = KINDS[kind];
  const thumb = thumbnailSrc(card.imageUrl);
  const label = quantity > 1 ? `${quantity}× ${card.name}` : card.name;
  const [preview, setPreview] = useState(false);

  return (
    <li
      className={`flex items-center gap-[10px] border-b border-b-[#241d12] px-[13px] py-[9px] first:rounded-t-md last:rounded-b-md last:border-b-0 ${skin.border}`}
    >
      <span className={`font-display w-[14px] shrink-0 text-center ${skin.glyphClass}`} aria-hidden="true">
        {skin.glyph}
      </span>

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
            className="border-border bg-card h-[33px] w-6 rounded-[2px] border object-cover"
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
          className="border-border bg-card text-muted-foreground/60 flex h-[33px] w-6 shrink-0 items-center justify-center rounded-[2px] border text-center text-[7px] leading-tight"
        >
          no img
        </span>
      )}

      <span className="text-secondary-foreground flex-1 text-[12px]">
        {label}
        {kind === "stay" ? <span className="text-muted-foreground"> · stays</span> : null}
      </span>

      <span className="text-muted-foreground border-border rounded-[10px] border px-[7px] py-px text-[9px]">
        {categoryLabel(card.category)}
      </span>

      <span className={`w-[56px] text-right text-[11px] tabular-nums ${skin.priceClass}`}>
        {kind === "stay" ? "—" : formatSignedUsd(card.priceUsd, kind)}
      </span>
    </li>
  );
}
