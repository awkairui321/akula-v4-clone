import { workflowHandlers } from "./workflow";
import { guardHandlers } from "./guard";
import { authHandlers } from "./auth";
import { publicHandlers } from "./public";
import { investorHandlers } from "./investor";
import { adminHandlers } from "./admin";
import { eamHandlers } from "./eam";
import { rmHandlers } from "./rm";
import { clientHandlers } from "./client";

export const handlers = [
  ...guardHandlers,
  ...workflowHandlers,
  ...authHandlers,
  ...publicHandlers,
  ...investorHandlers,
  ...adminHandlers,
  ...eamHandlers,
  ...rmHandlers,
  ...clientHandlers,
];
