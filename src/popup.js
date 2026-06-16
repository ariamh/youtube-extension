/* YT Buffer Glitch — popup */
const toggle = document.getElementById("toggle");
const status = document.getElementById("status");

function render(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled ? "Status: AKTIF" : "Status: nonaktif";
  status.style.color = enabled ? "#3ea6ff" : "#888";
}

chrome.storage.local.get({ enabled: true }, (r) => render(r.enabled));

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ enabled }, () => render(enabled));
});
