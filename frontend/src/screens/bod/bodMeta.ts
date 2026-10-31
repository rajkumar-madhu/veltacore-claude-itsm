import type { Row } from "@/components/resource/ResourcePage";

export interface BodResult { checkId: number; check: string; category: string; critical: boolean; status: "pass" | "warn" | "fail"; detail: string }
export interface BodRun extends Row {
  id: number; phase: "BOD" | "EOD"; startedAt: string; finishedAt: string; status: "pass" | "warn" | "fail"; triggeredBy: string; results: BodResult[];
}
export const RESULT_TONE: Record<string, string> = { pass: "ok", warn: "warn", fail: "crit" };
export const RESULT_ICON: Record<string, string> = { pass: "fa-circle-check", warn: "fa-triangle-exclamation", fail: "fa-circle-xmark" };
export const RESULT_LABEL: Record<string, string> = { pass: "Passed", warn: "Warning", fail: "Failed" };
