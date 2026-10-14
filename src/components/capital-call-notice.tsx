import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatUsdCode } from "@/lib/currency";
import type { CapitalCall } from "@/lib/capital-call";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[13rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold" : undefined}>{value || "—"}</dd>
    </div>
  );
}

/** The capital call notice, in the wording LUCA SGP issues it. */
export function CapitalCallNotice({ call }: { call: CapitalCall }) {
  const { account } = call;
  return (
    <article className="space-y-6 text-sm leading-6">
      {call.placeholder_account && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Placeholder bank details for demonstration. This is not a real account.
        </p>
      )}
      <p>Dear Member,</p>
      <p>
        Pursuant to the terms of the {call.agreement_name}
        {call.agreement_date ? ` dated ${date(call.agreement_date)}` : ""}, we hereby issue this
        Capital Call Notice requesting funding of capital commitments.
      </p>

      <section>
        <h3 className="font-semibold">Capital Call Summary</h3>
        <dl className="mt-1 divide-y border-y">
          <Row label="Capital Call Number" value={call.number} />
          <Row label="Call Date" value={date(call.call_date)} />
          <Row label="Payment Due Date" value={date(call.due_date)} />
          <Row label="Call Percentage" value="100% of Capital Commitments" />
          <Row label="Purpose of Capital Call" value={call.purpose} />
        </dl>
      </section>

      <section>
        <h3 className="font-semibold">Your Capital Call Details</h3>
        <dl className="mt-1 divide-y border-y">
          <Row label="Investor Name" value={call.investor_name} />
          <Row label="Total Capital Commitment" value={formatUsdCode(call.commitment)} />
          <Row label={call.fee_label} value={formatUsdCode(call.fee)} />
          <Row label="AMOUNT DUE" value={formatUsdCode(call.amount_due)} strong />
        </dl>
      </section>

      <section>
        <h3 className="font-semibold">Payment Instructions</h3>
        <p className="mt-1">
          All capital contributions must be received by wire transfer in US Dollars by the Payment
          Due Date specified above. Please wire funds to the following account:
        </p>
        <dl className="mt-2 divide-y border-y">
          <Row label="Beneficiary Bank Name" value={account.bank_name} />
          <Row label="Beneficiary Bank Address" value={account.bank_address} />
          <Row label="SWIFT/BIC Code" value={account.swift_bic} />
          {account.routing_aba && <Row label="Routing / ABA" value={account.routing_aba} />}
          <Row label="Beneficiary Account Name" value={account.account_name} />
          <Row label="Beneficiary Account Number" value={account.account_number} />
          <Row label="WIRE REFERENCE" value={call.wire_reference} strong />
        </dl>
        {(account.intermediary_bank_name || account.intermediary_swift) && (
          <dl className="mt-3 divide-y border-y">
            <Row label="Intermediary Bank Name" value={account.intermediary_bank_name} />
            <Row label="Intermediary SWIFT Code" value={account.intermediary_swift} />
          </dl>
        )}
      </section>

      <section>
        <h3 className="font-semibold">Important Payment Instructions</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Ensure the wire reference exactly matches the format shown above</li>
          <li>All bank charges must be borne by the investor (send funds OUR)</li>
          <li>Payments must be made from an account in the investor's name</li>
          <li>Please send wire confirmation to the contact below immediately upon transmission</li>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Questions or Concerns</h3>
        <p className="mt-1">
          If you have any questions regarding this capital call, please contact:
        </p>
        <p className="mt-1">
          {account.contact_name || "LUCA SGP investor relations"}
          <br />
          Email: {account.contact_email || "to be confirmed"}
          <br />
          Phone: {account.contact_phone || "to be confirmed"}
        </p>
      </section>

      <p>Thank you for your continued support and commitment to the Partnership.</p>
      <p>
        Sincerely,
        <br />
        {call.signatory}
      </p>
    </article>
  );
}

/** Opens a subscription's capital call notice over the current screen. */
export function CapitalCallDialog({
  subscriptionId,
  onClose,
}: {
  subscriptionId: number;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["capital-call", subscriptionId],
    queryFn: () =>
      api<{ capital_call: CapitalCall }>(`/api/v1/subscriptions/${subscriptionId}/capital_call`),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Capital call notice</DialogTitle>
        <DialogDescription className="sr-only">
          The capital call notice for this subscription.
        </DialogDescription>
        <div className="mt-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
          {data && <CapitalCallNotice call={data.capital_call} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
