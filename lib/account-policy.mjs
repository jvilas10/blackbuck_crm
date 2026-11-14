import { createHash, randomBytes } from "node:crypto";
import { roles } from "../scripts/account-model.mjs";

export class AccountError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function text(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new AccountError(`Enter a valid ${label}.`);
  return value.trim();
}
export function emailAddress(value) {
  const email = text(value, "email address").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError("Enter a valid email address.");
  return email;
}
export function tokenHash(token) { return createHash("sha256").update(token).digest("hex"); }
export function invitationToken() { return randomBytes(32).toString("base64url"); }
export function canGrant(memberships, target) {
  if (!Object.values(roles).includes(target.role) || target.role === roles.platformOperations) return false;
  return memberships.some((member) =>
    member.role === roles.platformOperations ||
    (member.role === roles.agencyAdmin && member.agencyId === target.agencyId && target.role !== roles.agencyAdmin) ||
    (member.role === roles.clientSalesManager && member.agencyId === target.agencyId && member.clientId === target.clientId && target.role === roles.salesperson));
}
export function validInvitation(invite, now = new Date()) {
  return !!invite && invite.status === "pending" && invite.expiresAt > now;
}
