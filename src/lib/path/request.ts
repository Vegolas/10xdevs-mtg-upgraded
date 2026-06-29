/**
 * Request-body validation for the `/api/paths/*` endpoints (user-accounts).
 *
 * Pure guards over untrusted JSON bodies — no Astro, Supabase, or I/O imports —
 * so the API's validation gate is unit-tested directly (Phase 3 success
 * criterion) without mocking the request pipeline. The step guard reuses
 * {@link parseSnapshot}, so a malformed snapshot in the body is rejected by the
 * same structural check the stored column trusts.
 */

import { parseSnapshot } from "./snapshot";
import type { StepSnapshot } from "./types";

/** A validated `POST /api/paths/[id]/steps` body: a named checkpoint plus its snapshot. */
export interface StepInput {
  name: string;
  listText: string;
  snapshot: StepSnapshot;
  /** Raw `+`/`-` provenance for a diff-entered checkpoint; `null` for full paste. */
  deltaText: string | null;
}

/**
 * Validate a path create/rename body, returning the trimmed title or `null` when
 * `title` is missing, not a string, or blank.
 */
export function parseTitleInput(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { title } = raw as Record<string, unknown>;
  if (typeof title !== "string" || title.trim() === "") {
    return null;
  }
  return title.trim();
}

/**
 * Validate an append-step body, returning a clean {@link StepInput} or `null`
 * when `name` is missing/blank, `listText` is not a string, or `snapshot` fails
 * {@link parseSnapshot}. The returned snapshot is the parsed (re-normalized) form.
 * `deltaText` is optional provenance: a non-empty string is kept verbatim;
 * absent, blank, or non-string collapses to `null` (the full-paste shape).
 */
export function parseStepInput(raw: unknown): StepInput | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { name, listText, snapshot, deltaText } = raw as Record<string, unknown>;
  if (typeof name !== "string" || name.trim() === "") {
    return null;
  }
  if (typeof listText !== "string") {
    return null;
  }
  const parsed = parseSnapshot(snapshot);
  if (parsed === null) {
    return null;
  }
  const delta = typeof deltaText === "string" && deltaText.trim() !== "" ? deltaText : null;
  return { name: name.trim(), listText, snapshot: parsed, deltaText: delta };
}
