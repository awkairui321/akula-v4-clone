import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";

const TOPICS = [
  { value: "transfer", label: "Bank transfer or payment reference" },
  { value: "early-exit", label: "Early-exit transfer review" },
  { value: "allocation", label: "Allocation or returned funds" },
  { value: "documents", label: "Incorrect or missing document" },
  { value: "profile", label: "Update investor profile" },
  { value: "consent", label: "Consent or withdrawal" },
];

export default function SupportPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [topic, setTopic] = useState(params.get("topic") ?? "transfer");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = () => {
    // TODO: POST to backend, which forwards to external support system
    setSent(true);
  };

  if (sent) {
    return (
      <div className="mx-auto mt-8 max-w-xl">
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h2 className="mt-4 text-xl font-semibold">Support request recorded</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Your request has been submitted. You will receive a confirmation and reference number
              once it has been processed.
            </p>
            <Button className="mt-6" onClick={() => navigate("/portfolio")}>
              Return to portfolio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Secure support
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">How can we help?</h1>
        <p className="mt-1 text-muted-foreground">
          Raise a tracked request for an operational problem. Investment suitability questions
          should be directed to your adviser.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5 py-6">
          <div className="flex flex-col gap-2">
            <Label>Request type</Label>
            <Select value={topic} onValueChange={(val) => val && setTopic(val)}>
              <SelectTrigger className="w-full">
                <SelectValue>{TOPICS.find((t) => t.value === topic)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TOPICS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>What happened?</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Include the project name, date and the issue. Do not include passwords or full bank-account details."
              className="min-h-32"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Akula support handles platform, funding and document issues. For opportunity rationale
            or suitability, use the discussion feature from the relevant opportunity.
          </p>

          <Button size="lg" className="w-full" disabled={!note.trim()} onClick={handleSubmit}>
            Submit secure request
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
