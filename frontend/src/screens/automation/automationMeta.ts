import type { Row } from "@/components/resource/ResourcePage";

export interface Step { name: string; type: string; target?: string; params?: Record<string, unknown> }
export interface Runbook extends Row {
  id: number; name: string; category: string; description: string; steps: Step[]; enabled: boolean; updatedAt: string;
  lastExecution: { id: number; status: string; startedAt: string } | null;
}
export interface StepResult { name: string; type: string; status: "passed" | "failed" | "skipped"; detail: string; ms: number }
export interface Execution extends Row {
  id: number; runbook: number; runbookName: string; startedAt: string; finishedAt: string | null; status: string; mode: string;
  triggeredBy: string; stepResults: StepResult[];
}

export const STEP_TYPES: { value: string; label: string; icon: string; live: boolean; placeholder: string }[] = [
  { value: "http_check", label: "HTTP check", icon: "fa-globe", live: true, placeholder: "https://service/health" },
  { value: "tcp_check", label: "TCP check", icon: "fa-plug", live: true, placeholder: "10.10.1.21:5672" },
  { value: "verify_health", label: "Verify health", icon: "fa-heart-pulse", live: true, placeholder: "domain:trading · device:<id> · vm:<id>" },
  { value: "wait", label: "Wait", icon: "fa-hourglass-half", live: true, placeholder: "(seconds in params, max 5)" },
  { value: "restart_service", label: "Restart service", icon: "fa-rotate", live: false, placeholder: "vm-app-01:nginx" },
  { value: "script", label: "Run script", icon: "fa-terminal", live: false, placeholder: "/opt/scripts/clear-cache.sh" },
  { value: "notify", label: "Notify", icon: "fa-bullhorn", live: false, placeholder: "#noc-alerts" },
];
export const STEP_META = Object.fromEntries(STEP_TYPES.map((s) => [s.value, s]));
export const EXEC_TONE: Record<string, string> = { success: "ok", failed: "crit", partial: "warn" };
export const STEP_TONE: Record<string, string> = { passed: "ok", failed: "crit", skipped: "muted" };
