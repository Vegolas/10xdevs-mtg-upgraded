import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { NotchButton } from "@/components/ui/NotchButton";

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
}

export function SubmitButton({ pendingText, icon, children }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <NotchButton type="submit" disabled={pending} className="w-full">
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <span className="size-4 animate-spin rounded-full border-2 border-[#2a1d08]/30 border-t-[#2a1d08]" />
          {pendingText}
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          {icon}
          {children}
        </span>
      )}
    </NotchButton>
  );
}
