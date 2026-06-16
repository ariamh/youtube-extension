/* YT Buffer Glitch — transcript scan (deteksi via caption/transkrip)
 * Melengkapi keyword-filter: saat video watch dibuka, ambil caption track
 * YouTube (timedtext json3) lalu cocokkan teks transkrip dengan blocklist.
 * Bila terdeteksi kata terlarang → tampilkan banner peringatan di atas player.
 *
 * Default NONAKTIF. Tidak ada perubahan perilaku sampai user mengaktifkan.
 * Fail-open: bila caption tak ada / fetch gagal → tidak memblok apa pun.
 * Catatan: banyak video tanpa caption / caption auto buruk → deteksi tidak sempurna.
 */
(() => {
  "use strict";

  const DEFAULT_BLOCKLIST =
    (typeof window !== "undefined" && Array.isArray(window.YTBG_DEFAULT_BLOCKLIST))
      ? window.YTBG_DEFAULT_BLOCKLIST.slice()
      : ["18+", "xxx", "porn", "nsfw", "bokep", "dewasa", "vulgar"];

  let scanEnabled = false;
  let blocklist = DEFAULT_BLOCKLIST.slice();
  let lastVideoId = null;
  let bannerEl = null;

  chrome.storage.local.get(
    { transcriptScanEnabled: false, blocklist: DEFAULT_BLOCKLIST },
    (r) => {
      scanEnabled = r.transcriptScanEnabled;
      blocklist = Array.isArray(r.blocklist) && r.blocklist.length ? r.blocklist : DEFAULT_BLOCKLIST.slice();
      maybeScan();
    }
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.transcriptScanEnabled) {
      scanEnabled = changes.transcriptScanEnabled.newValue;
      if (!scanEnabled) removeBanner();
      else { lastVideoId = null; maybeScan(); }
    }
    if (changes.blocklist) {
      const nb = changes.blocklist.newValue;
      blocklist = Array.isArray(nb) && nb.length ? nb : DEFAULT_BLOCKLIST.slice();
      lastVideoId = null;
      maybeScan();
    }
  });

  function getVideoId() {
    const u = new URL(location.href);
    return u.searchParams.get("v");
  }

  // ambil captionTracks dari ytInitialPlayerResponse.
  // Content script di isolated world TIDAK bisa baca window.* halaman,
  // jadi parse dari inline <script> di DOM.
  function getCaptionTracks() {
    try {
      let json = null;
      const scripts = document.querySelectorAll("script");
      for (const s of scripts) {
        const txt = s.textContent || "";
        const idx = txt.indexOf("ytInitialPlayerResponse");
        if (idx === -1) continue;
        const braceStart = txt.indexOf("{", idx);
        if (braceStart === -1) continue;
        // ambil objek JSON seimbang kurung kurawal
        let depth = 0, end = -1;
        for (let i = braceStart; i < txt.length; i++) {
          const c = txt[i];
          if (c === "{") depth++;
          else if (c === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
        }
        if (end === -1) continue;
        json = JSON.parse(txt.slice(braceStart, end));
        break;
      }
      const tracks =
        json?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      return Array.isArray(tracks) ? tracks : [];
    } catch (_) {
      return [];
    }
  }

  function matchInText(text) {
    if (!text) return null;
    const t = text.toLowerCase();
    for (const w of blocklist) {
      if (w && t.includes(w.toLowerCase())) return w;
    }
    return null;
  }

  async function fetchTranscript(track) {
    const url = track.baseUrl + (track.baseUrl.includes("fmt=") ? "" : "&fmt=json3");
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error("fetch caption failed");
    const data = await res.json();
    const parts = [];
    (data.events || []).forEach((ev) => {
      (ev.segs || []).forEach((s) => { if (s.utf8) parts.push(s.utf8); });
    });
    return parts.join(" ");
  }

  // ---- FALLBACK: scrape panel transkrip dari DOM ----
  // Dipakai bila timedtext gagal/kosong. Buka panel transkrip via tombol,
  // tunggu segmen ter-render, lalu kumpulkan teksnya.
  function collectTranscriptSegments() {
    const segs = document.querySelectorAll(
      "ytd-transcript-segment-renderer .segment-text, ytd-transcript-segment-renderer yt-formatted-string"
    );
    if (!segs.length) return "";
    return Array.from(segs).map((n) => n.textContent.trim()).join(" ");
  }

  function findTranscriptButton() {
    // tombol "Show transcript" punya aria-label bervariasi (id/en)
    const sel = [
      'button[aria-label*="transcript" i]',
      'button[aria-label*="transkrip" i]',
      'ytd-button-renderer[aria-label*="transcript" i] button',
      'tp-yt-paper-button[aria-label*="transcript" i]'
    ].join(",");
    return document.querySelector(sel);
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function fetchTranscriptFromDOM() {
    // sudah terbuka?
    let text = collectTranscriptSegments();
    if (text) return text;

    const btn = findTranscriptButton();
    if (!btn) return ""; // tak ada tombol transkrip → menyerah (fail-open)
    btn.click();

    // tunggu segmen ter-render (maks ~3 detik)
    for (let i = 0; i < 12; i++) {
      await sleep(250);
      text = collectTranscriptSegments();
      if (text) break;
    }
    return text;
  }

  function showBanner(word) {
    removeBanner();
    const host =
      document.querySelector("#player-container, #player, ytd-watch-flexy") ||
      document.body;
    bannerEl = document.createElement("div");
    bannerEl.id = "ytbg-transcript-warn";
    bannerEl.textContent =
      `⚠️ Transkrip video ini mengandung kata terlarang ("${word}"). Konten mungkin tidak pantas.`;
    host.prepend(bannerEl);
  }

  function removeBanner() {
    if (bannerEl && bannerEl.parentElement) bannerEl.parentElement.removeChild(bannerEl);
    bannerEl = null;
    const stray = document.getElementById("ytbg-transcript-warn");
    if (stray && stray.parentElement) stray.parentElement.removeChild(stray);
  }

  async function maybeScan() {
    if (!scanEnabled) return;
    if (!location.pathname.startsWith("/watch")) { removeBanner(); return; }
    const vid = getVideoId();
    if (!vid || vid === lastVideoId) return;
    lastVideoId = vid;
    removeBanner();

    let text = "";

    // 1) coba timedtext (cepat, tanpa membuka panel)
    const tracks = getCaptionTracks();
    if (tracks.length) {
      const pick =
        tracks.find((t) => (t.languageCode || "").startsWith("id")) ||
        tracks.find((t) => (t.languageCode || "").startsWith("en")) ||
        tracks[0];
      try {
        text = await fetchTranscript(pick);
      } catch (_) { /* lanjut ke fallback */ }
    }

    // 2) fallback: scrape panel transkrip dari DOM bila timedtext kosong/gagal
    if (!text) {
      try {
        text = await fetchTranscriptFromDOM();
      } catch (_) { /* fail-open */ }
    }

    if (!text) return; // fail-open: tak ada transkrip → tidak memblok

    const hit = matchInText(text);
    if (hit && vid === lastVideoId && scanEnabled) showBanner(hit);
  }

  // YouTube SPA: scan ulang tiap navigasi watch
  window.addEventListener("yt-navigate-finish", () => setTimeout(maybeScan, 800));
  // player response / panel kadang siap belakangan
  let tries = 0;
  const poll = setInterval(() => {
    if (++tries > 10) { clearInterval(poll); return; }
    if (scanEnabled && location.pathname.startsWith("/watch") && getVideoId() !== lastVideoId) {
      maybeScan();
    }
  }, 1000);

  maybeScan();
})();
