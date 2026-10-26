/**
 * HECTOR — Optimiseur de Stock Min/Max Saisonnier
 * Moteur Supply Chain, Gestion Multi-Encodages (UTF-8 / Windows-1252),
 * Analyse des Ventes Passées ("Déjà Vendu") & Extrapolations Prévisionnelles
 */

// Mois de l'année en français
const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

const MONTH_SHORT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc"
];

// État global de l'application
const HectorState = {
  products: new Map(), // sku -> ProductData
  selectedSku: null,
  selectedMonth: 10,   // Novembre par défaut (0-indexed: 10)
  activeViewMode: 'sku', // 'sku' ou 'date'
  chartInstance: null,
  monthChartInstance: null,
  sortConfig: {
    skuTable: { key: 'actualTotal', asc: false },
    monthTable: { key: 'demand', asc: false }
  },
  params: {
    leadTimeDays: 7,
    reviewPeriodDays: 7,
    zScore: 1.65,
    seasonalityRatioThreshold: 1.4,
    blackFridayMultiplier: 1.20,
    xmasMultiplier: 1.60
  }
};

// ==========================================================================
// 1. Initialisation & Événements DOM
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  initDropzone();
  initParamListeners();
  initActionButtons();
  initCombobox();
  initViewModeToggles();
  initSearch();
  initSorting();
});

function initParamListeners() {
  document.getElementById("btn-recalculate").addEventListener("click", () => {
    updateParamsFromUI();
    recalculateAll();
  });
}

function updateParamsFromUI() {
  const leadTimeInput = document.getElementById("param-lead-time");
  const reviewInput = document.getElementById("param-review-period");
  const zScoreSelect = document.getElementById("param-service-level");
  const seasonSelect = document.getElementById("param-seasonality-threshold");
  const bfInput = document.getElementById("param-bf-multiplier");
  const xmasInput = document.getElementById("param-xmas-multiplier");

  HectorState.params.leadTimeDays = Math.max(1, parseInt(leadTimeInput.value, 10) || 7);
  HectorState.params.reviewPeriodDays = Math.max(1, parseInt(reviewInput.value, 10) || 7);
  HectorState.params.zScore = parseFloat(zScoreSelect.value) || 1.65;
  HectorState.params.seasonalityRatioThreshold = parseFloat(seasonSelect.value) || 1.4;
  HectorState.params.blackFridayMultiplier = Math.max(0.1, parseFloat(bfInput.value) || 1.20);
  HectorState.params.xmasMultiplier = Math.max(0.1, parseFloat(xmasInput.value) || 1.60);
}

function initActionButtons() {
  // Démo
  document.getElementById("btn-demo").addEventListener("click", loadDemoData);

  // Téléchargement modèle Excel
  document.getElementById("btn-download-template").addEventListener("click", downloadExcelTemplate);

  // Exports globaux
  document.getElementById("btn-export-excel").addEventListener("click", exportResultsToExcel);
  document.getElementById("btn-export-csv").addEventListener("click", exportResultsToCSV);

  // Exports du mois sélectionné
  document.getElementById("btn-export-month-excel").addEventListener("click", exportSelectedMonthToExcel);
  document.getElementById("btn-export-month-csv").addEventListener("click", exportSelectedMonthToCSV);
}

// ==========================================================================
// 1.B Composant Combobox de Recherche Dynamique d'Articles
// ==========================================================================
function initCombobox() {
  const input = document.getElementById("product-combobox-input");
  const clearBtn = document.getElementById("combobox-clear");
  const toggleBtn = document.getElementById("combobox-toggle");
  const dropdown = document.getElementById("combobox-dropdown");

  input.addEventListener("focus", () => {
    renderComboboxDropdown(input.value.trim());
    dropdown.style.display = "block";
  });

  input.addEventListener("input", () => {
    renderComboboxDropdown(input.value.trim());
    dropdown.style.display = "block";
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    renderComboboxDropdown("");
    input.focus();
    dropdown.style.display = "block";
  });

  toggleBtn.addEventListener("click", () => {
    if (dropdown.style.display === "none" || dropdown.style.display === "") {
      renderComboboxDropdown(input.value.trim());
      dropdown.style.display = "block";
      input.focus();
    } else {
      dropdown.style.display = "none";
    }
  });

  // Fermeture si clic à l'extérieur
  document.addEventListener("click", (e) => {
    const wrapper = document.getElementById("combobox-wrapper");
    if (wrapper && !wrapper.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  // Navigation clavier
  input.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll(".combobox-item");
    if (!items || items.length === 0) return;

    let highlightedIndex = Array.from(items).findIndex(el => el.classList.contains("highlighted"));

    if (e.key === "ArrowDown") {
      e.preventDefault();
      dropdown.style.display = "block";
      if (highlightedIndex < items.length - 1) highlightedIndex++;
      else highlightedIndex = 0;
      updateHighlightedItem(items, highlightedIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      dropdown.style.display = "block";
      if (highlightedIndex > 0) highlightedIndex--;
      else highlightedIndex = items.length - 1;
      updateHighlightedItem(items, highlightedIndex);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < items.length) {
        items[highlightedIndex].click();
      }
    } else if (e.key === "Escape") {
      dropdown.style.display = "none";
    }
  });
}

function updateHighlightedItem(items, index) {
  items.forEach((item, i) => {
    if (i === index) {
      item.classList.add("highlighted");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("highlighted");
    }
  });
}

function renderComboboxDropdown(query) {
  const dropdown = document.getElementById("combobox-dropdown");
  dropdown.innerHTML = "";

  const q = (query || "").toLowerCase();
  const products = Array.from(HectorState.products.values());

  const filtered = products.filter(p => p.sku.toLowerCase().includes(q));

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "combobox-empty";
    empty.textContent = "Aucune référence correspondante.";
    dropdown.appendChild(empty);
    return;
  }

  filtered.forEach(p => {
    const item = document.createElement("div");
    item.className = `combobox-item ${p.sku === HectorState.selectedSku ? 'selected' : ''}`;

    const badgeClass = p.isSeasonal ? 'badge-seasonal' : 'badge-stable';
    const badgeLabel = p.isSeasonal ? '⚡ Saisonnier' : '◆ Stable';

    item.innerHTML = `
      <div class="combobox-item-top">
        <span class="combobox-item-title">${p.sku}</span>
        <span class="badge ${badgeClass}" style="font-size: 0.65rem; padding: 0.15rem 0.4rem;">${badgeLabel}</span>
      </div>
      <div class="combobox-item-meta">
        Déjà vendu : <strong>${p.actualTotal.toLocaleString("fr-FR")} u.</strong> | Prévu an : <strong>${p.annualTotal.toLocaleString("fr-FR")} u.</strong>
      </div>
    `;

    item.addEventListener("click", () => {
      HectorState.selectedSku = p.sku;
      document.getElementById("product-combobox-input").value = p.sku;
      dropdown.style.display = "none";
      renderSelectedProduct();
    });

    dropdown.appendChild(item);
  });
}

