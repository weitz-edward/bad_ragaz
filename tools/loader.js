/* Opens the sealed app. The content of this site is encrypted (AES-GCM, key from PBKDF2-SHA256).
   The phone keeps only the derived key, never the word itself, so later visits open at once and offline. */
(function () {
  const KEY_STORE = "br_key_v1";
  const sealed = JSON.parse(document.getElementById("sealed").textContent);
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toB64 = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  const $ = (id) => document.getElementById(id);
  async function keyFromWord(word) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(word.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
    return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64(sealed.salt), iterations: sealed.iter }, base, 256);
  }
  async function open(rawKey) {
    const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(sealed.iv) }, key, b64(sealed.ct));
    return new TextDecoder().decode(plain);
  }
  function run(code) {
    document.body.classList.remove("locked");
    const el = document.createElement("script"); el.textContent = code; document.body.appendChild(el);
  }
  function remember(rawKey) { try { localStorage.setItem(KEY_STORE, toB64(rawKey)); } catch (e) { /* will ask again next time */ } }
  function saved() { try { const v = localStorage.getItem(KEY_STORE); return v ? b64(v).buffer : null; } catch (e) { return null; } }
  function ask() {
    document.body.classList.add("locked");
    const form = $("lockForm"), err = $("lockErr"), btn = $("lockBtn"), input = $("lockPass");
    if (!window.crypto || !crypto.subtle) { err.textContent = "הדפדפן הזה לא יכול לפתוח את האפליקציה. פתחו אותה מהכתובת המאובטחת (https)."; btn.disabled = true; return; }
    input.focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); if (!input.value) return;
      btn.disabled = true; err.textContent = ""; btn.textContent = "פותח...";
      try { const raw = await keyFromWord(input.value.trim()); const code = await open(raw); remember(raw); run(code); }
      catch (x) { err.textContent = "זו לא המילה. נסו שוב."; input.select(); }
      btn.disabled = false; btn.textContent = "לפתוח";
    });
  }
  async function start() {
    const raw = saved();
    if (raw) { try { run(await open(raw)); return; } catch (e) { try { localStorage.removeItem(KEY_STORE); } catch (x) { /* ignore */ } } }
    ask();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
