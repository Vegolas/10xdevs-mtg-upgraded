import type { APIRoute } from "astro";
import { errorResponse, jsonResponse, parsePathId, requireUser, serverError, toPathStep } from "@/lib/api/paths";
import type { PathStep } from "@/lib/api/contract";
import { parseSnapshot, parseStepInput, serializeSnapshot, verifyDerived } from "@/lib/path";
import type { DerivedViolation, StepInput } from "@/lib/path";
import type { Json } from "@/lib/database.types";

/**
 * The `400` sentence each {@link DerivedViolation} answers with, before the
 * verdict's `detail` is appended.
 *
 * A `Record` over the closed reason set on purpose: adding a violation to the
 * verifier is a wire-contract change, and this map is where `tsc` says so. Phrased
 * for the person who pasted the diff rather than for the developer who wrote the
 * rule — these strings reach the checkpoint form verbatim.
 */
const VIOLATION_MESSAGE: Record<DerivedViolation, string> = {
  "unapplicable-removal": "That change removes a card the previous checkpoint does not have",
  "quantity-mismatch": "The saved copy counts do not match the changes",
  "untouched-card-changed": "A card your changes never mention was altered",
  "unresolved-prefix": "The previous checkpoint's unresolved cards must carry forward",
  "excess-new-cards": "The checkpoint holds cards your changes never added",
};

/** The cookie-bound client the handlers already hold, named so the helpers below can take it. */
type StepsClient = Exclude<ReturnType<typeof requireUser>, Response>["supabase"];

/** Where the new step lands. Either helper may answer with a `Response` instead — that is the refusal. */
interface Appendable {
  position: number;
}

/**
 * `position` for a full-paste append: the same single `max(position)` read this
 * route has always done.
 *
 * Deliberately not merged with {@link verifiedAppend}. Full paste has nothing to
 * verify — there is no delta to be consistent with — so it must not start paying
 * for the prior step's `jsonb` snapshot to satisfy a check it never runs.
 */
async function nextFullPastePosition(supabase: StepsClient, pathId: string): Promise<Appendable | Response> {
  const { data: last, error } = await supabase
    .from("path_steps")
    .select("position")
    .eq("path_id", pathId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return serverError(error);
  }
  return { position: (last?.position ?? -1) + 1 };
}

/**
 * `position` for a diff-authored append, once the submitted snapshot has been
 * proven to be `prior ± deltaText`.
 *
 * The order is load-bearing and pinned by the contract suites: a missing prior
 * (`400`), then an unnamed prior (`400`), then a raced prior (`409`), then the
 * verifier (`400`). Concurrency precedes verification because a stale derive would
 * otherwise be reported as a *correctness* failure naming cards the user never
 * touched — accurate but unactionable, when the fix is simply to reload.
 *
 * A prior row whose stored snapshot fails {@link parseSnapshot} is a `500`, not a
 * `400`: verifying against a silently emptied prior would reject a correct
 * submission, and that corruption is ours to find in the log rather than the
 * caller's to work around.
 */
async function verifiedAppend(
  supabase: StepsClient,
  pathId: string,
  input: StepInput,
  deltaText: string,
): Promise<Appendable | Response> {
  const { data: prior, error } = await supabase
    .from("path_steps")
    .select("id, position, snapshot")
    .eq("path_id", pathId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return serverError(error);
  }
  if (!prior) {
    return errorResponse("Diff checkpoint needs a previous step", 400);
  }
  if (input.priorStepId === null) {
    return errorResponse("Diff checkpoint must name the step it derives from", 400);
  }
  if (input.priorStepId !== prior.id) {
    return errorResponse("Path changed since you started", 409);
  }

  const priorSnapshot = parseSnapshot(prior.snapshot);
  if (priorSnapshot === null) {
    return serverError(new Error(`stored snapshot for step ${prior.id} failed parseSnapshot`));
  }

  const verdict = verifyDerived(priorSnapshot, input.snapshot, deltaText);
  if (!verdict.ok) {
    return errorResponse(`${VIOLATION_MESSAGE[verdict.reason]}: ${verdict.detail}`, 400);
  }

  return { position: prior.position + 1 };
}

