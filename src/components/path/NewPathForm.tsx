import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/api/client";
import type { PathTitleRequest, UpgradePath } from "@/lib/api/contract";
import { useLatestRun } from "@/lib/async/useLatestRun";

const textInputClasses =
  "w-full rounded-[5px] border border-border bg-input px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 transition-colors focus:border-ring focus:ring-2 focus:ring-ring focus:outline-none";

/**
 * The "New path" create control on the `/paths` list. POSTs to `/api/paths`
 * (cookie-bound, RLS-owned) and navigates to the freshly created path's editor on
 * success, so creation and the editor share the same JSON API as every other path
 * mutation.
 *
 * The eighth async-then-setState flow in the app, and the one nobody had counted:
 * `context/foundation/lessons.md` and this change's own brief both list five
 * hand-copied guards and three absent ones, and none of the eight was this. It runs
 * at-most-one on a {@link useLatestRun} lane so the register entry can be CLOSED
 * rather than amended — one guard left behind means the next reader still has to
 * re-read all of them.
 */
export default function NewPathForm() {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Replaces the hand-rolled `pending`, whose read sat BEFORE its own `setPending(true)`
  // in the same closure — so two submits inside one tick both saw `false` and both
  // POSTed, exactly the gap `handleDeleteLast` had. `inFlight` is committed by the lane
  // before the first await, and it is what the submit control's `disabled` reads.
  const [inFlight, create] = useLatestRun();

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    // The guard is still read here as well as rendered below, because the title input's
    // own `onKeyDown` is a SECOND trigger and an `<input>` carries no `disabled` of the
    // button's — a held Enter key would otherwise submit repeatedly.
    if (trimmed === "" || inFlight) {
      return;
    }
    setError(null);
    await create.run(async () => {
      const request: PathTitleRequest = { title: trimmed };
      const result = await requestJson<UpgradePath>("/api/paths", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!result.ok) {
        const message =
          result.kind === "transport"
            ? "Couldn't create the path. Check your connection and retry."
            : result.fromBody
              ? result.error
              : `Couldn't create the path (${result.status}).`;
        return () => {
          setError(message);
        };
      }
      const createdId = result.data.id;
      return () => {
        window.location.href = `/paths/${createdId}`;
      };
    });
  }, [title, inFlight, create]);

  return (
    <div className="border-border bg-input flex min-h-[134px] flex-col items-center justify-center gap-3 rounded-md border border-dashed p-4 text-center">
      <div>
        <div className="font-display text-accent text-2xl leading-none">✦</div>
        <div className="font-display text-muted-foreground mt-1 text-[11px] tracking-[0.05em] uppercase">
          New comparison
        </div>
      </div>
      <input
        type="text"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            void handleSubmit();
          }
        }}
        placeholder="Title…"
        aria-label="New path title"
        className={textInputClasses}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="font-display bg-primary text-primary-foreground w-full justify-center border-[#a9863f] text-[11px] font-semibold tracking-[0.05em] uppercase transition-opacity hover:opacity-90"
        disabled={inFlight}
        onClick={() => {
          void handleSubmit();
        }}
      >
        <Plus className="size-4" />
        New path
      </Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
