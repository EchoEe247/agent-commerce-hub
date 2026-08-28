// Shared public-routability checks for the company-domain SSRF boundary.
//
// These helpers decide whether a resolved IP address is publicly routable.
// They are the single source of truth used both by the DNS preflight
// (company-domain-intelligence.mjs) and by the connection-time lookup in
// safe-website-fetch.mjs, so the two halves of the defence cannot drift.

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
  // Conservative SSRF classification: only addresses inside the currently
  // assigned global-unicast space 2000::/3 are even candidates for ordinary
  // public Internet endpoints. Everything else (unspecified, loopback,
  // unique-local fc00::/7, link-local fe80::/10, multicast ff00::/8,
  // IPv4-mapped outside public space, translation/transition ranges, reserved
  // and special-purpose prefixes) is rejected.
  if ((bytes[0] & 0xe0) !== 0x20) return false; // must be inside 2000::/3
  // 2001:db8::/32 documentation
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false;
  // 2001:2::/48 benchmarking
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x02) return false;
  // 2002::/16 6to4 transition
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return false;
  // 3fff::/20 benchmarking/experiment reserved range
  if (bytes[0] === 0x3f && bytes[1] === 0xff && (bytes[2] & 0xf0) === 0x00) return false;
  // IPv4-mapped (::ffff:a.b.c.d): defer to the IPv4 public classification.
  const mapped = bytes.slice(0, 10).every((value) => value === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (mapped) return isPublicIpv4(bytes.slice(12).join("."));
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
