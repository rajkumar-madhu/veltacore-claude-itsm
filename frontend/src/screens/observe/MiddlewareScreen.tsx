import { ServicesPage } from "./observeShared";

const MIDDLEWARE = /rabbit|redis|kafka|mq|keycloak|vault|market data|nginx|waf|load balancer/i;

export default function MiddlewareScreen() {
  return <ServicesPage title="Middleware" icon="fa-layer-group" crumb="Middleware"
    sub="Message brokers, caches, identity and edge services that applications depend on"
    filter={(s) => MIDDLEWARE.test(s.name)} />;
}
