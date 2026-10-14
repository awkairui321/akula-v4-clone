import { disclaimerText } from "@/lib/offering";
import { cn } from "@/lib/utils";

/**
 * The standard disclaimer shown at the foot of investor-facing screens. Pass the fund label on
 * screens about one fund; elsewhere it speaks of the funds offered on the platform.
 */
export default function DisclaimerFooter({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <footer className={cn("border-t px-4 py-5 sm:px-6", className)}>
      <p className="mx-auto max-w-3xl text-xs leading-5 text-muted-foreground">
        {disclaimerText(label)}
      </p>
    </footer>
  );
}