function initViewModeToggles() {
  const btnSku = document.getElementById("toggle-view-sku");
  const btnDate = document.getElementById("toggle-view-date");

  btnSku.addEventListener("click", () => switchViewMode('sku'));
  btnDate.addEventListener("click", () => switchViewMode('date'));
}

function switchViewMode(mode) {
  HectorState.activeViewMode = mode;
  const btnSku = document.getElementById("toggle-view-sku");
  const btnDate = document.getElementById("toggle-view-date");
  const containerSku = document.getElementById("view-mode-sku-container");
  const containerDate = document.getElementById("view-mode-date-container");

  if (mode === 'sku') {
    btnSku.classList.add("active");
    btnDate.classList.remove("active");
    containerSku.style.display = "block";
    containerDate.style.display = "none";
    if (HectorState.chartInstance) HectorState.chartInstance.resize();
  } else {
    btnDate.classList.add("active");
    btnSku.classList.remove("active");
    containerDate.style.display = "block";
    containerSku.style.display = "none";
    renderMonthView();
    if (HectorState.monthChartInstance) HectorState.monthChartInstance.resize();
  }
}

function initSearch() {
  const searchInput = document.getElementById("catalog-search");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      filterSummaryTable(query);
    });
  }

  const monthSearchInput = document.getElementById("month-table-search");
  if (monthSearchInput) {
    monthSearchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      filterMonthTable(query);
    });
  }
}

function initSorting() {
  document.querySelectorAll(".sortable-th").forEach(th => {
    th.addEventListener("click", () => {
      const sortKey = th.getAttribute("data-sort");
      if (HectorState.sortConfig.skuTable.key === sortKey) {
        HectorState.sortConfig.skuTable.asc = !HectorState.sortConfig.skuTable.asc;
      } else {
        HectorState.sortConfig.skuTable.key = sortKey;
        HectorState.sortConfig.skuTable.asc = (sortKey === 'sku' || sortKey === 'isSeasonal' || sortKey === 'peakMonth');
      }
      renderSummaryTable();
    });
  });

  document.querySelectorAll(".sortable-month-th").forEach(th => {
    th.addEventListener("click", () => {
      const sortKey = th.getAttribute("data-sort");
      if (HectorState.sortConfig.monthTable.key === sortKey) {
        HectorState.sortConfig.monthTable.asc = !HectorState.sortConfig.monthTable.asc;
      } else {
        HectorState.sortConfig.monthTable.key = sortKey;
        HectorState.sortConfig.monthTable.asc = (sortKey === 'sku' || sortKey === 'nature' || sortKey === 'phase');
      }
      renderMonthTable();
    });
  });
}

// ==========================================================================
// 2. Gestion de l'Upload et Multi-Fichiers avec Détection Encodage & Accents
// ==========================================================================
function initDropzone() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt.files && dt.files.length > 0) handleUploadedFiles(dt.files);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) handleUploadedFiles(e.target.files);
  });
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function setFileStatus(message, isError = false) {
  const statusEl = document.getElementById("file-status");
  statusEl.innerHTML = message;
  statusEl.style.color = isError ? "var(--danger)" : "var(--success)";
}

/**
 * Traitement robuste multi-fichiers avec support complet des accents et encodages français :
 * Auto-détecte UTF-8 / Windows-1252 (ANSI) / ISO-8859-1 et répare les mojibakes.
 */
async function handleUploadedFiles(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;

  setFileStatus(`Lecture et analyse de ${files.length} fichier(s) en cours...`);
  updateParamsFromUI();
  HectorState.products.clear();

  // tempAgg : sku -> { monthlyDemand: Array(12), observedMonths: Set<number> }
  const tempAgg = new Map();
  let filesParsed = 0;
  const errors = [];

  for (const file of files) {
    try {
      const buffer = await readFileAsArrayBuffer(file);
      let workbook;

      const isCsvOrTxt = file.name.endsWith('.csv') || file.name.endsWith('.txt');

      if (isCsvOrTxt) {
        const decodedText = decodeBytesWithEncodingDetection(buffer);
        workbook = XLSX.read(decodedText, { type: 'string' });
      } else {
        workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      let rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

      if (!rawRows || rawRows.length < 2) continue;

      rawRows = rawRows.map(row => 
        row.map(cell => typeof cell === 'string' ? repairMojibake(cell) : cell)
      );

      const fileNameHint = extractMonthFromFileName(file.name);
      processDatasetRows(rawRows, tempAgg, fileNameHint);
      filesParsed++;
    } catch (err) {
      console.error(err);
      errors.push(`${file.name}: ${err.message}`);
    }
  }

  if (tempAgg.size === 0) {
    setFileStatus(`Erreur : aucun produit exploitable détecté. ${errors.join(', ')}`, true);
    return;
  }

  for (const [sku, record] of tempAgg.entries()) {
    HectorState.products.set(sku, {
      sku: sku,
      monthlyDemand: record.monthlyDemand,
      observedMonths: record.observedMonths
    });
  }

  recalculateAll();
  setFileStatus(`✓ ${filesParsed} fichier(s) analysé(s) avec succès ! ${tempAgg.size} références chargées avec encodage et accents validés.`);
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsArrayBuffer(file);
  });
}

function decodeBytesWithEncodingDetection(arrayBuffer) {
  const uint8 = new Uint8Array(arrayBuffer);

  // 1. Détection BOM UTF-8 (EF BB BF)
  if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
    const text = new TextDecoder('utf-8').decode(uint8.subarray(3));
    return repairMojibake(text);
  }

  // 2. Décodage UTF-8 strict
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const text = utf8Decoder.decode(uint8);
    return repairMojibake(text);
  } catch (e) {
    // 3. Fallback Windows-1252 / ISO-8859-1
    const winDecoder = new TextDecoder('windows-1252');
    const text = winDecoder.decode(uint8);
    return repairMojibake(text);
  }
}

