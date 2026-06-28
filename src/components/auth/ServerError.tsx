import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p className="flex items-center gap-2 rounded-md border border-[#6e3a33] bg-[#2a1714] px-3 py-2 text-sm text-[#e0867d]">
      <CircleAlert className="size-4 shrink-0" />
      {message}
    </p>
  );
}
