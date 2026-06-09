import type { Server, IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import net from "node:net";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, sessions, users } from "../db/index.js";
import { logger } from "../lib/logger.js";
import { parseProxyAuth, resolveClient } from "./resolve.js";
import { dialUpstream } from "./upstream.js";
import { isHostBlocked } from "../lib/blocklist.js";
import { isForbiddenTarget } from "../lib/guard.js";
import { registerSocket, unregisterSocket } from "./state.js";

// Headers that must not be forwarded to the upstream (RFC 7230 §6.1).
const HOP_BY_HOP = new Set([
  "connection",
  "proxy-connection",
  "keep-alive",
  "proxy-authorization",
  "proxy-authenticate",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// Buffer per-session byte counts and flush periodically to reduce DB writes.
const usage = new Map<string, { up: number; down: number }>();

function track(sessionId: string, up: number, down: number) {
  const cur = usage.get(sessionId) ?? { up: 0, down: 0 };
  cur.up += up;
  cur.down += down;
  usage.set(sessionId, cur);
}

async function flushUsage() {
  if (usage.size === 0) return;
  const snapshot = new Map(usage);
  usage.clear();
  for (const [sessionId, { up, down }] of snapshot) {
    try {
      await db
        .update(sessions)
        .set({
          bytesUp: sql`${sessions.bytesUp} + ${up}`,
          bytesDown: sql`${sessions.bytesDown} + ${down}`,
          lastSeenAt: new Date(),
        })
        .where(eq(sessions.id, sessionId));
      const [s] = await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.id, sessionId));
      if (s) {
        await db
          .update(users)
          .set({ dataUsedBytes: sql`${users.dataUsedBytes} + ${up + down}` })
          .where(eq(users.id, s.userId));
      }
    } catch (err) {
      logger.warn({ err, sessionId }, "usage flush failed");
    }
  }
}

function parseHostPort(authority: string, defaultPort: number): { host: string; port: number } {
  const lastColon = authority.lastIndexOf(":");
  if (lastColon === -1) return { host: authority, port: defaultPort };
  return { host: authority.slice(0, lastColon), port: Number(authority.slice(lastColon + 1)) || defaultPort };
}

function pipeCounting(clientSocket: Duplex, upstream: net.Socket, sessionId: string) {
  // Register both sockets so an admin force-logout can drop this live tunnel.
  registerSocket(sessionId, clientSocket, upstream);
  clientSocket.on("data", (d: Buffer) => track(sessionId, d.length, 0));
  upstream.on("data", (d: Buffer) => track(sessionId, 0, d.length));
  clientSocket.pipe(upstream);
  upstream.pipe(clientSocket);
  const cleanup = () => {
    unregisterSocket(sessionId, clientSocket, upstream);
    clientSocket.destroy();
    upstream.destroy();
  };
  clientSocket.on("error", cleanup);
  upstream.on("error", cleanup);
  clientSocket.on("close", cleanup);
  upstream.on("close", cleanup);
}

/** Handle HTTPS proxying (the CONNECT method). */
async function handleConnect(req: IncomingMessage, clientSocket: Duplex, head: Buffer) {
  const creds = parseProxyAuth(req.headers["proxy-authorization"]);
  if (!creds) {
    clientSocket.write(
      'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Espot VPN"\r\n\r\n',
    );
    clientSocket.end();
    return;
  }
  const client = await resolveClient(creds.username, creds.password);
  if (!client) {
    clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    clientSocket.end();
    return;
  }
  const { host, port } = parseHostPort(req.url ?? "", 443);
  if (isForbiddenTarget(host)) {
    clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\nInternal addresses are not allowed.");
    clientSocket.end();
    return;
  }
  if (isHostBlocked(host, client.blocked)) {
    clientSocket.write("HTTP/1.1 451 Unavailable For Legal Reasons\r\n\r\nSite blocked by Espot VPN.");
    clientSocket.end();
    return;
  }
  try {
    const upstream = await dialUpstream(client.proxy, host, port);
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head && head.length) upstream.write(head);
    pipeCounting(clientSocket, upstream, client.sessionId);
  } catch (err) {
    logger.warn({ err, host }, "CONNECT upstream dial failed");
    clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    clientSocket.end();
  }
}

