import { useState } from "react";
import { Button } from "@/components/ui/button";
import { resetDemo } from "@/mocks/workflow";
import { isMocking } from "@/mocks/browser";

export default function DemoResetButton({ compact = false }: { compact?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (!isMocking) return null;
  return confirming ? (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs">Reset this browser’s fictional demo records?</span>
      <Button size={compact ? "sm" : "default"} variant="destructive" onClick={resetDemo}>
        Reset all
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  ) : (
    <Button size={compact ? "sm" : "default"} variant="ghost" onClick={() => setConfirming(true)}>
      Reset demo
    </Button>
  );
}