/**
 * POST /api/paths/[id]/steps {name, listText, snapshot, deltaText?, priorStepId?}
 * — append a checkpoint.
 *
 * Server computes `position = max(position) + 1` (base is 0), validates the
 * snapshot via {@link parseStepInput} (400 on a malformed body), stores it, and
 * bumps the parent's `updated_at`. 404 when the path is not owned/absent (RLS).
 *
 * Body validation runs BEFORE the ownership check, so a malformed body aimed at
 * another owner's path answers 400, not 404. That ordering is part of the decided
 * contract, not an accident — keep it.
 *
 * **A diff-authored checkpoint (`deltaText` non-null) is additionally verified
 * against the step it claims to derive from.** Derivation happens in the browser —
 * the server never resolves cards in a request path — so before this check any
 * structurally valid snapshot was accepted alongside any `deltaText`, and an
 * unapplicable `- <card>` was a silent no-op persisted as a removal that never
 * happened (test-plan §3, risks #4 and #5). The gate is {@link verifyDerived}:
 * pure, resolution-free, and paid for by one owner-scoped read of the prior step.
 *
 * That read is why the verifier runs AFTER the ownership check while body
 * validation stays before it. Its rejections describe the stored chain, so
 * answering one to a non-owner would leak whether someone else's path exists.
 */
export const POST: APIRoute = async (context) => {
  const auth = requireUser(context);
  if (auth instanceof Response) {
    return auth;
  }
  const id = parsePathId(context);
  if (id === null) {
    return errorResponse("Not found", 404);
  }

  const body = (await context.request.json().catch(() => null)) as unknown;
  const input = parseStepInput(body);
  if (input === null) {
    return errorResponse("Invalid step payload", 400);
  }

  // Confirm the path exists and is owned (RLS-scoped) before appending.
  const { data: pathRow, error: pathError } = await auth.supabase
    .from("upgrade_paths")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (pathError) {
    return serverError(pathError);
  }
  if (!pathRow) {
    return errorResponse("Not found", 404);
  }

  const appendable =
    input.deltaText === null
      ? await nextFullPastePosition(auth.supabase, id)
      : await verifiedAppend(auth.supabase, id, input, input.deltaText);
  if (appendable instanceof Response) {
    return appendable;
  }

  const { data, error } = await auth.supabase
    .from("path_steps")
    .insert({
      path_id: id,
      position: appendable.position,
      name: input.name,
      list_text: input.listText,
      snapshot: serializeSnapshot(input.snapshot) as Json,
      delta_text: input.deltaText ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return serverError(error);
  }

  await auth.supabase.from("upgrade_paths").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return jsonResponse<PathStep>(toPathStep(data), 201);
};

/**
 * DELETE /api/paths/[id]/steps — remove only the highest-position step
 * (delete-last invariant), then bump the parent's `updated_at`. 404 when the
 * path has no steps or is not owned/absent (RLS).
 *
 * This route never queries `upgrade_paths`, so a cross-owner call is answered by
 * RLS hiding the steps: `{error: "No steps to delete"}`, indistinguishable from an
 * empty own path. Correct, and a pinned contract fact.
 */
export const DELETE: APIRoute = async (context) => {
  const auth = requireUser(context);
  if (auth instanceof Response) {
    return auth;
  }
  const id = parsePathId(context);
  if (id === null) {
    return errorResponse("Not found", 404);
  }

  const { data: last, error: lastError } = await auth.supabase
    .from("path_steps")
    .select("id, position")
    .eq("path_id", id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    return serverError(lastError);
  }
  if (!last) {
    return errorResponse("No steps to delete", 404);
  }

  const { error } = await auth.supabase.from("path_steps").delete().eq("id", last.id);
  if (error) {
    return serverError(error);
  }

  await auth.supabase.from("upgrade_paths").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return new Response(null, { status: 204 });
};