function repairMojibake(str) {
  if (!str || typeof str !== 'string') return str;

  if (/[\u00C2\u00C3]/.test(str)) {
    try {
      const bytes = new Uint8Array(str.split('').map(c => c.charCodeAt(0) & 0xFF));
      const decoded = new TextDecoder('utf-8').decode(bytes);
      if (!decoded.includes('\uFFFD')) {
        str = decoded;
      }
    } catch(e) {}
  }

  return str
    .replace(/\u00C3\u00A9/g, 'é')
    .replace(/\u00C3\u00A8/g, 'è')
    .replace(/\u00C3\u00A0/g, 'à')
    .replace(/\u00C3\u00A2/g, 'â')
    .replace(/\u00C3\u00AA/g, 'ê')
    .replace(/\u00C3\u00AE/g, 'î')
    .replace(/\u00C3\u00AF/g, 'ï')
    .replace(/\u00C3\u00B4/g, 'ô')
    .replace(/\u00C3\u00BB/g, 'û')
    .replace(/\u00C3\u00B9/g, 'ù')
    .replace(/\u00C3\u00A7/g, 'ç')
    .replace(/\u00C3\u0089/g, 'É')
    .replace(/\u00C3\u0088/g, 'È')
    .replace(/\u00C3\u0080/g, 'À')
    .replace(/\u00C3\u0082/g, 'Â')
    .replace(/\u00C3\u008A/g, 'Ê')
    .replace(/\u00C3\u008E/g, 'Î')
    .replace(/\u00C3\u0094/g, 'Ô')
    .replace(/\u00C3\u009B/g, 'Û')
    .replace(/\u00C3\u0087/g, 'Ç')
    .replace(/\u00C2\u00B0/g, '°')
    .replace(/\u00E2\u0082\u00AC/g, '€')
    .replace(/\u00E2\u0080\u0099/g, "'")
    .replace(/\u00E2\u0080\u0093/g, '–')
    .replace(/\u00E2\u0080\u0094/g, '—')
    .replace(/\u00C2/g, '');
}

function extractMonthFromFileName(filename) {
  const name = filename.toLowerCase();
  for (let m = 0; m < 12; m++) {
    if (name.includes(MONTH_NAMES[m].toLowerCase()) || name.includes(MONTH_SHORT[m].toLowerCase())) {
      return m;
    }
  }
  const mMatch = name.match(/month[_\-\s]?(\d{1,2})|mois[_\-\s]?(\d{1,2})|m(\d{1,2})/);
  if (mMatch) {
    const num = parseInt(mMatch[1] || mMatch[2] || mMatch[3], 10);
    if (num >= 1 && num <= 12) return num - 1;
  }
  return -1;
}

// ==========================================================================
// 3. Traitement & Structuration des Données
// ==========================================================================
function processDatasetRows(rows, tempAgg, fileNameHint) {
  const headers = rows[0].map(h => String(h || "").trim().toLowerCase());

  const monthCols = headers.filter(h =>
    MONTH_NAMES.some(m => h.includes(m.toLowerCase().substring(0, 3)))
  ).length;

  if (monthCols >= 8) {
    parseMatrixFormat(rows, headers, tempAgg);
  } else {
    parseLineFormat(rows, headers, tempAgg, fileNameHint);
  }
}

function parseMatrixFormat(rows, headers, tempAgg) {
  let prodColIdx = headers.findIndex(h => /prod|art|ref|sku|code|designation|désignation|nom|titre/i.test(h));
  if (prodColIdx === -1) prodColIdx = 0;

  const monthColIndices = new Array(12).fill(-1);
  for (let m = 0; m < 12; m++) {
    const mName = MONTH_NAMES[m].toLowerCase();
    const mShort = MONTH_SHORT[m].toLowerCase();
    monthColIndices[m] = headers.findIndex(h => h.includes(mName) || h.startsWith(mShort.substring(0, 3)));
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sku = String(row[prodColIdx] || "").trim();
    if (!sku) continue;

    if (!tempAgg.has(sku)) {
      tempAgg.set(sku, { monthlyDemand: new Array(12).fill(0), observedMonths: new Set() });
    }
    const record = tempAgg.get(sku);

    for (let m = 0; m < 12; m++) {
      const colIdx = monthColIndices[m];
      if (colIdx !== -1 && row[colIdx] !== undefined && row[colIdx] !== "") {
        const val = parseFloat(String(row[colIdx]).replace(",", "."));
        if (!isNaN(val)) {
          record.monthlyDemand[m] += Math.max(0, val);
          record.observedMonths.add(m);
        }
      }
    }
  }
}

function parseLineFormat(rows, headers, tempAgg, fileNameHint) {
  let prodIdx = headers.findIndex(h => /prod|art|ref|sku|code|designation|désignation|libell|nom/i.test(h));
  if (prodIdx === -1) prodIdx = 0;

  let qtyIdx = headers.findIndex(h => 
    (/qte|qté|quant|vent|sales|volume|demande|nombre/i.test(h)) && 
    !(/ca|chiffre|affaires|prix|montant|total|eur|euro|cost|price/i.test(h))
  );
  if (qtyIdx === -1) {
    qtyIdx = headers.findIndex(h => /volume|vendu|qte/i.test(h));
    if (qtyIdx === -1) qtyIdx = rows[0].length - 1;
  }

  let dateIdx = headers.findIndex(h => /date|mois|month|periode|période|jour|day/i.test(h));
  if (dateIdx === -1) {
    for (let col = 0; col < headers.length; col++) {
      if (col === prodIdx || col === qtyIdx) continue;
      if (extractMonthIndex(rows[1] && rows[1][col]) !== -1) {
        dateIdx = col;
        break;
      }
    }
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sku = String(row[prodIdx] || "").trim();
    if (!sku) continue;

    const rawQty = parseFloat(String(row[qtyIdx] || 0).replace(",", "."));
    const qty = isNaN(rawQty) ? 0 : Math.max(0, rawQty);

    let monthIndex = -1;
    if (dateIdx !== -1 && row[dateIdx] !== undefined) {
      monthIndex = extractMonthIndex(row[dateIdx]);
    }
    if (monthIndex === -1 && fileNameHint !== -1) {
      monthIndex = fileNameHint;
    }

    if (monthIndex < 0 || monthIndex > 11) continue;

    if (!tempAgg.has(sku)) {
      tempAgg.set(sku, { monthlyDemand: new Array(12).fill(0), observedMonths: new Set() });
    }
    const record = tempAgg.get(sku);
    record.monthlyDemand[monthIndex] += qty;
    record.observedMonths.add(monthIndex);
  }
}

