import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpgradePath } from "@/lib/path";

const textInputClasses =
  "flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 transition-colors focus:border-purple-400 focus:ring-2 focus:ring-purple-400 focus:outline-none";

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
    try {
      const response = await fetch("/api/paths", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Couldn't create the path (${response.status}).`);
        setPending(false);
        return;
      }
      const created = (await response.json()) as UpgradePath;
      window.location.href = `/paths/${created.id}`;
    } catch {
      setError("Couldn't create the path. Check your connection and retry.");
      setPending(false);
    }
  }, [title, pending]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
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
          placeholder="New path title"
          aria-label="New path title"
          className={textInputClasses}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-purple-400/50 bg-purple-500/20 text-white hover:bg-purple-500/30"
          disabled={pending}
          onClick={() => {
            void handleSubmit();
          }}
        >
          <Plus className="size-4" />
          New path
        </Button>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
