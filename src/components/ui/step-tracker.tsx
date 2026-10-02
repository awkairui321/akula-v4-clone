import { CheckIcon, CircleIcon } from "lucide-react";

export type StepTrackerItem = { key: string; label: string };
export type StepState = "done" | "active" | "upcoming";

type StepTrackerProps = {
  steps: StepTrackerItem[];
  getState: (key: string) => StepState;
  /** "bar": segmented progress bar with labels underneath (checkout, onboarding sub-steps). */
  /** "flow": circular markers joined by a connector line, labels underneath (portfolio subscriptions). */
  variant?: "bar" | "flow";
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
  if (variant === "flow") {
    return (
      <ol className={`flex ${className ?? ""}`}>
        {steps.map((step, index) => {
          const state = getState(step.key);
          const previousDone = index > 0 && getState(steps[index - 1].key) === "done";
          return (
            <li
              key={step.key}
              aria-current={state === "active" ? "step" : undefined}
              className="relative flex flex-1 flex-col items-center gap-2 px-1"
            >
              {index > 0 && (
                <span
                  aria-hidden
                  className={`absolute top-3 right-1/2 h-px w-full -translate-y-1/2 ${
                    previousDone ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
              <span
                className={`relative z-10 flex size-6 items-center justify-center rounded-full bg-background ${
                  state === "done"
                    ? "bg-primary text-primary-foreground"
                    : state === "active"
                      ? "border-2 border-primary text-primary"
                      : "border border-muted-foreground/30"
                }`}
              >
                {state === "done" ? (
                  <CheckIcon className="size-3.5" />
                ) : state === "active" ? (
                  <CircleIcon className="size-2 fill-current" />
                ) : null}
              </span>
              <span
                className={`text-center text-[11px] leading-tight sm:text-xs ${
                  state === "active"
                    ? "font-medium text-foreground"
                    : state === "done"
                      ? "text-foreground"
                      : "text-muted-foreground/60"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
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
