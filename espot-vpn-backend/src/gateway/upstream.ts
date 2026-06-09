import net from "node:net";
import { SocksClient } from "socks";
import type { Proxy } from "../db/schema.js";

/**
 * Open a raw TCP tunnel to `targetHost:targetPort`, optionally chained through
 * the user's assigned upstream vendor proxy. Because every user's tunnel is
 * dialed from THIS server, the vendor proxy only ever sees this server's IP —
 * even when many users share the same upstream proxy.
 */
export function dialUpstream(
  proxy: Proxy | null,
  targetHost: string,
  targetPort: number,
): Promise<net.Socket> {
  if (!proxy) {
    // Direct connection (no upstream assigned).
    return new Promise((resolve, reject) => {
      const socket = net.connect(targetPort, targetHost);
      socket.once("connect", () => resolve(socket));
      socket.once("error", reject);
    });
  }

  if (proxy.protocol === "socks5") {
    return SocksClient.createConnection({
      proxy: {
        host: proxy.host,
        port: proxy.port,
        type: 5,
        userId: proxy.username ?? undefined,
        password: proxy.password ?? undefined,
      },
      command: "connect",
      destination: { host: targetHost, port: targetPort },
    }).then((info) => info.socket);
  }

  // HTTP/HTTPS upstream proxy → use CONNECT tunneling.
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, proxy.host);
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes("\r\n\r\n")) {
        socket.removeListener("data", onData);
        const statusLine = buffer.split("\r\n")[0] ?? "";
        if (/\s2\d\d\s/.test(statusLine)) {
          resolve(socket);
        } else {
          socket.destroy();
          reject(new Error(`Upstream CONNECT failed: ${statusLine}`));
        }
      }
    };
    socket.once("connect", () => {
      const auth =
        proxy.username && proxy.password
          ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}\r\n`
          : "";
      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
          `Host: ${targetHost}:${targetPort}\r\n` +
          auth +
          `\r\n`,
      );
    });
    socket.on("data", onData);
    socket.once("error", reject);
  });
}