function extractMonthIndex(rawDate) {
  if (rawDate === undefined || rawDate === null) return -1;
  const str = String(rawDate).trim().toLowerCase();
  if (!str) return -1;

  for (let m = 0; m < 12; m++) {
    const full = MONTH_NAMES[m].toLowerCase();
    const short = MONTH_SHORT[m].toLowerCase().substring(0, 3);
    if (str.includes(full) || str.startsWith(short)) {
      return m;
    }
  }

  const dateMatch = str.match(/^(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,4})/);
  if (dateMatch) {
    const p1 = parseInt(dateMatch[1], 10);
    const p2 = parseInt(dateMatch[2], 10);
    const p3 = parseInt(dateMatch[3], 10);
    if (p1 > 1000 && p2 >= 1 && p2 <= 12) return p2 - 1; // YYYY-MM-DD
    if (p3 > 1000 && p2 >= 1 && p2 <= 12) return p2 - 1; // DD/MM/YYYY
    if (p1 >= 1 && p1 <= 12 && p2 > 12) return p1 - 1; // MM/DD/YYYY
    if (p2 >= 1 && p2 <= 12) return p2 - 1; // DD/MM/YY
  }

  if (/^(0?[1-9]|1[0-2])$/.test(str)) {
    return parseInt(str, 10) - 1;
  }

  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    return rawDate.getMonth();
  }

  if (typeof rawDate === "number" && rawDate >= 29000 && rawDate <= 60000) {
    const jsDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) return jsDate.getUTCMonth();
  }

  return -1;
}

// ==========================================================================
// 4. Moteur de Calcul Supply Chain & Extrapolation Prévisionnelle
// ==========================================================================
function calculateProductStockParameters(product, params) {
  const rawDemand = product.monthlyDemand;
  const observedMonths = product.observedMonths instanceof Set ? product.observedMonths : new Set();

  // 1. Calcul des ventes réelles déjà constatées
  let actualTotal = 0;
  let observedCount = 0;

  for (let m = 0; m < 12; m++) {
    if (observedMonths.has(m)) {
      actualTotal += rawDemand[m];
      observedCount++;
    }
  }

  // Rythme moyen de vente sur les mois observés
  const baseMonthlyRate = observedCount > 0 ? (actualTotal / observedCount) : 0;

  // 2. Extrapolation sur les mois non observés (futurs)
  const fullYearDemand = new Array(12);
  let forecastTotal = 0;

  for (let m = 0; m < 12; m++) {
    if (observedMonths.has(m)) {
      // Mois historique réel
      fullYearDemand[m] = rawDemand[m];
    } else {
      // Mois futur à extrapoler
      let multiplier = 1.0;
      if (m === 10) {
        multiplier = params.blackFridayMultiplier; // Novembre (Black Friday)
      } else if (m === 11) {
        multiplier = params.xmasMultiplier;        // Décembre (Noël / Fêtes)
      } else if (m === 6 || m === 7) {
        multiplier = 1.0;                          // Été standard
      }
      const extrapolated = Math.round(baseMonthlyRate * multiplier);
      fullYearDemand[m] = extrapolated;
      forecastTotal += extrapolated;
    }
  }

  const annualTotal = actualTotal + forecastTotal;
  const avgMonthly = annualTotal / 12;

  // 3. Calcul des indices de saisonnalité
  const seasonalIndices = fullYearDemand.map(d => avgMonthly > 0 ? (d / avgMonthly) : 1);
  const maxCS = Math.max(...seasonalIndices);
  const minCS = Math.min(...seasonalIndices);
  const ratioSeason = minCS > 0 ? (maxCS / minCS) : (maxCS > 1 ? 2 : 1);

  const isSeasonal = ratioSeason >= params.seasonalityRatioThreshold && annualTotal > 0;
  const peakIdx = seasonalIndices.indexOf(maxCS);
  const lowIdx = seasonalIndices.indexOf(minCS);

  // 4. Détail mois par mois (Seuils Min, Max, Stock de Sécurité)
  const calculations = [];
  const L = params.leadTimeDays;
  const P = params.reviewPeriodDays;
  const Z = params.zScore;

  for (let m = 0; m < 12; m++) {
    const currentMonthDemand = fullYearDemand[m];
    const isObserved = observedMonths.has(m);
    const dailyDemand = currentMonthDemand / 30;

    // Anticipation de la demande sur la fenêtre du Délai de Réapprovisionnement L (glissante)
    let leadTimeDemand = 0;
    let daysRemainingInLeadTime = L;
    let currentScanMonth = m;

    while (daysRemainingInLeadTime > 0) {
      const monthRate = fullYearDemand[currentScanMonth % 12] / 30;
      const daysInThisChunk = Math.min(daysRemainingInLeadTime, 30);
      leadTimeDemand += monthRate * daysInThisChunk;
      daysRemainingInLeadTime -= daysInThisChunk;
      currentScanMonth++;
    }

    // Incertitude & Écart-type journalier estimé
    const sigmaDay = Math.sqrt(Math.max(1, dailyDemand * 1.5));

    // Stock de sécurité : SS = Z * sigma_jour * sqrt(L)
    const safetyStock = Math.ceil(Z * sigmaDay * Math.sqrt(L));

    // Seuil Min (Point de commande) = Demande pendant délai + Stock de sécurité
    const stockMin = Math.ceil(leadTimeDemand + safetyStock);

    // Lot de réassort (couverture de la période de revue P)
    const reorderLot = Math.ceil(dailyDemand * P);

    // Seuil Max = Min + Lot de réassort
    const stockMax = stockMin + Math.max(1, reorderLot);

    // Phase saisonnière
    let phase = 'normal';
    if (isSeasonal) {
      if (m === peakIdx || seasonalIndices[m] >= 1.3) phase = 'peak';
      else if (m === lowIdx || seasonalIndices[m] <= 0.7) phase = 'low';
    }

    calculations.push({
      monthIndex: m,
      monthName: MONTH_NAMES[m],
      demand: Math.round(currentMonthDemand),
      isObserved: isObserved,
      natureLabel: isObserved ? '🟢 Déjà Vendu' : '🔮 Prévision Extrapolée',
      seasonalIndex: parseFloat(seasonalIndices[m].toFixed(2)),
      leadTimeDemand: Math.round(leadTimeDemand),
      safetyStock: safetyStock,
      stockMin: stockMin,
      stockMax: stockMax,
      reorderLot: reorderLot,
      phase: phase
    });
  }

  const allMins = calculations.map(c => c.stockMin);
  const allMaxs = calculations.map(c => c.stockMax);

  return {
    ...product,
    observedMonths: observedMonths,
    observedCount: observedCount,
    actualTotal: Math.round(actualTotal),
    forecastTotal: Math.round(forecastTotal),
    annualTotal: Math.round(annualTotal),
    baseMonthlyRate: Math.round(baseMonthlyRate),
    avgMonthly: Math.round(avgMonthly),
    seasonalIndices: seasonalIndices,
    isSeasonal: isSeasonal,
    peakMonth: MONTH_NAMES[peakIdx],
    lowMonth: MONTH_NAMES[lowIdx],
    minLowSeason: Math.min(...allMins),
    minHighSeason: Math.max(...allMins),
    maxLowSeason: Math.min(...allMaxs),
    maxHighSeason: Math.max(...allMaxs),
    calculations: calculations
  };
}

