import { createPackageMaintenanceSnapshot } from "../src/package-maintenance-snapshot.mjs";

const started = Date.now();
const snapshot = createPackageMaintenanceSnapshot();

const npm = await snapshot({ ecosystem: "npm", package: "is-number", version: "7.0.0" });
if (npm.source?.provider !== "npm registry") {
  throw new Error("PACKAGE_REGISTRY_SMOKE_FAILED: npm provider mismatch");
}
if (npm.package?.name !== "is-number" || npm.package?.requested_version !== "7.0.0") {
  throw new Error("PACKAGE_REGISTRY_SMOKE_FAILED: npm exact-version metadata mismatch");
}
if (!npm.package?.latest_version || !npm.release?.requested_published_at) {
  throw new Error("PACKAGE_REGISTRY_SMOKE_FAILED: npm release metadata incomplete");
}

const pypi = await snapshot({ ecosystem: "PyPI", package: "requests", version: "2.31.0" });
if (pypi.source?.provider !== "PyPI") {
  throw new Error("PACKAGE_REGISTRY_SMOKE_FAILED: PyPI provider mismatch");
}
if (String(pypi.package?.name ?? "").toLowerCase() !== "requests" || pypi.package?.requested_version !== "2.31.0") {
  throw new Error("PACKAGE_REGISTRY_SMOKE_FAILED: PyPI exact-version metadata mismatch");
}
if (!pypi.package?.latest_version || !pypi.release?.requested_published_at) {
  throw new Error("PACKAGE_REGISTRY_SMOKE_FAILED: PyPI release metadata incomplete");
}

console.log(JSON.stringify({
  smoke: "PACKAGE_REGISTRIES_OK",
  npm: {
    provider: npm.source.provider,
    package: npm.package.name,
    requested_version: npm.package.requested_version,
    latest_version: npm.package.latest_version,
    requested_published_at: npm.release.requested_published_at,
  },
  pypi: {
    provider: pypi.source.provider,
    package: pypi.package.name,
    requested_version: pypi.package.requested_version,
    latest_version: pypi.package.latest_version,
    requested_published_at: pypi.release.requested_published_at,
  },
  elapsed_ms: Date.now() - started,
}));