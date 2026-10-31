import { useNavigate } from "react-router-dom";
import { Breadcrumbs } from "@/components/ui";
import { BulkImport, RecentDevices } from "./panels";

export default function ImportScreen() {
  const navigate = useNavigate();
  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Onboarding" }, { label: "Import Devices" }]} />
      <div className="page-head"><div className="title-with-icon"><i className="fa-solid fa-file-import" /><div><h1 className="page-title">Import Devices</h1>
        <div className="page-sub">Bulk-onboard from a CSV file or a subnet scan; every row is validated before it's created</div></div></div></div>
      <div className="stack-gap"><BulkImport onUseIp={(ip) => navigate(`/onboarding?ip=${encodeURIComponent(ip)}`)} /></div>
      <RecentDevices />
    </div>
  );
}