function recalculateAll() {
  if (HectorState.products.size === 0) return;

  for (const [sku, prod] of HectorState.products.entries()) {
    const computed = calculateProductStockParameters(prod, HectorState.params);
    HectorState.products.set(sku, computed);
  }

  if (!HectorState.selectedSku || !HectorState.products.has(HectorState.selectedSku)) {
    HectorState.selectedSku = HectorState.products.keys().next().value;
  }

  renderUI();
}

// ==========================================================================
// 5. Rendu Visuel : KPIs, Vues Référence & Date
// ==========================================================================
function renderUI() {
  const resultsSection = document.getElementById("results-section");
  resultsSection.style.display = "flex";
  resultsSection.style.flexDirection = "column";

  renderKPIs();
  renderMonthChips();

  if (HectorState.activeViewMode === 'sku') {
    renderProductSelector();
    renderSelectedProduct();
    renderSummaryTable();
  } else {
    renderMonthView();
  }
}

function renderKPIs() {
  const products = Array.from(HectorState.products.values());
  const totalSkus = products.length;
  const seasonalCount = products.filter(p => p.isSeasonal).length;

  let totalActual = 0;
  let totalForecast = 0;
  let totalSS = 0;

  products.forEach(p => {
    totalActual += p.actualTotal;
    totalForecast += p.forecastTotal;
    p.calculations.forEach(c => totalSS += c.safetyStock);
  });

  const totalDemand = totalActual + totalForecast;
  const avgSS = Math.round(totalSS / (totalSkus * 12));

  document.getElementById("kpi-total-skus").textContent = totalSkus.toLocaleString("fr-FR");
  document.getElementById("kpi-actual-demand").textContent = totalActual.toLocaleString("fr-FR");
  document.getElementById("kpi-total-demand").textContent = totalDemand.toLocaleString("fr-FR");
  document.getElementById("kpi-seasonal-count").textContent = seasonalCount.toLocaleString("fr-FR");
  document.getElementById("kpi-seasonal-ratio").textContent = `${Math.round((seasonalCount / totalSkus) * 100)}% du catalogue`;
  document.getElementById("kpi-avg-ss").textContent = avgSS.toLocaleString("fr-FR");
}

// --------------------------------------------------------------------------
// 5.A VUE REGROUPÉE PAR RÉFÉRENCE (ARTICLE)
// --------------------------------------------------------------------------
function renderProductSelector() {
  const input = document.getElementById("product-combobox-input");
  if (input && HectorState.selectedSku) {
    input.value = HectorState.selectedSku;
  }
  renderComboboxDropdown(input ? input.value : "");
}

function renderSelectedProduct() {
  const prod = HectorState.products.get(HectorState.selectedSku);
  if (!prod) return;

  const badge = document.getElementById("product-season-badge");
  if (prod.isSeasonal) {
    badge.textContent = `⚡ Saisonnier (Pic en ${prod.peakMonth})`;
    badge.className = "badge badge-seasonal";
  } else {
    badge.textContent = "◆ Profil Régulier";
    badge.className = "badge badge-stable";
  }

  renderDecisionBrief(prod);
  renderStockChart(prod);
  renderProductMonthlyTable(prod);
}

function renderDecisionBrief(prod) {
  const container = document.getElementById("product-decision-brief");
  if (!container) return;

  const m = HectorState.selectedMonth;
  const monthName = MONTH_NAMES[m];
  const currentCalc = prod.calculations[m];

  container.innerHTML = `
    <div class="decision-brief-header">
      <h5>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Fiche Décisionnelle d'Approvisionnement — ${prod.sku}
      </h5>
      <span class="badge ${prod.isSeasonal ? 'badge-seasonal' : 'badge-stable'}">${prod.isSeasonal ? '⚡ Forte Saisonnalité' : '◆ Ventes Régulières'}</span>
    </div>

    <div class="decision-brief-stats">
      <div class="decision-stat">
        <span>Ventes déjà réalisées :</span>
        <strong>${prod.actualTotal.toLocaleString("fr-FR")} unités</strong> (${prod.observedCount} mois d'historique)
      </div>
      <div class="decision-stat">
        <span>Rythme moyen réel :</span>
        <strong>${prod.baseMonthlyRate.toLocaleString("fr-FR")} u./mois</strong>
      </div>
      <div class="decision-stat">
        <span>Prévisions extrapolées :</span>
        <strong>${prod.forecastTotal.toLocaleString("fr-FR")} unités</strong> (reste de l'année)
      </div>
      <div class="decision-stat">
        <span>Ventes annuelles projetées :</span>
        <strong>${prod.annualTotal.toLocaleString("fr-FR")} unités</strong>
      </div>
    </div>

    <div class="decision-action-box">
      <strong>📋 Consigne de réassort pour ${monthName} :</strong>
      Déclenchez une commande dès que votre stock physique + commandes en cours descend à <strong style="color: #dc2626;">Min = ${currentCalc.stockMin.toLocaleString("fr-FR")} unités</strong>. 
      Commandez un lot de <strong>${currentCalc.reorderLot.toLocaleString("fr-FR")} unités</strong> pour remonter au plafond de <strong style="color: #2563eb;">Max = ${currentCalc.stockMax.toLocaleString("fr-FR")} unités</strong>, 
      tout en conservant votre matelas inviolable de <strong style="color: #d97706;">Sécurité = ${currentCalc.safetyStock.toLocaleString("fr-FR")} unités</strong>.
    </div>
  `;
}

