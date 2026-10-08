import * as db from "./db";
import { persist, recordAudit } from "./workflow";
import { validUploadedFile, type UploadedFile } from "../lib/file-upload";
import { DOCUMENT_REQUEST_KINDS } from "../lib/document-catalogue";

export type CommunicationInput = {
  subject?: string;
  body?: string;
  audience_type?: db.CommunicationAudienceType;
  audience_description?: string;
  fund_id?: number | null;
  routing?: db.CommunicationRouting;
  purpose?: string;
  attachment_document_ids?: number[];
  uploaded_attachments?: UploadedFile[];
  send_at?: string | null;
  investor_ids?: number[];
  save_draft?: boolean;
  editor_state?: Record<string, unknown>;
};

function createRequests(message: db.MockCommunication, investorId: number, at: Date) {
  if (message.purpose !== "request") return;
  const kinds = message.editor_state?.docKinds;
  for (const kind of Array.isArray(kinds) ? kinds : []) {
    if (
      !DOCUMENT_REQUEST_KINDS.some((k) => k.key === kind) ||
      db.documentRequests.some(
        (r) =>
          r.investor_id === investorId &&
          r.kind === kind &&
          ["requested", "uploaded"].includes(r.status),
      )
    )
      continue;
    const due =
      typeof message.editor_state?.dueDate === "string"
        ? new Date(message.editor_state.dueDate + "T23:59:00")
        : null;
    db.documentRequests.push({
      id: db.nextDocumentRequestId(),
      investor_id: investorId,
      kind,
      fund_id: message.fund_id,
      note: null,
      requested_at: at.toISOString(),
      due_at: due && Number.isFinite(due.getTime()) ? due.toISOString() : null,
      status: "requested",
      reminded_at: null,
      received_document_id: null,
      communication_id: message.id,
    });
  }
}

/** The recipient list is frozen on scheduling. Delivery never expands it. */
export function deliverDueCommunications(at = new Date()) {
  let changed = false;
  for (const message of db.communications) {
    if (
      message.status !== "scheduled" ||
      !message.scheduled_at ||
      new Date(message.scheduled_at).getTime() > at.getTime()
    )
      continue;
    if (!Number.isFinite(new Date(message.scheduled_at).getTime())) continue;
    message.status = "sent";
    message.sent_at = at.toISOString();
    for (const recipient of db.communicationRecipients.filter(
      (r) => r.communication_id === message.id,
    )) {
      if (!db.adminInvestors().some((i) => i.id === recipient.investor_id)) continue;
      if ((message.delivery_channels ?? ["inbox"]).includes("inbox")) {
        recipient.delivered_at ??= at.toISOString();
        recipient.routed_via = "investor";
      }
      recipient.email_status = "pending_integration";
      createRequests(message, recipient.investor_id, at);
    }
    recordAudit(
      message.created_by ?? 1,
      `Scheduled communication #${message.id} processed for demo delivery.`,
    );
    changed = true;
  }
  if (changed) persist();
  return changed;
}

