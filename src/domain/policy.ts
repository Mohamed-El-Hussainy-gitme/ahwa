import { ShiftRole } from "./model";

export type SessionContext = {
  userId: string;
  baseRole: "owner" | "staff";
  currentShiftRole?: ShiftRole; // من الوردية المفتوحة
};

export function canTakePayment(ctx: SessionContext) {
  return ctx.baseRole === "owner" || ctx.currentShiftRole === "supervisor";
}
export function canApplyDiscount(ctx: SessionContext) {
  return canTakePayment(ctx);
}
export function canUpdateKitchenItem(ctx: SessionContext, role: "barista" | "shisha") {
  return ctx.baseRole === "owner" || ctx.currentShiftRole === role;
}