/** Handle plain HTTP proxying (absolute-form request URLs). */
async function handleHttpProxy(req: IncomingMessage, res: ServerResponse) {
  const creds = parseProxyAuth(req.headers["proxy-authorization"]);
  if (!creds) {
    res.writeHead(407, { "Proxy-Authenticate": 'Basic realm="Espot VPN"' });
    res.end();
    return;
  }
  const client = await resolveClient(creds.username, creds.password);
  if (!client) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  let target: URL;
  try {
    target = new URL(req.url ?? "");
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (isForbiddenTarget(target.hostname)) {
    res.writeHead(403);
    res.end("Internal addresses are not allowed.");
    return;
  }
  if (isHostBlocked(target.hostname, client.blocked)) {
    res.writeHead(451);
    res.end("Site blocked by Espot VPN.");
    return;
  }
  const port = Number(target.port) || 80;
  try {
    const upstream = await dialUpstream(client.proxy, target.hostname, port);
    const clientSocket = res.socket;
    if (clientSocket) registerSocket(client.sessionId, upstream, clientSocket);
    // When chaining through an HTTP upstream proxy, send the absolute URL;
    // for direct/socks connections send the origin-form path.
    const useAbsolute = client.proxy != null && client.proxy.protocol !== "socks5";
    const requestTarget = useAbsolute ? req.url! : target.pathname + target.search;
    const headerLines = [`${req.method} ${requestTarget} HTTP/1.1`];
    const headers = { ...req.headers };
    // Strip hop-by-hop headers; they apply to the client<->proxy hop only and
    // must not be forwarded upstream (RFC 7230).
    for (const name of Object.keys(headers)) {
      if (HOP_BY_HOP.has(name.toLowerCase())) delete headers[name];
    }
    if (useAbsolute && client.proxy?.username && client.proxy.password) {
      headers["proxy-authorization"] = `Basic ${Buffer.from(`${client.proxy.username}:${client.proxy.password}`).toString("base64")}`;
    }
    headers["connection"] = "close";
    for (const [k, v] of Object.entries(headers)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((vv) => headerLines.push(`${k}: ${vv}`));
      else headerLines.push(`${k}: ${v}`);
    }
    upstream.write(headerLines.join("\r\n") + "\r\n\r\n");
    req.on("data", (d: Buffer) => {
      track(client.sessionId, d.length, 0);
      upstream.write(d);
    });
    req.on("end", () => upstream.end());
    upstream.on("data", (d: Buffer) => track(client.sessionId, 0, d.length));
    if (clientSocket) upstream.pipe(clientSocket);
    const cleanup = () => {
      if (clientSocket) unregisterSocket(client.sessionId, upstream, clientSocket);
      upstream.destroy();
    };
    upstream.on("error", () => {
      cleanup();
      res.socket?.destroy();
    });
    upstream.on("close", cleanup);
  } catch (err) {
    logger.warn({ err, host: target.hostname }, "HTTP proxy dial failed");
    res.writeHead(502);
    res.end("Bad gateway");
  }
}

function isProxyRequest(req: IncomingMessage): boolean {
  return !!req.url && /^https?:\/\//i.test(req.url);
}

/**
 * Attach the proxy gateway to an existing HTTP server so the API/portal and the
 * proxy share one port (works locally and on hosts that pass CONNECT). The
 * returned predicate lets the server delegate non-proxy requests to Express.
 */
export function attachGateway(server: Server): (req: IncomingMessage) => boolean {
  server.on("connect", (req, socket, head) => {
    // Attach an error handler immediately. The raw CONNECT socket can reset
    // (ECONNRESET) while we await auth/upstream dial below; without a listener
    // Node would emit an unhandled 'error' and crash the whole process.
    socket.on("error", (err) =>
      logger.warn({ err }, "client CONNECT socket error"),
    );
    handleConnect(req, socket as Duplex, head).catch((err) =>
      logger.error({ err }, "handleConnect crashed"),
    );
  });
  setInterval(() => void flushUsage(), 10000).unref();
  return isProxyRequest;
}

export { handleHttpProxy };
