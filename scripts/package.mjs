// Usage: node scripts/package.mjs [--no-build]
// Runs typecheck + tests + build (unless --no-build), then zips dist/ into release/kalit-extension-v<version>.zip
// without source maps and dotfiles. Fails if package.json and dist/manifest.json versions differ.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const json = (p) => JSON.parse(readFileSync(root + p, "utf8"));

const pkgVersion = json("package.json").version;
const manifestVersion = json("public/manifest.json").version;
if (pkgVersion !== manifestVersion) {
  console.error(`Version mismatch: package.json=${pkgVersion} public/manifest.json=${manifestVersion}`);
  process.exit(1);
}

if (!process.argv.includes("--no-build")) {
  run("pnpm", ["run", "typecheck"]);
  run("pnpm", ["test"]);
  run("pnpm", ["run", "build"]); // cleans dist/ first
}
if (!existsSync(root + "dist/manifest.json")) {
  console.error("dist/manifest.json missing: run the build first");
  process.exit(1);
}
if (json("dist/manifest.json").version !== pkgVersion) {
  console.error("dist/manifest.json version differs from package.json: rebuild");
  process.exit(1);
}

mkdirSync(root + "release", { recursive: true });
const out = `${root}release/kalit-extension-v${pkgVersion}.zip`;
rmSync(out, { force: true });
// -X: no extra file attributes; -r: recurse; exclude source maps and hidden files (.DS_Store etc.)
run("zip", ["-r", "-X", out, ".", "-x", "*.map", "-x", "*/.*", "-x", ".*"], root + "dist");
console.log(`\n${out} (${statSync(out).size} bytes)`);