function renderStockChart(prod) {
  const ctx = document.getElementById("stock-chart").getContext("2d");
  const labels = MONTH_NAMES;
  const dataDemand = prod.calculations.map(c => c.demand);
  const dataMin = prod.calculations.map(c => c.stockMin);
  const dataMax = prod.calculations.map(c => c.stockMax);
  const dataSS = prod.calculations.map(c => c.safetyStock);

  // Couleurs distinctes pour les ventes réelles vs prévisions
  const barBackgrounds = prod.calculations.map(c => 
    c.isObserved ? 'rgba(2, 132, 199, 0.75)' : 'rgba(139, 92, 246, 0.75)'
  );
  const barBorders = prod.calculations.map(c => 
    c.isObserved ? '#0284c7' : '#8b5cf6'
  );

  if (HectorState.chartInstance) {
    HectorState.chartInstance.destroy();
  }

  HectorState.chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Stock MAX (Plafond réassort)',
          data: dataMax,
          type: 'line',
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          fill: '+1',
          borderWidth: 2.5,
          tension: 0.25,
          pointBackgroundColor: '#2563eb',
          pointRadius: 4,
          order: 1
        },
        {
          label: 'Stock MIN (Point de commande)',
          data: dataMin,
          type: 'line',
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.06)',
          fill: '+1',
          borderWidth: 2.5,
          tension: 0.25,
          pointBackgroundColor: '#dc2626',
          pointRadius: 4,
          order: 2
        },
        {
          label: 'Stock de Sécurité (Coussin inviolable)',
          data: dataSS,
          type: 'line',
          borderColor: '#f59e0b',
          borderWidth: 2,
          borderDash: [5, 4],
          pointBackgroundColor: '#f59e0b',
          pointRadius: 3,
          fill: false,
          order: 3
        },
        {
          label: 'Ventes (Bleu = Déjà Vendu, Violet = Prévision)',
          data: dataDemand,
          type: 'bar',
          backgroundColor: barBackgrounds,
          borderColor: barBorders,
          borderWidth: 1.5,
          borderRadius: 4,
          order: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: 'Inter', size: 13, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            afterTitle: (items) => {
              const mIdx = items[0].dataIndex;
              const calc = prod.calculations[mIdx];
              return calc.isObserved ? '🟢 Ventes Réelles Constatées' : '🔮 Prévision Extrapolée';
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { font: { family: 'Inter', size: 11 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11 } }
        }
      }
    }
  });
}

