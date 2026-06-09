import tls from "node:tls";
import type net from "node:net";
import type { Proxy } from "../db/schema.js";
import { dialUpstream } from "../gateway/upstream.js";

export interface ProxyTestResult {
  ok: boolean;
  exitIp?: string;
  latencyMs?: number;
  error?: string;
}

const TEST_HOST = "api.ipify.org";
const TEST_PORT = 443;
const TIMEOUT_MS = 12000;

/**
 * Verify a proxy works by dialing through it to an IP-echo service over the
 * exact CONNECT-through-upstream path the gateway uses for real traffic, then
 * reading back the egress IP the destination sees.
 */
export function testProxy(proxy: Proxy): Promise<ProxyTestResult> {
  const start = Date.now();
  return new Promise<ProxyTestResult>((resolve) => {
    let settled = false;
    let socket: net.Socket | undefined;
    let tlsSocket: tls.TLSSocket | undefined;

    const finish = (r: ProxyTestResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        tlsSocket?.destroy();
      } catch {
        /* ignore */
      }
      try {
        socket?.destroy();
      } catch {
        /* ignore */
      }
      resolve(r);
    };

    const timer = setTimeout(() => finish({ ok: false, error: "Timed out after 12s" }), TIMEOUT_MS);

    dialUpstream(proxy, TEST_HOST, TEST_PORT)
      .then((s) => {
        socket = s;
        s.on("error", (e: Error) => finish({ ok: false, error: `Connection error: ${e.message}` }));

        tlsSocket = tls.connect({ socket: s, servername: TEST_HOST }, () => {
          tlsSocket!.write(
            `GET /?format=json HTTP/1.1\r\nHost: ${TEST_HOST}\r\nUser-Agent: espot-proxy-test\r\nAccept: application/json\r\nConnection: close\r\n\r\n`,
          );
        });

        let buf = "";
        tlsSocket.on("data", (d: Buffer) => {
          buf += d.toString("utf8");
        });
        tlsSocket.on("error", (e: Error) => finish({ ok: false, error: `TLS error: ${e.message}` }));
        tlsSocket.on("end", () => {
          const match = buf.match(/"ip"\s*:\s*"([^"]+)"/);
          if (match) finish({ ok: true, exitIp: match[1], latencyMs: Date.now() - start });
          else finish({ ok: false, error: "Connected, but could not read the exit IP from the response" });
        });
      })
      .catch((e: Error) => finish({ ok: false, error: e.message }));
  });
}
