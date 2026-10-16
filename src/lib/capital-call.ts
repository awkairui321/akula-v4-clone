/**
 * The capital call notice issued to an investor once their subscription agreement is signed.
 * The wording follows the template LUCA SGP supplied; fields it leaves blank come from the deal.
 */
import { MANAGER_LEGAL_NAME, offeringOf, type TransferAccount } from "./offering";
import type { Fund } from "./types";

export type CapitalCall = {
  number: string;
  call_date: string;
  due_date: string;
  /** The notice opens by naming the agreement it is issued under. */
  agreement_name: string;
  agreement_date: string | null;
  purpose: string;
  investor_name: string;
  commitment: string;
  fee_label: string;
  fee: string;
  amount_due: string;
  wire_reference: string;
  account: TransferAccount;
  placeholder_account: boolean;
  signatory: string;
};

/** The date `days` business days after `from`, skipping Saturdays and Sundays. */
export function addBusinessDays(from: Date, days: number): Date {
  const date = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}

export function buildCapitalCall(input: {
  subscriptionId: number;
  fund: Fund;
  investorName: string;
  amount: string;
  fee: string;
  paymentReference: string;
  calledAt: string | null;
  account: TransferAccount;
}): CapitalCall {
  const { fund } = input;
  const offering = offeringOf(fund);
  const calledAt = new Date(input.calledAt ?? Date.now());
  const asset = fund.asset;
  const founded = asset.founded_year ? ` Founded in ${asset.founded_year}.` : "";
  const feePct = Number(input.amount) > 0 ? (Number(input.fee) / Number(input.amount)) * 100 : 0;
  return {
    number: `CC-${String(input.subscriptionId).padStart(4, "0")}`,
    call_date: calledAt.toISOString(),
    due_date: addBusinessDays(calledAt, 5).toISOString(),
    agreement_name: offering.agreement_name,
    agreement_date: offering.agreement_date,
    purpose: `The capital called under this notice will be used to fund the acquisition of an interest in ${(asset.legal_name ?? asset.name).replace(/\.$/, "")}. ${asset.description}${founded}`,
    investor_name: input.investorName,
    commitment: input.amount,
    fee_label: `Placement Fee (${feePct.toFixed(1)}%)`,
    fee: input.fee,
    amount_due: (Number(input.amount) + Number(input.fee)).toFixed(2),
    wire_reference: input.paymentReference,
    account: input.account,
    placeholder_account: input.account.placeholder,
    signatory: MANAGER_LEGAL_NAME.replace(" Pte. Ltd.", ""),
  };
}
