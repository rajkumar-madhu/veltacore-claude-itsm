import React from "react";
import type { VmDetail } from "@/api/hooks";
import { Modal } from "@/components/ui";

export type ModalKind =
  | { kind: "confirm"; action: "power_off" | "reset" | "suspend" | "restart"; title: string; text: string }
  | { kind: "snapshot" } | { kind: "settings" } | { kind: "migrate" } | { kind: "clone" } | { kind: "command" };

export function VmActionModal({ vm, modal, busy, onClose, onSubmit }: {
  vm: VmDetail;
  modal: ModalKind;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: { action: string } & Record<string, unknown>) => void;
}) {
  const otherHosts = vm.details.clusterHosts.filter((h) => h.name !== vm.host);
  const [f, setF] = React.useState<Record<string, string>>({
    name: "", description: "", vcpu: String(vm.vcpu), memoryGb: String(vm.memoryGb),
    vmDescription: vm.description, targetHost: otherHosts[0]?.name ?? "", cloneName: `${vm.name}-CLONE`, command: "",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  let title = "", body: React.ReactNode = null, submitLabel = "Confirm", danger = false;
  let submit: () => void = () => {};

  switch (modal.kind) {
    case "confirm":
      title = modal.title; danger = modal.action === "power_off" || modal.action === "reset";
      submitLabel = modal.title;
      body = <p className="modal-text">{modal.text}</p>;
      submit = () => onSubmit({ action: modal.action });
      break;
    case "snapshot":
      title = "Take Snapshot"; submitLabel = "Take Snapshot";
      body = (<>
        <label className="field"><span>Name</span><input value={f.name} onChange={set("name")} placeholder="auto: snap-YYYYMMDD-HHMM" maxLength={80} autoFocus /></label>
        <label className="field"><span>Description</span><input value={f.description} onChange={set("description")} maxLength={200} /></label>
      </>);
      submit = () => onSubmit({ action: "take_snapshot", name: f.name, description: f.description });
      break;
    case "settings":
      title = "Edit VM Settings"; submitLabel = "Save";
      body = (<>
        <div className="field-row">
          <label className="field"><span>vCPU</span><input type="number" min={1} max={128} value={f.vcpu} onChange={set("vcpu")} /></label>
          <label className="field"><span>Memory (GB)</span><input type="number" min={1} max={4096} value={f.memoryGb} onChange={set("memoryGb")} /></label>
        </div>
        <label className="field"><span>Description</span><textarea rows={2} maxLength={240} value={f.vmDescription} onChange={set("vmDescription")} /></label>
      </>);
      submit = () => onSubmit({ action: "edit_settings", vcpu: Number(f.vcpu), memoryGb: Number(f.memoryGb), description: f.vmDescription });
      break;
    case "migrate":
      title = "Migrate / Move to Host"; submitLabel = "Migrate";
      body = otherHosts.length ? (<>
        <p className="modal-text">Live-migrate <b>{vm.name}</b> from <b>{vm.host}</b> to another host in {vm.cluster}.</p>
        <label className="field"><span>Target host</span>
          <select value={f.targetHost} onChange={set("targetHost")}>
            {otherHosts.map((h) => <option key={h.name} value={h.name}>{h.name} ({h.ip})</option>)}
          </select>
        </label>
      </>) : <p className="modal-text">No other hosts in {vm.cluster}.</p>;
      submit = () => onSubmit({ action: "migrate", targetHost: f.targetHost });
      break;
    case "clone":
      title = "Clone VM"; submitLabel = "Clone";
      body = (<>
        <p className="modal-text">Creates a powered-off copy of {vm.name} on {vm.host}.</p>
        <label className="field"><span>New VM name</span><input value={f.cloneName} onChange={set("cloneName")} maxLength={63} autoFocus /></label>
      </>);
      submit = () => onSubmit({ action: "clone", name: f.cloneName });
      break;
    case "command":
      title = "Run Command"; submitLabel = "Run";
      body = (<>
        <p className="modal-text">Runs in the guest via VMware Tools on <b>{vm.name}</b>.</p>
        <label className="field"><span>Command</span><input className="mono" value={f.command} onChange={set("command")} placeholder="e.g. systemctl status nginx" maxLength={200} autoFocus /></label>
      </>);
      submit = () => onSubmit({ action: "run_command", command: f.command });
      break;
  }

  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className={`btn ${danger ? "danger" : "primary"}`} onClick={submit} disabled={busy}>
        {busy && <i className="fa-solid fa-spinner fa-spin" />} {submitLabel}
      </button>
    </>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>{body}<button type="submit" hidden /></form>
    </Modal>
  );
}
