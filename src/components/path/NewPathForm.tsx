import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/api/client";
import type { PathTitleRequest, UpgradePath } from "@/lib/api/contract";

const textInputClasses =
  "w-full rounded-[5px] border border-border bg-input px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 transition-colors focus:border-ring focus:ring-2 focus:ring-ring focus:outline-none";

/**
 * The "New path" create control on the `/paths` list. POSTs to `/api/paths`
 * (cookie-bound, RLS-owned) and navigates to the freshly created path's editor on
 * success, so creation and the editor share the same JSON API as every other path
 * mutation. Pending-guarded to avoid double submits.
 */
export default function NewPathForm() {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = title.trim();
    if (trimmed === "" || pending) {
      return;
    }
    setPending(true);
    setError(null);
    const request: PathTitleRequest = { title: trimmed };
    const result = await requestJson<UpgradePath>("/api/paths", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!result.ok) {
      setError(
        result.kind === "transport"
          ? "Couldn't create the path. Check your connection and retry."
          : result.fromBody
            ? result.error
            : `Couldn't create the path (${result.status}).`,
      );
      setPending(false);
      return;
    }
    window.location.href = `/paths/${result.data.id}`;
  }, [title, pending]);

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
        disabled={pending}
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
