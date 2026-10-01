import { CheckIcon, CircleIcon } from "lucide-react";

export type StepTrackerItem = { key: string; label: string };
export type StepState = "done" | "active" | "upcoming";

type StepTrackerProps = {
  steps: StepTrackerItem[];
  getState: (key: string) => StepState;
  /** "bar": segmented progress bar with labels underneath (checkout, onboarding sub-steps). */
  /** "dots": circular check/dot markers with labels underneath (portfolio subscription cards). */
  variant?: "bar" | "dots";
  /** Bar variant only: set false for an unlabelled bar (e.g. onboarding sub-steps). */
  showLabels?: boolean;
  className?: string;
};

/** Reusable step tracker shared across multi-step flows (checkout, onboarding, portfolio). */
export function StepTracker({
  steps,
  getState,
  variant = "bar",
  showLabels = true,
  className,
}: StepTrackerProps) {
  if (variant === "dots") {
    return (
      <div className={`flex gap-1 ${className ?? ""}`}>
        {steps.map((step) => {
          const state = getState(step.key);
          return (
            <div key={step.key} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`flex size-5 items-center justify-center rounded-full text-xs ${
                  state === "done"
                    ? "bg-primary text-primary-foreground"
                    : state === "active"
                      ? "border-2 border-primary text-primary"
                      : "border border-muted-foreground/30 text-muted-foreground/30"
                }`}
              >
                {state === "done" ? (
                  <CheckIcon className="size-3" />
                ) : state === "active" ? (
                  <CircleIcon className="size-2 fill-current" />
                ) : null}
              </div>
              <span
                className={`text-center text-[10px] leading-tight ${
                  state !== "upcoming" ? "text-foreground" : "text-muted-foreground/50"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {steps.map((step) => {
          const state = getState(step.key);
          return (
            <div key={step.key} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={`h-1.5 w-full rounded-full ${state !== "upcoming" ? "bg-primary" : "bg-muted"}`}
              />
              {showLabels && (
                <span
                  className={`text-xs ${
                    state === "active"
                      ? "font-medium text-foreground"
                      : state === "done"
                        ? "text-muted-foreground"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {step.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
