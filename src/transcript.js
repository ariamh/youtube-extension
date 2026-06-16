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

    const tracks = getCaptionTracks();
    if (!tracks.length) return; // fail-open: tak ada caption → tidak memblok

    // prioritas: Indonesia, lalu English, lalu track pertama
    const pick =
      tracks.find((t) => (t.languageCode || "").startsWith("id")) ||
      tracks.find((t) => (t.languageCode || "").startsWith("en")) ||
      tracks[0];

    try {
      const text = await fetchTranscript(pick);
      const hit = matchInText(text);
      if (hit && vid === lastVideoId && scanEnabled) showBanner(hit);
    } catch (_) {
      // fail-open: error fetch/parse → tidak memblok
    }
  }

  // YouTube SPA: scan ulang tiap navigasi watch
  window.addEventListener("yt-navigate-finish", () => setTimeout(maybeScan, 800));
  // player response kadang siap belakangan
  let tries = 0;
  const poll = setInterval(() => {
    if (++tries > 10) { clearInterval(poll); return; }
    if (scanEnabled && getCaptionTracks().length) { maybeScan(); }
  }, 1000);

  maybeScan();
})();
