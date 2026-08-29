// Shared public-routability checks for the company-domain SSRF boundary.
//
// These helpers decide whether a resolved IP address is suitable for arbitrary
// outbound website inspection. This is deliberately more conservative than a
// general-purpose routing classifier: special-purpose/protocol-assignment space
// is rejected even when a more-specific address may be globally reachable.
// The same gate is used by DNS preflight and the connection-time lookup.

import net from "node:net";

export function isPublicIp(address) {
  const family = net.isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export function isPublicIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function isPublicIpv6(address) {
  const bytes = ipv6Bytes(address);
  if (!bytes) return false;

  // Conservative SSRF classification: ordinary outbound website inspection is
  // limited to the currently assigned global-unicast space 2000::/3.
  if ((bytes[0] & 0xe0) !== 0x20) return false;

  // IANA IPv6 Special-Purpose Address Registry: 2001::/23 is the IETF Protocol
  // Assignments block and is not globally reachable by default except for
  // explicitly assigned more-specific protocol addresses. For this SSRF
  // boundary we reject the entire /23, including Teredo/ORCHID/AMT/anycast
  // protocol assignments: a company website has no need to target those
  // special-purpose endpoints, and fail-closed behavior is safer than trying to
  // maintain an allowlist of protocol exceptions.
  // 2001::/23 => first hextet 0x2001 and the top 7 bits of the second hextet 0.
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && (bytes[2] & 0xfe) === 0x00) return false;

  // 2001:db8::/32 documentation.
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false;

  // 2002::/16 6to4 transition.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return false;

  // 3fff::/20 documentation/special-purpose.
  if (bytes[0] === 0x3f && bytes[1] === 0xff && (bytes[2] & 0xf0) === 0x00) return false;

  return true;
}

export function ipv6Bytes(address) {
  let value = String(address).toLowerCase().split("%")[0];
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = value.slice(lastColon + 1);
    if (net.isIP(ipv4) !== 4) return null;
    const octets = ipv4.split(".").map(Number);
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    value = `${value.slice(0, lastColon)}:${hi}:${lo}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = halves.length === 2 ? [...left, ...Array(Math.max(0, missing)).fill("0"), ...right] : left;
  if (groups.length !== 8) return null;
  const bytes = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const number = Number.parseInt(group, 16);
    bytes.push((number >> 8) & 0xff, number & 0xff);
  }
  return bytes;
}
