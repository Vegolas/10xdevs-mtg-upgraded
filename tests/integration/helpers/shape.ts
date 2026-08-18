import type { PathStep, StepSnapshot, UpgradePath } from "@/lib/api/contract";

/**
 * Closed-key-set + field-type asserters for the contract suites
 * (testing-api-contract-pinning, test-plan §3 Phase 2).
 *
 * The oracle is the decided-contract table in
 * `context/changes/testing-api-contract-pinning/plan.md`, never a handler's current
 * output. Two rules make that stick:
 *
 * 1. **Key sets are closed.** A body must carry exactly the contract's keys — no
 *    extras, none missing — so an additive field is a deliberate test edit rather
 *    than a silent pass, and a raw-row regression (snake_case keys present,
 *    camelCase absent) fails on both halves at once.
 * 2. **The key lists below are literal strings.** Deriving them from the domain
 *    types, or from `Object.keys` of a live response, would make a rename rename
 *    the expectation too — the tautology this phase exists to avoid. The types are
 *    imported for the asserters' *return* values only (caller convenience), never
 *    to generate an expectation.
 *
 * Failures name the missing and the extra set explicitly: a contract break has to
 * be diagnosable from a CI log alone (Phase 1's rule, see `./http.ts`).
 */

/** `UpgradePath`'s exact wire key set — literal, see rule 2 above. */
const UPGRADE_PATH_KEYS = ["id", "ownerId", "title", "visibility", "createdAt", "updatedAt"] as const;

/** `PathStep`'s exact wire key set — literal, see rule 2 above. */
const PATH_STEP_KEYS = [
  "id",
  "pathId",
  "position",
  "name",
  "listText",
  "snapshot",
  "deltaText",
  "createdAt",
  "updatedAt",
] as const;

/** `StepSnapshot`'s exact wire key set — what `serializeSnapshot` writes and `parseSnapshot` returns. */
const STEP_SNAPSHOT_KEYS = ["cards", "unresolved"] as const;

/** The `visibility` values the schema allows; anything else is a contract break. */
const VISIBILITIES = ["private", "unlisted"] as const;

/** Compact rendering of an unexpected value for a failure message. */
function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `an array (length ${value.length})`;
  }
  if (typeof value === "string") {
    return `the string ${JSON.stringify(value)}`;
  }
  return typeof value;
}

/**
 * Assert `value` is a plain object whose key set is exactly `keys`, returning it
 * as a record. Both the missing and the extra set are named, so a raw-row
 * regression reads as `missing [id, pathId, …], extra [id, path_id, …]` rather
 * than a bare boolean.
 */
export function expectExactKeys(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}: expected a plain object, got ${describeValue(value)}`);
  }

  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  const missing = keys.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !keys.includes(key));

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${label}: key set does not match the contract — missing [${missing.join(", ")}], extra [${extra.join(", ")}]. ` +
        `Expected exactly [${keys.join(", ")}], got [${actual.join(", ")}].`,
    );
  }
  return record;
}

/** Assert a field is a string. Blank is allowed — `listText` legitimately is. */
function expectString(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`${label}.${field}: expected a string, got ${describeValue(value)}`);
  }
  return value;
}

/** Assert a field is a non-blank string (ids and foreign keys are never empty). */
function expectNonEmptyString(record: Record<string, unknown>, field: string, label: string): string {
  const value = expectString(record, field, label);
  if (value.trim() === "") {
    throw new Error(`${label}.${field}: expected a non-empty string, got a blank one`);
  }
  return value;
}

/** Assert a field is a timestamp string a client can actually parse (both are rendered as dates). */
function expectTimestamp(record: Record<string, unknown>, field: string, label: string): string {
  const value = expectNonEmptyString(record, field, label);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label}.${field}: expected a parseable timestamp, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Assert a field is an array, returned untyped — element shape is out of scope here. */
function expectArray(record: Record<string, unknown>, field: string, label: string): unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(`${label}.${field}: expected an array, got ${describeValue(value)}`);
  }
  return value;
}

/**
 * Assert a value is an `UpgradePath` wire body: exactly the six contract keys,
 * each of the contract's type. Returns it typed so the caller can go on to assert
 * *values* (title, ordering) without a cast of its own.
 */
export function expectUpgradePath(value: unknown, label: string): UpgradePath {
  const record = expectExactKeys(value, UPGRADE_PATH_KEYS, label);

  const visibility = expectNonEmptyString(record, "visibility", label);
  if (!VISIBILITIES.includes(visibility as (typeof VISIBILITIES)[number])) {
    throw new Error(
      `${label}.visibility: expected one of [${VISIBILITIES.join(", ")}], got ${JSON.stringify(visibility)}`,
    );
  }

  return {
    id: expectNonEmptyString(record, "id", label),
    ownerId: expectNonEmptyString(record, "ownerId", label),
    title: expectString(record, "title", label),
    visibility: visibility as UpgradePath["visibility"],
    createdAt: expectTimestamp(record, "createdAt", label),
    updatedAt: expectTimestamp(record, "updatedAt", label),
  };
}

/**
 * Assert a value is a `PathStep` wire body: exactly the nine contract keys, a
 * numeric server-owned `position`, a `{cards, unresolved}` snapshot, and the
 * `deltaText` rule — `string | null`, **never** `undefined` and never absent.
 *
 * `deltaText` gets an explicit check on top of the closed key set because it is
 * research's #1 value-drift seam: a raw DB row makes it `undefined`, and
 * `undefined !== null` renders a spurious "diff" badge that a page reload heals.
 */
export function expectPathStep(value: unknown, label: string): PathStep {
  const record = expectExactKeys(value, PATH_STEP_KEYS, label);

  const position = record.position;
  if (typeof position !== "number" || !Number.isInteger(position) || position < 0) {
    throw new Error(`${label}.position: expected a non-negative integer, got ${describeValue(position)}`);
  }

  const deltaText = record.deltaText;
  if (deltaText !== null && typeof deltaText !== "string") {
    throw new Error(`${label}.deltaText: expected string | null (never undefined), got ${describeValue(deltaText)}`);
  }

  const snapshotRecord = expectExactKeys(record.snapshot, STEP_SNAPSHOT_KEYS, `${label}.snapshot`);
  const snapshot = {
    cards: expectArray(snapshotRecord, "cards", `${label}.snapshot`),
    unresolved: expectArray(snapshotRecord, "unresolved", `${label}.snapshot`),
  } as StepSnapshot;

  return {
    id: expectNonEmptyString(record, "id", label),
    pathId: expectNonEmptyString(record, "pathId", label),
    position,
    name: expectString(record, "name", label),
    listText: expectString(record, "listText", label),
    snapshot,
    deltaText,
    createdAt: expectTimestamp(record, "createdAt", label),
    updatedAt: expectTimestamp(record, "updatedAt", label),
  };
}

/**
 * Assert a 4xx body is exactly the `ApiError` envelope carrying `message`. The
 * envelope is closed too: a 500's `{error, ref}` must never satisfy a 4xx
 * assertion, and a 4xx must never grow a second field unnoticed.
 */
export function expectApiError(value: unknown, message: string, label: string): void {
  const record = expectExactKeys(value, ["error"], label);
  const error = expectNonEmptyString(record, "error", label);
  if (error !== message) {
    throw new Error(`${label}.error: expected ${JSON.stringify(message)}, got ${JSON.stringify(error)}`);
  }
}
