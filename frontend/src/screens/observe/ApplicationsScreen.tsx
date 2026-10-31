import { ServicesPage } from "./observeShared";

export default function ApplicationsScreen() {
  return <ServicesPage title="Applications" icon="fa-window-restore" crumb="Applications"
    sub="Business and platform application services with availability, latency, errors and saturation"
    filter={(s) => ["trading", "applications", "external-services"].includes(s.domainId)} />;
}
