"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; className?: string; pending?: boolean };

/** `pending` overrides the form status for forms submitted through `onSubmit` + `startTransition`. */
export function SubmitButton({ children, className, pending: pendingProp }: Props) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className={className ?? "h-11 w-full"}>
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
