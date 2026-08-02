import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const policy = JSON.parse(readFileSync("scripts/license-policy.json", "utf8"));
const ALLOWED = new Set(policy.allowed ?? []);
const EXCEPTIONS = new Map(Object.entries(policy.exceptions ?? {}));

function isAllowedExpression(expression) {
  const normalized = String(expression)
    .trim()
    .replace(/^\((.*)\)$/s, "$1");
  if (normalized.includes(" OR ")) {
    return normalized.split(" OR ").some(isAllowedExpression);
  }
  if (normalized.includes(" AND ")) {
    return normalized.split(" AND ").every(isAllowedExpression);
  }
  return ALLOWED.has(normalized.trim());
}

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const packages = [];
const violations = [];

for (const [installPath, lockEntry] of Object.entries(lock.packages ?? {})) {
  if (!installPath) continue;
  let license = lockEntry.license;
  let name = lockEntry.name || installPath.replace(/^node_modules\//, "");
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(installPath, "package.json"), "utf8"),
    );
    name = manifest.name || name;
    license = license || manifest.license;
  } catch {
    // package-lock metadata remains the fallback for package-lock-only checks.
  }

  const record = {
    name,
    version: lockEntry.version ?? null,
    license: license ?? null,
    installPath,
  };
  packages.push(record);
  const exception =
    EXCEPTIONS.get(`${name}@${record.version}`) ?? EXCEPTIONS.get(name);
  if (!license || !isAllowedExpression(license)) {
    if (!exception || typeof exception !== "string" || !exception.trim()) {
      violations.push(record);
    }
  }
}

packages.sort((left, right) =>
  `${left.name}@${left.version}`.localeCompare(
    `${right.name}@${right.version}`,
  ),
);
mkdirSync(".artifacts", { recursive: true });
writeFileSync(
  ".artifacts/licenses.json",
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      policyFile: "scripts/license-policy.json",
      exceptions: Object.fromEntries(EXCEPTIONS),
      packages,
    },
    null,
    2,
  )}\n`,
);

if (violations.length > 0) {
  throw new Error(
    `License policy violations:\n${violations
      .map(
        (item) => `${item.name}@${item.version}: ${item.license ?? "UNKNOWN"}`,
      )
      .join("\n")}`,
  );
}
console.log(`License policy passed for ${packages.length} installed packages`);
