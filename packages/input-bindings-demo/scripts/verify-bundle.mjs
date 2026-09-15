import { readdir, readFile } from "node:fs/promises";

const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const files = (await readdir(assetsDirectory)).filter((file) => file.endsWith(".js"));

if (files.length === 0) {
  throw new Error("Pages build produced no JavaScript assets.");
}

const failures = [];
for (const file of files) {
  const source = await readFile(new URL(file, assetsDirectory), "utf8");
  if (/\bReact\.(?:createElement|Fragment)\b/u.test(source)) {
    failures.push(`${file}: contains classic JSX output that requires an unbound React global`);
  }
  if (/\bfrom\s*["']react(?:\/(?:jsx-runtime|jsx-dev-runtime))?["']/u.test(source)) {
    failures.push(`${file}: contains a bare React import that browsers cannot resolve on GitHub Pages`);
  }
}

if (failures.length > 0) {
  throw new Error(`Invalid Pages bundle:\n${failures.join("\n")}`);
}

console.log(`Verified ${files.length} Pages JavaScript assets use a browser-resolvable React runtime.`);
