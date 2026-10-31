import React from "react";
import type { DeviceDetail } from "@/api/hooks";
import { Modal } from "@/components/ui";

export function VendorMark({ vendor, size = 26 }: { vendor: string; size?: number }) {
  const v = vendor.toLowerCase();
  if (v === "cisco") return <span className="vendor cisco" style={{ fontSize: size }}><span className="bars">ıılıılıı</span>CISCO</span>;
  if (v === "dell") return <span className="vendor dell" style={{ fontSize: size * 0.58, width: size * 1.9, height: size * 1.9 }}>DELL</span>;
  if (v === "hpe") return <span className="vendor hpe" style={{ fontSize: size * 0.9 }}><span className="hpe-box" />HPE</span>;
  if (v === "fortinet") return <span className="vendor forti" style={{ fontSize: size * 0.8 }}>FORTINET</span>;
  return <span className="vendor" style={{ fontSize: size * 0.8 }}>{vendor || "—"}</span>;
}

export function EditDeviceModal({ d, busy, onClose, onSubmit }: {
  d: DeviceDetail; busy: boolean; onClose: () => void; onSubmit: (b: { action: string } & Record<string, string>) => void;
}) {
  const [f, setF] = React.useState({ role: d.role, location: d.location, contact: d.contact, description: d.description });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const submit = () => onSubmit({ action: "edit", ...f });
  return (
    <Modal title={`Edit ${d.hostname}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn primary" onClick={submit} disabled={busy}>{busy && <i className="fa-solid fa-spinner fa-spin" />} Save</button>
    </>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="field-row">
          <label className="field"><span>Role</span><input value={f.role} onChange={set("role")} maxLength={64} /></label>
          <label className="field"><span>Location</span><input value={f.location} onChange={set("location")} maxLength={64} /></label>
        </div>
        <label className="field"><span>Contact email</span><input type="email" value={f.contact} onChange={set("contact")} /></label>
        <label className="field"><span>Description</span><textarea rows={2} maxLength={240} value={f.description} onChange={set("description")} /></label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function ConfirmModal({ title, text, danger, busy, onClose, onConfirm }: {
  title: string; text: string; danger?: boolean; busy: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className={`btn ${danger ? "danger" : "primary"}`} onClick={onConfirm} disabled={busy}>{busy && <i className="fa-solid fa-spinner fa-spin" />} {title}</button>
    </>}><p className="modal-text">{text}</p></Modal>
  );
}
