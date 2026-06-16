# Requirements — yt-buffer-glitch

## Functional
1. Aktif hanya di `*.youtube.com`.
2. Deteksi pemutaran video (HTML5 `<video>` di halaman watch & SPA navigation).
3. Saat aktif: pada setiap kelipatan 2 menit waktu putar (currentTime = 120s, 240s, 360s, ...) munculkan simulasi "gangguan jaringan":
   - overlay buffering (spinner ala YouTube) menutup player,
   - video di-`pause()`,
   - durasi ~5 detik, lalu overlay hilang & video `play()` lanjut.
4. Tiap kelipatan 2 menit hanya memicu sekali (anti double-fire).
5. Toggle ON/OFF lewat popup; status tersimpan (`chrome.storage.local`), default ON.
6. Re-arm trigger saat ganti video / seek mundur.

## Non-Functional
- Manifest V3, tanpa remote code, izin minimal.
- Tidak mengirim data ke jaringan apa pun (murni lokal/visual).
- Tahan terhadap YouTube SPA navigation (yt-navigate-finish).

## Out of scope
- Membatasi durasi total / memblok video permanen.
- Platform selain YouTube.
