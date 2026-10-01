import { authHandlers } from "./auth";
import { publicHandlers } from "./public";
import { investorHandlers } from "./investor";
import { adminHandlers } from "./admin";
import { eamHandlers } from "./eam";

export const handlers = [
  ...authHandlers,
  ...publicHandlers,
  ...investorHandlers,
  ...adminHandlers,
  ...eamHandlers,
];
