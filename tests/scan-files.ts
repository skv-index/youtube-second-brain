// Scan: files must decode as strict UTF-8 (no lone bytes) and contain no NUL.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (["node_modules", ".git", "dist", "data"].includes(entry)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|css|html|json)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const fatal = new TextDecoder("utf-8", { fatal: true });
let dirty = false;
for (const file of walk(path.join(import.meta.dirname, ".."))) {
  try {
    const text = fatal.decode(readFileSync(file));
    if (text.includes("\u0000")) {
      console.log(`${file}: contains NUL`);
      dirty = true;
    }
  } catch (err) {
    console.log(`${file}: invalid UTF-8 — ${(err as Error).message}`);
    dirty = true;
  }
}
console.log(dirty ? "POISONED FILES FOUND (see above)" : "all clean");
