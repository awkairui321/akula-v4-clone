import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Requests() {
  // TODO: Connect to backend values
  const EAM = "Aisha Tan";
  const REQUESTS = [
    {
      company: "ByteDance",
      status: "Sourcing review",
      updated: "12 Aug 2026",
    },
    {
      company: "Canva",
      status: "Opportunity shared",
      updated: "18 Aug 2026",
    },
    {
      company: "Discord",
      status: "EAM review",
      updated: "20 Aug 2026",
    },
  ];

  const [company, setCompany] = useState("");

  // TODO: hook up submitting a sourcing request
  const onSubmit = () => setCompany("");

  return (
    <div className="flex flex-col gap-6 py-2">
      <div>
        <strong className="font-bold">Non-binding sourcing request. </strong>
        {EAM} and Akula can review the company. This is not a pledge, reservation, pooled demand
        threshold or commitment.
      </div>

      <Card className="box-shadow shadow-sm ring-2">
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="request-company">Request a company</Label>
          <div className="flex flex-row items-center gap-2">
            <Input
              className="bg-muted"
              id="request-company"
              placeholder="e.g. ByteDance, Canva, Discord…"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
            <Button disabled={!company.trim()} onClick={onSubmit}>
              Express interest
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {REQUESTS.map((request) => (
          <Card key={request.company}>
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-row flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{request.company}</span>
                <Badge variant="secondary">{request.status}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Updated {request.updated} · {EAM} and Akula receive the same request status.
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
