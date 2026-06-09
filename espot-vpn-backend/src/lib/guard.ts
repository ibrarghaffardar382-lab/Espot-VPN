// Best-effort guard against tunneling to the server's own internal network /
// cloud metadata endpoints (an SSRF-class risk). This blocks obvious private
// IP literals and localhost. It does NOT resolve DNS, so a hostname pointing at
// a private IP is not caught here — treat it as a first line of defense.

const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./, // link-local, includes 169.254.169.254 cloud metadata
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
];

export function isForbiddenTarget(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  // IPv6 unique-local / link-local.
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  if (PRIVATE_V4.some((re) => re.test(h))) return true;
  return false;
}
