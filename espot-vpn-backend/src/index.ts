import http from "node:http";
import { env } from "./env.js";
import { createApp } from "./api/app.js";
import { attachGateway, handleHttpProxy } from "./gateway/index.js";
import { logger } from "./lib/logger.js";

// Safety net: a forward proxy constantly deals with peers that reset/drop
// connections. A stray socket 'error' without a listener would otherwise take
// the whole process down (and every live tunnel with it). Swallow known
// network errors and keep serving; exit on anything genuinely unexpected so
// pm2 can restart cleanly.
const SAFE_NET_ERRORS = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  if (err?.code && SAFE_NET_ERRORS.has(err.code)) {
    logger.warn({ err }, "ignored network error (process kept alive)");
    return;
  }
  logger.error({ err }, "uncaught exception, exiting");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandled promise rejection");
});

const app = createApp();
const isProxyRequest = (req: http.IncomingMessage) => !!req.url && /^https?:\/\//i.test(req.url);

const server = http.createServer((req, res) => {
  // Absolute-form URLs are HTTP proxy requests; everything else is the API/portal.
  if (isProxyRequest(req)) {
    void handleHttpProxy(req, res);
    return;
  }
  app(req, res);
});

// CONNECT tunneling (HTTPS proxying) shares the same port.
attachGateway(server);

server.listen(env.port, () => {
  logger.info(`Espot VPN backend listening on port ${env.port}`);
  logger.info(`Admin portal:   http://localhost:${env.port}/`);
  logger.info(`Proxy gateway:  CONNECT via the same port (${env.gatewayPublicHost}:${env.port})`);
});

// Optional: a dedicated standalone gateway port for local testing.
if (env.gatewayPort && env.gatewayPort !== env.port) {
  const gatewayServer = http.createServer((req, res) => {
    if (isProxyRequest(req)) void handleHttpProxy(req, res);
    else {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Espot VPN gateway. Configure this host:port as your HTTP proxy.");
    }
  });
  attachGateway(gatewayServer);
  gatewayServer.listen(env.gatewayPort, () => {
    logger.info(`Standalone gateway listening on port ${env.gatewayPort}`);
  });
}
