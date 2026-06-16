/* YT Buffer Glitch — content filter (penyaring konten dewasa)
 * Menyembunyikan kartu video YouTube yang judul/channel-nya cocok dengan
 * daftar kata terlarang (blocklist). Default NONAKTIF — tidak mengubah
 * perilaku apa pun sampai user mengaktifkan di popup.
 *
 * Catatan keterbatasan: filter berbasis TEKS metadata (judul/channel),
 * bukan analisis isi video. Tidak 100% akurat — bisa lolos / over-block.
 */
(() => {
  "use strict";

  // default blocklist konservatif; bisa diedit user via popup.
  const DEFAULT_BLOCKLIST = [
    "18+", "xxx", "porn", "nsfw", "hot", "seksi", "sexy",
    "dewasa", "bokep", "telanjang", "vulgar"
  ];

  let filterEnabled = false;
  let blocklist = DEFAULT_BLOCKLIST.slice();

  // selektor kartu video di berbagai surface YouTube
  const CARD_SELECTORS = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-reel-item-renderer",
    "ytd-playlist-video-renderer"
  ];

  function matches(text) {
    if (!text) return false;
    const t = text.toLowerCase();
    return blocklist.some((w) => w && t.includes(w.toLowerCase()));
  }

  function cardText(card) {
    const title =
      card.querySelector("#video-title, #video-title-link, a#video-title")?.textContent || "";
    const channel =
      card.querySelector("ytd-channel-name, #channel-name, .ytd-channel-name")?.textContent || "";
    return `${title} ${channel}`;
  }

  function applyToCard(card) {
    if (!filterEnabled) {
      if (card.dataset.ytbgHidden) {
        card.style.display = "";
        delete card.dataset.ytbgHidden;
      }
      return;
    }
    const hit = matches(cardText(card));
    if (hit && !card.dataset.ytbgHidden) {
      card.style.display = "none";
      card.dataset.ytbgHidden = "1";
    } else if (!hit && card.dataset.ytbgHidden) {
      card.style.display = "";
      delete card.dataset.ytbgHidden;
    }
  }

  function scanAll() {
    if (!filterEnabled) {
      // un-hide semua bila dimatikan
      document.querySelectorAll("[data-ytbg-hidden]").forEach((c) => {
        c.style.display = "";
        delete c.dataset.ytbgHidden;
      });
      return;
    }
    document.querySelectorAll(CARD_SELECTORS.join(",")).forEach(applyToCard);
  }

  // ---- state ----
  chrome.storage.local.get(
    { filterEnabled: false, blocklist: DEFAULT_BLOCKLIST },
    (r) => {
      filterEnabled = r.filterEnabled;
      blocklist = Array.isArray(r.blocklist) && r.blocklist.length
        ? r.blocklist
        : DEFAULT_BLOCKLIST.slice();
      scanAll();
    }
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.filterEnabled) filterEnabled = changes.filterEnabled.newValue;
    if (changes.blocklist) {
      const nb = changes.blocklist.newValue;
      blocklist = Array.isArray(nb) && nb.length ? nb : DEFAULT_BLOCKLIST.slice();
    }
    if (changes.filterEnabled || changes.blocklist) scanAll();
  });

  // YouTube SPA: re-scan saat navigasi & saat DOM lazy-load
  window.addEventListener("yt-navigate-finish", () => setTimeout(scanAll, 500));
  let pending = false;
  const mo = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      scanAll();
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  scanAll();
})();
