import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { WorkflowCommand, WorkflowView } from "@/lib/workflow-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdviserClient, Discussion } from "./types";

export default function EamSupportPage() {
  const queryClient = useQueryClient();
  const [clientName, setClientName] = useState("");
  const [investmentId, setInvestmentId] = useState("");
  const [owner, setOwner] = useState("ops");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const { data: clients = [] } = useQuery({
    queryKey: ["eamClients"],
    queryFn: () => api<AdviserClient[]>("/api/v1/eam/clients"),
  });
  const { data: workflow } = useQuery({
    queryKey: ["eamWorkflow"],
    queryFn: () => api<WorkflowView>("/api/v1/workflows"),
  });
  const { data: discussions = [] } = useQuery({
    queryKey: ["eamDiscussions"],
    queryFn: () => api<Discussion[]>("/api/v1/eam/discussions"),
  });
  const selected = clients.find(
    (client) => client.client_name.toLowerCase() === clientName.trim().toLowerCase(),
  );
  const investments =
    workflow?.subscriptions.filter((row) => row.investor_id === selected?.investor_user_id) ?? [];
  const cases = (workflow?.cases ?? []).filter((item) => {
    const client = clients.find((row) => row.investor_user_id === item.investorId);
    return (
      !!client &&
      `${client.client_name} ${item.subject} ${item.id}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  const mutate = useMutation({
    mutationFn: (command: WorkflowCommand) =>
      api("/api/v1/workflows", { method: "POST", body: command }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eamWorkflow"] });
      setMessage("");
      toast.success("Case updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !message.trim()) return;
    mutate.mutate({
      type: "case",
      target: selected.investor_user_id,
      id: investmentId ? Number(investmentId) : undefined,
      status: owner,
      text: message.trim(),
    });
  }
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Client support</h1>
        <p className="text-muted-foreground">
          Raise a tracked case with Akula Ops or LUCA, and follow client conversations in one place.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Raise a case</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span>Client</span>
            <Input
              list="eam-support-clients"
              value={clientName}
              onChange={(event) => {
                setClientName(event.target.value);
                setInvestmentId("");
              }}
              placeholder="Type a client name"
              required
            />
            <datalist id="eam-support-clients">
              {clients.map((client) => (
                <option key={client.id} value={client.client_name} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1 text-sm">
            <span>Investment (optional)</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-2"
              value={investmentId}
              onChange={(event) => setInvestmentId(event.target.value)}
              disabled={!selected}
            >
              <option value="">Account question</option>
              {investments.map((investment) => (
                <option key={investment.id} value={investment.id}>
                  {investment.asset_name} · {investment.status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Route to</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-2"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            >
              <option value="ops">Akula Ops · processing</option>
              <option value="luca">LUCA · fund manager</option>
            </select>
          </label>
        </div>
        <Textarea
          aria-label="Question or issue"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Describe the question or issue"
          required
        />
        <Button type="submit" disabled={!selected || !message.trim() || mutate.isPending}>
          Create tracked case
        </Button>
        {clientName && !selected && (
          <p className="text-xs text-muted-foreground">Choose a client from your firm’s book.</p>
        )}
      </form>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Case history</h2>
          <Input
            aria-label="Search cases"
            className="max-w-xs"
            placeholder="Search cases or clients"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {cases.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            No cases match this search.
          </p>
        ) : (
          cases.map((item) => {
            const client = clients.find((row) => row.investor_user_id === item.investorId);
            return (
              <article key={item.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-medium">
                    #{item.id} · {client?.client_name} · {item.subject}
                  </h3>
                  <span className="text-sm text-muted-foreground capitalize">
                    {item.status} · {item.owner === "ops" ? "Akula Ops" : item.owner.toUpperCase()}
                  </span>
                </div>
                {item.messages.map((entry, index) => (
                  <p key={index} className="border-l-2 pl-3 text-sm">
                    {entry.text}
                  </p>
                ))}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const reply = window.prompt("Reply to this case");
                      if (reply?.trim())
                        mutate.mutate({ type: "reply", id: item.id, text: reply.trim() });
                    }}
                  >
                    Reply
                  </Button>
                  {item.owner === "eam" && item.status === "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => mutate.mutate({ type: "resolve", id: item.id })}
                    >
                      Resolve
                    </Button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Client conversations</h2>
        {discussions.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            No conversations yet.
          </p>
        ) : (
          discussions.map((item) => (
            <Link
              key={item.id}
              className="flex justify-between rounded-lg border p-4 text-sm hover:bg-muted/50"
              to={`/eam/clients/${item.adviser_client_id}?tab=conversations&discussion=${item.id}`}
            >
              <span>
                <strong>{item.client_name}</strong> · {item.fund_name}
              </span>
              <span className="text-muted-foreground capitalize">{item.status}</span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
