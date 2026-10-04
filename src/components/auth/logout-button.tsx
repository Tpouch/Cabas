import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth";
import { cn } from "@/lib/utils";

/** A plain form post: works even before JavaScript has loaded. */
export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="ghost" className={cn("h-11 justify-start gap-3 text-muted-foreground", className)}>
        <LogOut className="size-[18px]" aria-hidden />
        Se déconnecter
      </Button>
    </form>
  );
}
