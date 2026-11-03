import { ArchiveEadParser } from "./parser.js";
import { exportToCsv } from "./exporter.js";

let currentData = [];
let currentColumns = [];

const presetSelect = document.getElementById("preset-select");
const customControls = document.getElementById("custom-controls");
const btnParse = document.getElementById("btn-parse");
const btnExport = document.getElementById("btn-export");
const tableHead = document.getElementById("table-head");
const tableBody = document.getElementById("table-body");
const stats = document.getElementById("stats");

presetSelect.addEventListener("change", (e) => {
  customControls.style.display = e.target.value === "custom" ? "block" : "none";
});

btnParse.addEventListener("click", async () => {
  stats.textContent = "Fetching tab XML...";
  tableHead.innerHTML = "";
  tableBody.innerHTML = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      throw new Error("No active tab detected.");
    }

    // Extract the full serialized XML DOM directly from the tab
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // XMLSerializer ensures complete XML including namespaces and attributes
        return new XMLSerializer().serializeToString(document);
      }
    });

    if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) {
      throw new Error("Unable to read XML content from this page.");
    }

    const xmlString = injectionResults[0].result;
    const parser = new ArchiveEadParser(xmlString);
    const presetKey = presetSelect.value;
    let config;

    if (presetKey === "custom") {
      const rowPath = document.getElementById("row-xpath").value;
      config = {
        rowSelector: rowPath,
        columns: [
          { header: "Unit ID", path: "*[local-name()='did']/*[local-name()='unitid']" },
          { header: "Title", path: "*[local-name()='did']/*[local-name()='unittitle']" },
          { header: "Date", path: "*[local-name()='did']/*[local-name()='unitdate']" }
        ]
      };
    } else {
      config = ArchiveEadParser.DEFAULT_PRESETS[presetKey];
    }

    currentColumns = config.columns.map((c) => c.header);
    currentData = parser.extractTable(config.rowSelector, config.columns);

    stats.textContent = `Parsed ${currentData.length} record(s).`;
    btnExport.disabled = currentData.length === 0;

    renderTable(currentData.slice(0, 50));
  } catch (err) {
    stats.textContent = "Error: " + err.message;
  }
});

function renderTable(rows) {
  tableHead.innerHTML = `<tr>${currentColumns.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  tableBody.innerHTML = rows
    .map(
      (r) =>
        `<tr>${currentColumns
          .map((col) => `<td>${r[col] || ""}</td>`)
          .join("")}</tr>`
    )
    .join("");
}

btnExport.addEventListener("click", () => {
  exportToCsv("archival_export.csv", currentData, currentColumns);
});