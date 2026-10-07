import { useRef, useState } from "react";
import { PaperclipIcon } from "lucide-react";
import { FILE_ACCEPT } from "@/lib/file-upload";
import { Button } from "@/components/ui/button";

export default function FileDropzone({
  label = "Attach files",
  disabled = false,
  multiple = false,
  onFiles,
}: {
  label?: string;
  disabled?: boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const busy = disabled || reading;
  async function choose(files: File[]) {
    if (busy || !files.length) return;
    setError("");
    if (!multiple && files.length > 1) {
      setError("Choose one file for this document.");
      return;
    }
    setReading(true);
    try {
      await onFiles(files);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload.");
    } finally {
      setReading(false);
    }
  }
  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void choose(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4 ${dragging ? "border-primary bg-primary/5" : "bg-muted/20"} ${busy ? "opacity-60" : ""}`}
      >
        <div className="flex items-center gap-3">
          <PaperclipIcon className="size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {reading ? "Reading file..." : "Drag and drop here"}
            </p>
            <p className="text-xs text-muted-foreground">PDF, PNG or JPEG · Up to 2 MB per file</p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {label}
        </Button>
        <input
          ref={input}
          type="file"
          accept={FILE_ACCEPT}
          multiple={multiple}
          disabled={busy}
          aria-label={label}
          className="sr-only"
          onChange={(e) => {
            void choose(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