function renderProductMonthlyTable(prod) {
  const tbody = document.getElementById("product-monthly-tbody");
  tbody.innerHTML = "";

  prod.calculations.forEach(calc => {
    const tr = document.createElement("tr");

    const badgeNature = calc.isObserved
      ? '<span class="badge-actual">🟢 Déjà Vendu</span>'
      : '<span class="badge-forecast">🔮 Prévision</span>';

    tr.innerHTML = `
      <td><strong>${calc.monthName}</strong></td>
      <td>${badgeNature}</td>
      <td><strong>${calc.demand.toLocaleString("fr-FR")}</strong></td>
      <td>${calc.seasonalIndex.toFixed(2)}</td>
      <td>${calc.leadTimeDemand.toLocaleString("fr-FR")}</td>
      <td>${calc.safetyStock.toLocaleString("fr-FR")}</td>
      <td class="col-highlight-min"><strong>${calc.stockMin.toLocaleString("fr-FR")}</strong></td>
      <td class="col-highlight-max"><strong>${calc.stockMax.toLocaleString("fr-FR")}</strong></td>
      <td><strong>${calc.reorderLot.toLocaleString("fr-FR")}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSummaryTable() {
  const tbody = document.getElementById("all-products-tbody");
  tbody.innerHTML = "";

  let products = Array.from(HectorState.products.values());
  const { key, asc } = HectorState.sortConfig.skuTable;

  products.sort((a, b) => {
    let valA = a[key];
    let valB = b[key];
    if (typeof valA === 'string') {
      return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return asc ? (valA - valB) : (valB - valA);
  });

  products.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${p.sku}</strong></td>
      <td>${p.isSeasonal ? '<span class="badge badge-seasonal">Saisonnier</span>' : '<span class="badge badge-stable">Stable</span>'}</td>
      <td><strong style="color: #059669;">${p.actualTotal.toLocaleString("fr-FR")}</strong> (${p.observedCount} mois)</td>
      <td><strong style="color: #2563eb;">${p.annualTotal.toLocaleString("fr-FR")}</strong></td>
      <td><strong>${p.peakMonth}</strong></td>
      <td>${p.minLowSeason.toLocaleString("fr-FR")}</td>
      <td class="col-highlight-min"><strong>${p.minHighSeason.toLocaleString("fr-FR")}</strong></td>
      <td>${p.maxLowSeason.toLocaleString("fr-FR")}</td>
      <td class="col-highlight-max"><strong>${p.maxHighSeason.toLocaleString("fr-FR")}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

function filterSummaryTable(query) {
  const rows = document.querySelectorAll("#all-products-tbody tr");
  rows.forEach(r => {
    const sku = r.children[0].textContent.toLowerCase();
    r.style.display = sku.includes(query) ? "" : "none";
  });
}

// --------------------------------------------------------------------------
// 5.B VUE REGROUPÉE PAR DATE / MOIS (CALENDRIER)
// --------------------------------------------------------------------------
function renderMonthChips() {
  const container = document.getElementById("month-chips-container");
  container.innerHTML = "";

  MONTH_NAMES.forEach((name, m) => {
    const chip = document.createElement("div");
    chip.className = `month-chip ${m === HectorState.selectedMonth ? 'active' : ''}`;
    
    let badgeText = "";
    if (m === 10) badgeText = "🔥 Black Friday";
    else if (m === 11) badgeText = "🎄 Fêtes";
    else if (m === 6 || m === 7) badgeText = "☀️ Été";
    else if (m === 8) badgeText = "🎒 Rentrée";

    chip.innerHTML = `
      <span class="month-chip-name">${name}</span>
      <span class="month-chip-sub">${badgeText || `Mois ${m + 1}`}</span>
    `;

    chip.addEventListener("click", () => {
      HectorState.selectedMonth = m;
      document.querySelectorAll(".month-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderMonthView();
    });

    container.appendChild(chip);
  });
}

function renderMonthView() {
  const m = HectorState.selectedMonth;
  const monthName = MONTH_NAMES[m];

  document.getElementById("month-kpi-title-demand").textContent = `Demande prévue en ${monthName}`;
  document.getElementById("month-chart-title").textContent = `Top 10 Références — Min & Max en ${monthName}`;
  document.getElementById("month-table-title").textContent = `Plan de Commande & Paramètres de Stock — ${monthName}`;

  renderMonthKPIs(m);
  renderMonthChart(m);
  renderMonthTable(m);
}

function renderMonthKPIs(m) {
  const products = Array.from(HectorState.products.values());
  let totalDemand = 0;
  let totalMin = 0;
  let totalMax = 0;
  let peakCount = 0;
  let observedCount = 0;

  products.forEach(p => {
    const calc = p.calculations[m];
    totalDemand += calc.demand;
    totalMin += calc.stockMin;
    totalMax += calc.stockMax;
    if (calc.phase === 'peak') peakCount++;
    if (calc.isObserved) observedCount++;
  });

  const isReal = observedCount === products.length && products.length > 0;
  const subText = isReal ? "🟢 Ventes réelles constatées" : "🔮 Prévisions extrapolées";

  document.getElementById("month-kpi-demand").textContent = totalDemand.toLocaleString("fr-FR");
  document.getElementById("month-kpi-type-sub").textContent = subText;
  document.getElementById("month-kpi-min").textContent = totalMin.toLocaleString("fr-FR");
  document.getElementById("month-kpi-max").textContent = totalMax.toLocaleString("fr-FR");
  document.getElementById("month-kpi-peaks").textContent = peakCount.toLocaleString("fr-FR");
  document.getElementById("month-kpi-peaks-sub").textContent = `${peakCount} référence(s) en tension ce mois-ci`;
}

function renderMonthChart(m) {
  const ctx = document.getElementById("month-stock-chart").getContext("2d");
  const products = Array.from(HectorState.products.values());

  const top10 = products
    .map(p => ({ sku: p.sku, ...p.calculations[m] }))
    .sort((a, b) => b.stockMin - a.stockMin)
    .slice(0, 10);

  const labels = top10.map(item => item.sku.length > 22 ? item.sku.substring(0, 20) + '…' : item.sku);
  const dataMin = top10.map(item => item.stockMin);
  const dataMax = top10.map(item => item.stockMax);
  const dataDemand = top10.map(item => item.demand);

  if (HectorState.monthChartInstance) {
    HectorState.monthChartInstance.destroy();
  }

  HectorState.monthChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Stock MAX (Plafond)',
          data: dataMax,
          backgroundColor: 'rgba(37, 99, 235, 0.85)',
          borderRadius: 4
        },
        {
          label: 'Stock MIN (Point de commande)',
          data: dataMin,
          backgroundColor: 'rgba(220, 38, 38, 0.85)',
          borderRadius: 4
        },
        {
          label: 'Ventes du Mois',
          data: dataDemand,
          backgroundColor: 'rgba(148, 163, 184, 0.65)',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { font: { family: 'Inter', size: 11, weight: 'bold' } }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          cornerRadius: 6,
          padding: 10
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
          ticks: { font: { family: 'Inter', size: 11 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11 } }
        }
      }
    }
  });
}

function renderMonthTable(m = HectorState.selectedMonth) {
  const tbody = document.getElementById("month-products-tbody");
  tbody.innerHTML = "";

  const products = Array.from(HectorState.products.values());
  const rows = products.map(p => ({
    sku: p.sku,
    isSeasonal: p.isSeasonal,
    nature: p.calculations[m].isObserved ? 'actual' : 'forecast',
    ...p.calculations[m]
  }));

  const { key, asc } = HectorState.sortConfig.monthTable;
  rows.sort((a, b) => {
    let valA = a[key];
    let valB = b[key];
    if (typeof valA === 'string') {
      return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return asc ? (valA - valB) : (valB - valA);
  });

  rows.forEach(r => {
    const tr = document.createElement("tr");

    let phaseHtml = '<span class="phase-badge phase-normal">⚖️ Normal</span>';
    if (r.phase === 'peak') {
      phaseHtml = '<span class="phase-badge phase-peak">🔥 Pic Saison</span>';
    } else if (r.phase === 'low') {
      phaseHtml = '<span class="phase-badge phase-low">❄️ Creux</span>';
    }

    const natureHtml = r.isObserved
      ? '<span class="badge-actual">🟢 Déjà Vendu</span>'
      : '<span class="badge-forecast">🔮 Prévision</span>';

    tr.innerHTML = `
      <td><strong>${r.sku}</strong></td>
      <td>${natureHtml}</td>
      <td>${phaseHtml}</td>
      <td><strong>${r.demand.toLocaleString("fr-FR")}</strong></td>
      <td>${r.seasonalIndex.toFixed(2)}</td>
      <td>${r.leadTimeDemand.toLocaleString("fr-FR")}</td>
      <td>${r.safetyStock.toLocaleString("fr-FR")}</td>
      <td class="col-highlight-min"><strong>${r.stockMin.toLocaleString("fr-FR")}</strong></td>
      <td class="col-highlight-max"><strong>${r.stockMax.toLocaleString("fr-FR")}</strong></td>
      <td><strong>${r.reorderLot.toLocaleString("fr-FR")}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

function filterMonthTable(query) {
  const rows = document.querySelectorAll("#month-products-tbody tr");
  rows.forEach(r => {
    const sku = r.children[0].textContent.toLowerCase();
    r.style.display = sku.includes(query) ? "" : "none";
  });
}

// ==========================================================================
// 6. Données de Démonstration (Cas Réel Nouveau Commerce : 5 mois + Extrapolation)
// ==========================================================================
function loadDemoData() {
  HectorState.products.clear();

  // Simule un commerce ayant 5 mois d'historique réel (Janvier à Mai)
  const observed5Months = new Set([0, 1, 2, 3, 4]);

  HectorState.products.set("Crème Solaire SPF50 200ml", {
    sku: "Crème Solaire SPF50 200ml",
    monthlyDemand: [45, 60, 110, 280, 750, 0, 0, 0, 0, 0, 0, 0],
    observedMonths: observed5Months
  });

  HectorState.products.set("Boîte Chocolats Prestige 500g", {
    sku: "Boîte Chocolats Prestige 500g",
    monthlyDemand: [80, 95, 120, 140, 90, 0, 0, 0, 0, 0, 0, 0],
    observedMonths: observed5Months
  });

  HectorState.products.set("Cahier Spirale Grand Format 96p", {
    sku: "Cahier Spirale Grand Format 96p",
    monthlyDemand: [150, 140, 160, 180, 210, 0, 0, 0, 0, 0, 0, 0],
    observedMonths: observed5Months
  });

  HectorState.products.set("Vis Inox A4 M6x25 (Boîte 100)", {
    sku: "Vis Inox A4 M6x25 (Boîte 100)",
    monthlyDemand: [420, 450, 460, 430, 470, 0, 0, 0, 0, 0, 0, 0],
    observedMonths: observed5Months
  });

  setFileStatus("✓ Données de démo chargées : 5 mois réels constatés + extrapolations automatiques pour Novembre (+20% Black Friday) et Décembre (+60% Fêtes) !");
  recalculateAll();
}

function downloadExcelTemplate() {
  const templateData = [
    ["Produit", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
    ["Exemple Article A (Estival)", 50, 60, 120, 300, 800, 1500, 1900, 1700, 450, 150, 60, 40],
    ["Exemple Article B (Hivernal)", 90, 110, 130, 120, 80, 70, 60, 80, 120, 350, 1300, 2200],
    ["Exemple Article C (Régulier)", 500, 520, 490, 510, 530, 480, 450, 350, 540, 530, 510, 480]
  ];

  const ws = XLSX.utils.aoa_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modele_Historique_Ventes");
  XLSX.writeFile(wb, "Hector_Modele_Ventes_Saisonnier.xlsx");
}

// ==========================================================================
// 7. Exportations (Excel & CSV avec BOM UTF-8 pour Excel Windows)
// ==========================================================================
function exportResultsToExcel() {
  if (HectorState.products.size === 0) return;

  const monthlyRows = [
    [
      "Référence Produit", "Classification", "Mois", "Nature des Données", "Ventes (Réel/Prévu)", 
      "Coeff. Saison (CS)", "Demande sur Délai L", "Stock Sécurité (SS)", 
      "Stock MIN (Point Commande)", "Stock MAX (Plafond)", "Lot Réassort Conseillé"
    ]
  ];

  HectorState.products.forEach(p => {
    p.calculations.forEach(c => {
      monthlyRows.push([
        p.sku,
        p.isSeasonal ? "Saisonnier" : "Stable",
        c.monthName,
        c.isObserved ? "Réel Constaté" : "Prévision Extrapolée",
        c.demand,
        c.seasonalIndex,
        c.leadTimeDemand,
        c.safetyStock,
        c.stockMin,
        c.stockMax,
        c.reorderLot
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(monthlyRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Parametres_Stock_Complets");
  XLSX.writeFile(wb, "Hector_Stock_Min_Max_Catalogue.xlsx");
}

function exportResultsToCSV() {
  if (HectorState.products.size === 0) return;

  const lines = [
    "Référence Produit;Classification;Mois;Nature Données;Ventes;Coeff Saison;Demande Délai;Stock Sécurité;Stock MIN;Stock MAX;Lot Réassort"
  ];

  HectorState.products.forEach(p => {
    p.calculations.forEach(c => {
      lines.push([
        `"${p.sku.replace(/"/g, '""')}"`,
        p.isSeasonal ? "Saisonnier" : "Stable",
        c.monthName,
        c.isObserved ? "Réel Constaté" : "Prévision Extrapolée",
        c.demand,
        c.seasonalIndex,
        c.leadTimeDemand,
        c.safetyStock,
        c.stockMin,
        c.stockMax,
        c.reorderLot
      ].join(";"));
    });
  });

  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, "Hector_Stock_Min_Max_Catalogue.csv");
}

function exportSelectedMonthToExcel() {
  if (HectorState.products.size === 0) return;
  const m = HectorState.selectedMonth;
  const monthName = MONTH_NAMES[m];

  const rows = [
    [
      "Référence Produit", "Classification", "Nature Données", "Phase Saison", `Ventes ${monthName}`,
      "Coeff. Saison (CS)", "Demande sur Délai L", "Stock Sécurité (SS)", 
      "Stock MIN (Point Commande)", "Stock MAX (Plafond)", "Lot Réassort"
    ]
  ];

  HectorState.products.forEach(p => {
    const c = p.calculations[m];
    rows.push([
      p.sku,
      p.isSeasonal ? "Saisonnier" : "Stable",
      c.isObserved ? "Réel Constaté" : "Prévision Extrapolée",
      c.phase === 'peak' ? 'Pic de Saison' : (c.phase === 'low' ? 'Creux' : 'Normal'),
      c.demand,
      c.seasonalIndex,
      c.leadTimeDemand,
      c.safetyStock,
      c.stockMin,
      c.stockMax,
      c.reorderLot
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Commandes_${monthName}`);
  XLSX.writeFile(wb, `Hector_Plan_Commande_${monthName}.xlsx`);
}

function exportSelectedMonthToCSV() {
  if (HectorState.products.size === 0) return;
  const m = HectorState.selectedMonth;
  const monthName = MONTH_NAMES[m];

  const lines = [
    `Référence Produit;Classification;Nature Données;Phase Saison;Ventes ${monthName};Coeff Saison;Demande Délai;Stock Sécurité;Stock MIN;Stock MAX;Lot Réassort`
  ];

  HectorState.products.forEach(p => {
    const c = p.calculations[m];
    lines.push([
      `"${p.sku.replace(/"/g, '""')}"`,
      p.isSeasonal ? "Saisonnier" : "Stable",
      c.isObserved ? "Réel Constaté" : "Prévision Extrapolée",
      c.phase === 'peak' ? 'Pic de Saison' : (c.phase === 'low' ? 'Creux' : 'Normal'),
      c.demand,
      c.seasonalIndex,
      c.leadTimeDemand,
      c.safetyStock,
      c.stockMin,
      c.stockMax,
      c.reorderLot
    ].join(";"));
  });

  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `Hector_Plan_Commande_${monthName}.csv`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
