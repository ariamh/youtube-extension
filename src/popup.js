/* YT Buffer Glitch — popup */
const DEFAULT_BLOCKLIST = Array.isArray(window.YTBG_DEFAULT_BLOCKLIST)
  ? window.YTBG_DEFAULT_BLOCKLIST.slice()
  : ["18+", "xxx", "porn", "nsfw", "bokep", "dewasa", "vulgar"];

const toggle = document.getElementById("toggle");
const status = document.getElementById("status");
const filterToggle = document.getElementById("filterToggle");
const filterStatus = document.getElementById("filterStatus");
const transcriptToggle = document.getElementById("transcriptToggle");
const transcriptStatus = document.getElementById("transcriptStatus");
const blocklistEl = document.getElementById("blocklist");
const saveBtn = document.getElementById("save");
const savedEl = document.getElementById("saved");

function render(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled ? "Status: AKTIF" : "Status: nonaktif";
  status.style.color = enabled ? "#3ea6ff" : "#888";
}
function renderFilter(on) {
  filterToggle.checked = on;
  filterStatus.textContent = on ? "Status: AKTIF" : "Status: nonaktif";
  filterStatus.style.color = on ? "#3ea6ff" : "#888";
}
function renderTranscript(on) {
  transcriptToggle.checked = on;
  transcriptStatus.textContent = on ? "Status: AKTIF" : "Status: nonaktif";
  transcriptStatus.style.color = on ? "#3ea6ff" : "#888";
}

chrome.storage.local.get(
  { enabled: true, filterEnabled: false, transcriptScanEnabled: false, blocklist: DEFAULT_BLOCKLIST },
  (r) => {
    render(r.enabled);
    renderFilter(r.filterEnabled);
    renderTranscript(r.transcriptScanEnabled);
    const list = Array.isArray(r.blocklist) && r.blocklist.length ? r.blocklist : DEFAULT_BLOCKLIST;
    blocklistEl.value = list.join("\n");
  }
);

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  chrome.storage.local.set({ enabled }, () => render(enabled));
});

filterToggle.addEventListener("change", () => {
  const filterEnabled = filterToggle.checked;
  chrome.storage.local.set({ filterEnabled }, () => renderFilter(filterEnabled));
});

transcriptToggle.addEventListener("change", () => {
  const transcriptScanEnabled = transcriptToggle.checked;
  chrome.storage.local.set({ transcriptScanEnabled }, () => renderTranscript(transcriptScanEnabled));
});

saveBtn.addEventListener("click", () => {
  const blocklist = blocklistEl.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  chrome.storage.local.set({ blocklist }, () => {
    savedEl.textContent = `Tersimpan (${blocklist.length} kata).`;
    setTimeout(() => (savedEl.textContent = ""), 2000);
  });
});
