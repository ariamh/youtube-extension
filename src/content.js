/* YT Buffer Glitch — content script
 * Memantau <video> YouTube. Pada setiap kelipatan 2 menit waktu putar
 * (120s, 240s, 360s, ...) memunculkan overlay buffering ~5 detik,
 * mem-pause video, lalu melanjutkan — simulasi gangguan jaringan.
 */
(() => {
  "use strict";

  const INTERVAL_SEC = 120; // kelipatan 2 menit
  const GLITCH_MS = 300000; // durasi glitch 5 menit (300 detik)
  const MSG = "Terjadi gangguan jaringan… menyambungkan kembali";

  let enabled = true;
  let currentVideo = null;
  let firedMarks = new Set(); // mark detik yang sudah dipicu (anti double-fire)
  let glitching = false;
  let overlayEl = null;

  // ---- state (toggle) ----
  chrome.storage.local.get({ enabled: true }, (r) => {
    enabled = r.enabled;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      enabled = changes.enabled.newValue;
      if (!enabled) clearGlitch(); // matikan saat user OFF di tengah glitch
    }
  });

  // ---- overlay ----
  function getPlayer() {
    return (
      document.querySelector(".html5-video-player") ||
      (currentVideo && currentVideo.parentElement) ||
      null
    );
  }

  function showOverlay() {
    const host = getPlayer();
    if (!host) return;
    if (getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }
    overlayEl = document.createElement("div");
    overlayEl.className = "ytbg-overlay";
    overlayEl.innerHTML =
      '<div class="ytbg-spinner"></div><div class="ytbg-msg"></div>';
    overlayEl.querySelector(".ytbg-msg").textContent = MSG;
    host.appendChild(overlayEl);
  }

  function removeOverlay() {
    if (overlayEl && overlayEl.parentElement) {
      overlayEl.parentElement.removeChild(overlayEl);
    }
    overlayEl = null;
  }

  function clearGlitch() {
    removeOverlay();
    glitching = false;
    if (currentVideo && currentVideo.paused) {
      currentVideo.play().catch(() => {});
    }
  }

  function triggerGlitch() {
    if (glitching || !currentVideo) return;
    glitching = true;
    const v = currentVideo;
    v.pause();
    showOverlay();
    setTimeout(() => {
      removeOverlay();
      glitching = false;
      // hanya lanjut bila video ini masih aktif & extension masih ON
      if (enabled && currentVideo === v) {
        v.play().catch(() => {});
      }
    }, GLITCH_MS);
  }

  // ---- pemantauan waktu putar ----
  function onTimeUpdate() {
    if (!enabled || glitching || !currentVideo) return;
    const t = Math.floor(currentVideo.currentTime);
    if (t > 0 && t % INTERVAL_SEC === 0 && !firedMarks.has(t)) {
      firedMarks.add(t);
      triggerGlitch();
    }
  }

  function onSeeking() {
    // re-arm: kalau seek mundur, izinkan mark sebelumnya memicu lagi
    if (!currentVideo) return;
    const t = Math.floor(currentVideo.currentTime);
    for (const m of [...firedMarks]) {
      if (m > t) firedMarks.delete(m);
    }
  }

  function attach(video) {
    if (!video || video === currentVideo) return;
    detach();
    currentVideo = video;
    firedMarks = new Set();
    glitching = false;
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onSeeking);
  }

  function detach() {
    clearGlitch();
    if (currentVideo) {
      currentVideo.removeEventListener("timeupdate", onTimeUpdate);
      currentVideo.removeEventListener("seeking", onSeeking);
    }
    currentVideo = null;
    firedMarks = new Set();
  }

  function scan() {
    const v = document.querySelector("video.html5-main-video, video");
    if (v) attach(v);
  }

  // ---- SPA navigation YouTube ----
  window.addEventListener("yt-navigate-finish", () => {
    firedMarks = new Set();
    setTimeout(scan, 500);
  });

  // observer fallback (player di-mount belakangan)
  const mo = new MutationObserver(() => scan());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  scan();
})();
