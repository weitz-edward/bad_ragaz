#!/usr/bin/env node
/* Seals and opens the app content. No installs needed (Node 20+).
     node tools/seal.mjs seal   app.src.html -> index.html   (encrypted; this is what gets pushed)
     node tools/seal.mjs open   index.html   -> app.src.html (readable; never pushed, see .gitignore)
   The word is read from the BR_PASS environment variable, or asked for.
   The salt is kept between seals, so phones that already opened the app keep working. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "app.src.html"), OUT = join(root, "index.html"), LOADER = join(root, "tools", "loader.js");
const ITER = 1000000;
const RE_DATA = /<!--DATA-->([\s\S]*?)<!--\/DATA-->/, RE_LOGIC = /<!--LOGIC-->([\s\S]*?)<!--\/LOGIC-->/;
const inner = (block) => block.replace(/^\s*<script[^>]*>/, "").replace(/<\/script>\s*$/, "");
const b64 = (buf) => Buffer.from(buf).toString("base64");

async function word() {
  if (process.env.BR_PASS) return process.env.BR_PASS;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const w = await rl.question("The word: "); rl.close(); return w;
}
async function keyFor(pass, salt, iter) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function readSealed(html) { const m = html.match(/<script id="sealed" type="application\/json">([\s\S]*?)<\/script>/); return m ? JSON.parse(m[1]) : null; }

async function seal() {
  const src = readFileSync(SRC, "utf8");
  const d = src.match(RE_DATA), l = src.match(RE_LOGIC);
  if (!d || !l) throw new Error("app.src.html is missing its DATA / LOGIC markers");
  const old = existsSync(OUT) ? readSealed(readFileSync(OUT, "utf8")) : null;
  const pass = await word();
  let salt = crypto.getRandomValues(new Uint8Array(16));
  if (old && old.iter === ITER) {          // keep the salt only if the word is unchanged
    try { const k = await keyFor(pass, Buffer.from(old.salt, "base64"), old.iter);
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(old.iv, "base64") }, k, Buffer.from(old.ct, "base64"));
      salt = Buffer.from(old.salt, "base64"); } catch (e) { console.error("New word: phones will be asked for it once."); }
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(pass, salt, ITER);
  // one script for the loader: data first, then logic; the tail records where to split them again
  const data = inner(d[1]), code = data + "\n" + inner(l[1]) + "\n/*@@SPLIT@@" + data.length + "*/";
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(code));
  const sealed = JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
  const out = src
    .replace(RE_DATA, () => `<!--DATA--><script id="sealed" type="application/json">${sealed}</script><!--/DATA-->`)
    .replace(RE_LOGIC, () => `<!--LOGIC--><script>\n${readFileSync(LOADER, "utf8")}</script><!--/LOGIC-->`)
    .replace("<body>", '<body class="locked">');
  writeFileSync(OUT, out);
  console.error(`Sealed: index.html (${Math.round(out.length / 1024)} KB)`);
}
async function open() {
  const html = readFileSync(OUT, "utf8"); const s = readSealed(html);
  if (!s) throw new Error("index.html is not sealed");
  const key = await keyFor(await word(), Buffer.from(s.salt, "base64"), s.iter);
  let text;
  try { text = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(s.iv, "base64") }, key, Buffer.from(s.ct, "base64"))); }
  catch (e) { throw new Error("Wrong word"); }
  const m = text.match(/\n\/\*@@SPLIT@@(\d+)\*\/$/); const cut = Number(m[1]);
  const data = text.slice(0, cut), logic = text.slice(cut + 1, m.index);
  const src = html
    .replace(RE_DATA, () => `<!--DATA--><script>${data}</script><!--/DATA-->`)
    .replace(RE_LOGIC, () => `<!--LOGIC--><script>${logic}</script><!--/LOGIC-->`)
    .replace('<body class="locked">', "<body>");
  writeFileSync(SRC, src);
  console.error("Opened: app.src.html (readable, do not push)");
}
const cmd = process.argv[2];
(cmd === "seal" ? seal() : cmd === "open" ? open() : Promise.reject(new Error("usage: seal.mjs seal | open"))).catch((e) => { console.error(String(e.message || e)); process.exit(1); });