export function saveCommunication(
  user: db.MockUser,
  input: CommunicationInput,
  existingId?: number,
) {
  const existing =
    existingId === undefined ? undefined : db.communications.find((m) => m.id === existingId);
  if (existingId !== undefined && !existing) throw new Error("Communication not found.");
  if (existing?.status === "sent") throw new Error("Sent communications cannot be edited.");
  if (!input.subject?.trim()) throw new Error("Enter a subject before saving.");
  const ids = [...new Set(input.investor_ids ?? [])];
  const investors = db.adminInvestors();
  if (ids.some((id) => !investors.some((i) => i.id === id)))
    throw new Error("Choose authorized investor recipients.");
  if (!input.save_draft && (!input.body?.trim() || !ids.length))
    throw new Error("A message and at least one recipient are required.");
  if (input.purpose === "request" && input.editor_state?.docKinds) {
    const kinds = input.editor_state.docKinds;
    if (
      !Array.isArray(kinds) ||
      kinds.some((kind) => !DOCUMENT_REQUEST_KINDS.some((k) => k.key === kind))
    )
      throw new Error("Choose valid requested documents.");
    if (
      input.editor_state.dueDate &&
      !Number.isFinite(new Date(String(input.editor_state.dueDate) + "T23:59:00").getTime())
    )
      throw new Error("Choose a valid document due date.");
  }
  const uploads = input.uploaded_attachments ?? [];
  if (!Array.isArray(uploads) || uploads.length > 5 || !uploads.every(validUploadedFile))
    throw new Error("Attach up to 5 PDF, PNG or JPEG files, up to 2 MB each.");
  const attachmentIds = input.attachment_document_ids ?? [];
  if (
    !Array.isArray(attachmentIds) ||
    attachmentIds.some(
      (id) =>
        !db.documents.some(
          (d) => d.id === id && d.owner_name === "LUCA SGP" && d.subscription_id === null,
        ),
    )
  )
    throw new Error("Choose shared fund materials as attachments.");
  const now = new Date();
  const date = input.send_at ? new Date(input.send_at) : now;
  if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid scheduled date.");
  if (!input.save_draft && input.send_at && date.getTime() <= now.getTime())
    throw new Error("Choose a future scheduled date or Send now.");
  const status: db.CommunicationStatus = input.save_draft
    ? "draft"
    : input.send_at
      ? "scheduled"
      : "sent";
  const emailOnly = ["request", "remind_sign", "remind_fund"].includes(input.purpose ?? "");
  const message: db.MockCommunication = {
    id: existing?.id ?? db.nextCommunicationId(),
    created_by: user.id,
    subject: input.subject.trim(),
    body: input.body ?? "",
    purpose: input.purpose,
    audience_type: input.audience_type ?? "filtered_group",
    audience_description: input.audience_description ?? `${ids.length} investors`,
    fund_id: input.fund_id ?? null,
    routing: input.routing ?? "direct",
    uploaded_attachments: uploads,
    attachment_document_ids: attachmentIds,
    delivery_channels: emailOnly ? ["email"] : ["email", "inbox"],
    status,
    scheduled_at: status === "scheduled" ? date.toISOString() : null,
    sent_at: status === "sent" ? now.toISOString() : null,
    created_at: existing?.created_at ?? now.toISOString(),
    editor_state: input.editor_state,
  };
  if (existing) Object.assign(existing, message);
  else db.communications.unshift(message);
  for (let index = db.communicationRecipients.length - 1; index >= 0; index--) {
    if (db.communicationRecipients[index].communication_id === message.id)
      db.communicationRecipients.splice(index, 1);
  }
  for (const investorId of ids) {
    const investor = investors.find((i) => i.id === investorId)!;
    db.communicationRecipients.push({
      id: db.nextCommunicationRecipientId(),
      communication_id: message.id,
      investor_id: investor.id,
      investor_name: investor.full_name,
      investor_email: investor.email,
      eam_firm: investor.eam_firm,
      routed_via:
        emailOnly && input.routing === "through_rm" && investor.eam_firm ? "eam" : "investor",
      email_status: status === "scheduled" ? "scheduled" : "pending_integration",
      delivered_at: status === "sent" && !emailOnly ? now.toISOString() : null,
      opened_at: null,
      downloaded_document_ids: [],
    });
  }
  if (status === "sent") for (const investorId of ids) createRequests(message, investorId, now);
  recordAudit(
    user.id,
    `Communication #${message.id} ${status === "draft" ? "saved as draft" : status}.`,
  );
  persist();
  return message;
}

export function cancelScheduledCommunication(user: db.MockUser, id: number) {
  const message = db.communications.find((m) => m.id === id);
  if (!message || message.status !== "scheduled")
    throw new Error("Only scheduled communications can be cancelled.");
  message.status = "draft";
  message.scheduled_at = null;
  recordAudit(user.id, `Communication #${id} schedule cancelled; retained as draft.`);
  persist();
  return message;
}
