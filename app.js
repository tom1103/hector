/**
 * HECTOR — Optimiseur de Stock Min/Max Saisonnier
 * Moteur Supply Chain, Gestion Multi-Encodages (UTF-8 / Windows-1252) & Double Vue (Par Référence / Par Date)
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
    skuTable: { key: 'sku', asc: true },
    monthTable: { key: 'demand', asc: false }
  },
  params: {
    leadTimeDays: 7,
    reviewPeriodDays: 7,
    zScore: 1.65,
    seasonalityRatioThreshold: 1.4
  }
};

// ==========================================================================
// 1. Initialisation & Événements DOM
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  initDropzone();
  initParamListeners();
  initActionButtons();
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

  HectorState.params.leadTimeDays = Math.max(1, parseInt(leadTimeInput.value, 10) || 7);
  HectorState.params.reviewPeriodDays = Math.max(1, parseInt(reviewInput.value, 10) || 7);
  HectorState.params.zScore = parseFloat(zScoreSelect.value) || 1.65;
  HectorState.params.seasonalityRatioThreshold = parseFloat(seasonSelect.value) || 1.4;
}

function initActionButtons() {
  // Démo
  document.getElementById("btn-demo").addEventListener("click", loadDemoData);

  // Téléchargement modèle Excel
  document.getElementById("btn-download-template").addEventListener("click", downloadExcelTemplate);

  // Sélecteur de produit (Vue par Référence)
  document.getElementById("product-select").addEventListener("change", (e) => {
    HectorState.selectedSku = e.target.value;
    renderSelectedProduct();
  });

  // Exports globaux
  document.getElementById("btn-export-excel").addEventListener("click", exportResultsToExcel);
  document.getElementById("btn-export-csv").addEventListener("click", exportResultsToCSV);

  // Exports du mois sélectionné
  document.getElementById("btn-export-month-excel").addEventListener("click", exportSelectedMonthToExcel);
  document.getElementById("btn-export-month-csv").addEventListener("click", exportSelectedMonthToCSV);
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
  // Recherche dans le catalogue global
  const searchInput = document.getElementById("catalog-search");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      filterSummaryTable(query);
    });
  }

  // Recherche dans le tableau du mois
  const monthSearchInput = document.getElementById("month-table-search");
  if (monthSearchInput) {
    monthSearchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      filterMonthTable(query);
    });
  }
}

function initSorting() {
  // Tri tableau catalogue
  document.querySelectorAll(".sortable-th").forEach(th => {
    th.addEventListener("click", () => {
      const sortKey = th.getAttribute("data-sort");
      if (HectorState.sortConfig.skuTable.key === sortKey) {
        HectorState.sortConfig.skuTable.asc = !HectorState.sortConfig.skuTable.asc;
      } else {
        HectorState.sortConfig.skuTable.key = sortKey;
        HectorState.sortConfig.skuTable.asc = true;
      }
      renderSummaryTable();
    });
  });

  // Tri tableau du mois
  document.querySelectorAll(".sortable-month-th").forEach(th => {
    th.addEventListener("click", () => {
      const sortKey = th.getAttribute("data-sort");
      if (HectorState.sortConfig.monthTable.key === sortKey) {
        HectorState.sortConfig.monthTable.asc = !HectorState.sortConfig.monthTable.asc;
      } else {
        HectorState.sortConfig.monthTable.key = sortKey;
        HectorState.sortConfig.monthTable.asc = (sortKey === 'sku' || sortKey === 'phase');
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

  const tempAgg = new Map(); // sku -> Array(12)
  let filesParsed = 0;
  const errors = [];

  for (const file of files) {
    try {
      const buffer = await readFileAsArrayBuffer(file);
      let workbook;

      const isCsvOrTxt = file.name.endsWith('.csv') || file.name.endsWith('.txt');

      if (isCsvOrTxt) {
        // Décodage intelligent avec préservation absolue des accents
        const decodedText = decodeBytesWithEncodingDetection(buffer);
        // Nettoyage et lecture par SheetJS
        workbook = XLSX.read(decodedText, { type: 'string' });
      } else {
        // Fichier binaire Excel (.xlsx, .xls)
        workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      let rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

      if (!rawRows || rawRows.length < 2) continue;

      // Nettoyage des cellules textuelles pour garantir l'absence de mojibake
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

  for (const [sku, monthlyDemand] of tempAgg.entries()) {
    HectorState.products.set(sku, {
      sku: sku,
      monthlyDemand: monthlyDemand
    });
  }

  recalculateAll();
  setFileStatus(`✓ ${filesParsed} fichier(s) analysé(s) avec succès ! ${tempAgg.size} références chargées avec encodage vérifié.`);
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Détecte si le flux d'octets est un UTF-8 valide (ou avec BOM) ou s'il s'agit
 * de l'encodage Windows-1252 / ANSI traditionnel d'Excel français.
 */
function decodeBytesWithEncodingDetection(arrayBuffer) {
  const uint8 = new Uint8Array(arrayBuffer);

  // 1. Détection BOM UTF-8 (EF BB BF)
  if (uint8.length >= 3 && uint8[0] === 0xEF && uint8[1] === 0xBB && uint8[2] === 0xBF) {
    const text = new TextDecoder('utf-8').decode(uint8.subarray(3));
    return repairMojibake(text);
  }

  // 2. Tentative de décodage UTF-8 strict
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const text = utf8Decoder.decode(uint8);
    return repairMojibake(text);
  } catch (e) {
    // 3. Fallback automatique sur Windows-1252 / ISO-8859-1 (standard exports Excel FR)
    const winDecoder = new TextDecoder('windows-1252');
    const text = winDecoder.decode(uint8);
    return repairMojibake(text);
  }
}

/**
 * Répare les doubles encodages (mojibake) fréquents lors des transferts de fichiers.
 */
function repairMojibake(str) {
  if (!str || typeof str !== 'string') return str;

  // Si motif typique de mojibake UTF-8 interprété comme Latin-1
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
    .replace(/\u00C2/g, ''); // Espaces insécables orphelins
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

  // Détection Format Matrice : 12 colonnes de mois dans les en-têtes
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

    if (!tempAgg.has(sku)) tempAgg.set(sku, new Array(12).fill(0));
    const target = tempAgg.get(sku);

    for (let m = 0; m < 12; m++) {
      const colIdx = monthColIndices[m];
      if (colIdx !== -1 && row[colIdx] !== undefined) {
        const val = parseFloat(String(row[colIdx]).replace(",", "."));
        if (!isNaN(val) && val > 0) target[m] += val;
      }
    }
  }
}

function parseLineFormat(rows, headers, tempAgg, fileNameHint) {
  // Détection colonne produit
  let prodIdx = headers.findIndex(h => /prod|art|ref|sku|code|designation|désignation|libell|nom/i.test(h));
  if (prodIdx === -1) prodIdx = 0;

  // Détection colonne quantité (évite le Chiffre d'Affaires / Prix / Montants)
  let qtyIdx = headers.findIndex(h => 
    (/qte|qté|quant|vent|sales|volume|demande|nombre/i.test(h)) && 
    !(/ca|chiffre|affaires|prix|montant|total|eur|euro|cost|price/i.test(h))
  );
  if (qtyIdx === -1) {
    qtyIdx = headers.findIndex(h => /volume|vendu|qte/i.test(h));
    if (qtyIdx === -1) qtyIdx = rows[0].length - 1;
  }

  // Détection colonne date
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

    if (!tempAgg.has(sku)) tempAgg.set(sku, new Array(12).fill(0));
    tempAgg.get(sku)[monthIndex] += qty;
  }
}

function extractMonthIndex(rawDate) {
  if (rawDate === undefined || rawDate === null) return -1;
  const str = String(rawDate).trim().toLowerCase();
  if (!str) return -1;

  // 1. Détection par nom textuel (Janvier..Décembre)
  for (let m = 0; m < 12; m++) {
    const full = MONTH_NAMES[m].toLowerCase();
    const short = MONTH_SHORT[m].toLowerCase().substring(0, 3);
    if (str.includes(full) || str.startsWith(short)) {
      return m;
    }
  }

  // 2. Détection par regex date stricte (JJ/MM/AAAA ou AAAA-MM-JJ ou JJ-MM-AAAA)
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

  // 3. Détection si numéro de mois isolé (1 à 12 ou 01 à 12)
  if (/^(0?[1-9]|1[0-2])$/.test(str)) {
    return parseInt(str, 10) - 1;
  }

  // 4. Objet Date natif
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    return rawDate.getMonth();
  }

  // 5. Nombre sérial Excel (dates entre ~1980 et ~2060 : ~29000 à 60000)
  if (typeof rawDate === "number" && rawDate >= 29000 && rawDate <= 60000) {
    const jsDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) return jsDate.getUTCMonth();
  }

  // Sécurité : Ne jamais faire new Date(str) pour éviter que des montants soient convertis en janvier
  return -1;
}

// ==========================================================================
// 4. Moteur de Calcul Supply Chain (Min / Max / Saisonnier)
// ==========================================================================
function calculateProductStockParameters(product, params) {
  const demand = product.monthlyDemand;
  const annualTotal = demand.reduce((a, b) => a + b, 0);
  const avgMonthly = annualTotal / 12;

  // 1. Calcul des coefficients de saisonnalité (CS)
  const seasonalIndices = demand.map(d => avgMonthly > 0 ? (d / avgMonthly) : 1);
  const maxCS = Math.max(...seasonalIndices);
  const minCS = Math.min(...seasonalIndices);
  const ratioSeason = minCS > 0 ? (maxCS / minCS) : (maxCS > 1 ? 2 : 1);

  // Classification du produit
  const isSeasonal = ratioSeason >= params.seasonalityRatioThreshold && annualTotal > 0;

  // Mois pic et creux
  const peakIdx = seasonalIndices.indexOf(maxCS);
  const lowIdx = seasonalIndices.indexOf(minCS);

  // 2. Détail mois par mois
  const calculations = [];
  const L = params.leadTimeDays;
  const P = params.reviewPeriodDays;
  const Z = params.zScore;

  for (let m = 0; m < 12; m++) {
    const currentMonthDemand = demand[m];
    const dailyDemand = currentMonthDemand / 30;

    // Anticipation de la demande sur la fenêtre du Délai de Réapprovisionnement L
    let leadTimeDemand = 0;
    let daysRemainingInLeadTime = L;
    let currentScanMonth = m;

    while (daysRemainingInLeadTime > 0) {
      const monthRate = demand[currentScanMonth % 12] / 30;
      const daysInThisChunk = Math.min(daysRemainingInLeadTime, 30);
      leadTimeDemand += monthRate * daysInThisChunk;
      daysRemainingInLeadTime -= daysInThisChunk;
      currentScanMonth++;
    }

    // Incertitude & Écart-type journalier de la demande
    const sigmaDay = Math.sqrt(Math.max(1, dailyDemand * 1.5));

    // Stock de sécurité : SS = Z * sigma_jour * sqrt(L)
    const safetyStock = Math.ceil(Z * sigmaDay * Math.sqrt(L));

    // Seuil Min (Point de commande) = Demande pendant délai + Stock de sécurité
    const stockMin = Math.ceil(leadTimeDemand + safetyStock);

    // Lot de réassort (couverture de la période de revue P)
    const reorderLot = Math.ceil(dailyDemand * P);

    // Seuil Max = Min + Lot de réassort
    const stockMax = stockMin + Math.max(1, reorderLot);

    // Phase saisonnière du mois
    let phase = 'normal';
    if (isSeasonal) {
      if (m === peakIdx || seasonalIndices[m] >= 1.3) phase = 'peak';
      else if (m === lowIdx || seasonalIndices[m] <= 0.7) phase = 'low';
    }

    calculations.push({
      monthIndex: m,
      monthName: MONTH_NAMES[m],
      demand: Math.round(currentMonthDemand),
      seasonalIndex: parseFloat(seasonalIndices[m].toFixed(2)),
      leadTimeDemand: Math.round(leadTimeDemand),
      safetyStock: safetyStock,
      stockMin: stockMin,
      stockMax: stockMax,
      reorderLot: reorderLot,
      phase: phase
    });
  }

  // Min / Max en basse et haute saison
  const allMins = calculations.map(c => c.stockMin);
  const allMaxs = calculations.map(c => c.stockMax);

  return {
    ...product,
    annualTotal: Math.round(annualTotal),
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
  const totalDemand = products.reduce((sum, p) => sum + p.annualTotal, 0);

  let totalSS = 0;
  products.forEach(p => {
    p.calculations.forEach(c => totalSS += c.safetyStock);
  });
  const avgSS = Math.round(totalSS / (totalSkus * 12));

  document.getElementById("kpi-total-skus").textContent = totalSkus.toLocaleString("fr-FR");
  document.getElementById("kpi-seasonal-count").textContent = seasonalCount.toLocaleString("fr-FR");
  document.getElementById("kpi-seasonal-ratio").textContent = `${Math.round((seasonalCount / totalSkus) * 100)}% du catalogue`;
  document.getElementById("kpi-total-demand").textContent = totalDemand.toLocaleString("fr-FR");
  document.getElementById("kpi-avg-ss").textContent = avgSS.toLocaleString("fr-FR");
}

// --------------------------------------------------------------------------
// 5.A VUE REGROUPÉE PAR RÉFÉRENCE (ARTICLE)
// --------------------------------------------------------------------------
function renderProductSelector() {
  const select = document.getElementById("product-select");
  select.innerHTML = "";

  HectorState.products.forEach((prod, sku) => {
    const opt = document.createElement("option");
    opt.value = sku;
    opt.textContent = `${sku} (${prod.isSeasonal ? '⚡ Saisonnier' : '◆ Stable'})`;
    if (sku === HectorState.selectedSku) opt.selected = true;
    select.appendChild(opt);
  });
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

  renderStockChart(prod);
  renderProductMonthlyTable(prod);
}

function renderStockChart(prod) {
  const ctx = document.getElementById("stock-chart").getContext("2d");
  const labels = MONTH_NAMES;
  const dataDemand = prod.calculations.map(c => c.demand);
  const dataMin = prod.calculations.map(c => c.stockMin);
  const dataMax = prod.calculations.map(c => c.stockMax);
  const dataSS = prod.calculations.map(c => c.safetyStock);

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
          label: 'Stock de Sécurité (Tampon)',
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
          label: 'Ventes Prévues du Mois',
          data: dataDemand,
          type: 'bar',
          backgroundColor: 'rgba(148, 163, 184, 0.45)',
          hoverBackgroundColor: 'rgba(100, 116, 139, 0.7)',
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
          cornerRadius: 6
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
    tr.innerHTML = `
      <td><strong>${calc.monthName}</strong></td>
      <td>${calc.demand.toLocaleString("fr-FR")}</td>
      <td>${calc.seasonalIndex.toFixed(2)}</td>
      <td>${calc.leadTimeDemand.toLocaleString("fr-FR")}</td>
      <td>${calc.safetyStock.toLocaleString("fr-FR")}</td>
      <td class="col-highlight-min"><strong>${calc.stockMin.toLocaleString("fr-FR")}</strong></td>
      <td class="col-highlight-max"><strong>${calc.stockMax.toLocaleString("fr-FR")}</strong></td>
      <td>${calc.reorderLot.toLocaleString("fr-FR")}</td>
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
      <td>${p.annualTotal.toLocaleString("fr-FR")}</td>
      <td><strong>${p.peakMonth}</strong></td>
      <td>${p.minLowSeason.toLocaleString("fr-FR")}</td>
      <td class="col-highlight-min">${p.minHighSeason.toLocaleString("fr-FR")}</td>
      <td>${p.maxLowSeason.toLocaleString("fr-FR")}</td>
      <td class="col-highlight-max">${p.maxHighSeason.toLocaleString("fr-FR")}</td>
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
    
    // Détection d'indicateurs visuels de saisonnalité
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

  // Titres dynamiques
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

  products.forEach(p => {
    const calc = p.calculations[m];
    totalDemand += calc.demand;
    totalMin += calc.stockMin;
    totalMax += calc.stockMax;
    if (calc.phase === 'peak') peakCount++;
  });

  document.getElementById("month-kpi-demand").textContent = totalDemand.toLocaleString("fr-FR");
  document.getElementById("month-kpi-min").textContent = totalMin.toLocaleString("fr-FR");
  document.getElementById("month-kpi-max").textContent = totalMax.toLocaleString("fr-FR");
  document.getElementById("month-kpi-peaks").textContent = peakCount.toLocaleString("fr-FR");
  document.getElementById("month-kpi-peaks-sub").textContent = `${peakCount} référence(s) en tension ce mois-ci`;
}

function renderMonthChart(m) {
  const ctx = document.getElementById("month-stock-chart").getContext("2d");
  const products = Array.from(HectorState.products.values());

  // Top 10 articles classés par volume de stock Min
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
          label: 'Stock MAX (Cible)',
          data: dataMax,
          backgroundColor: 'rgba(37, 99, 235, 0.85)',
          borderRadius: 4
        },
        {
          label: 'Stock MIN (Alerte)',
          data: dataMin,
          backgroundColor: 'rgba(220, 38, 38, 0.85)',
          borderRadius: 4
        },
        {
          label: 'Demande Prévue',
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

    tr.innerHTML = `
      <td><strong>${r.sku}</strong></td>
      <td>${phaseHtml}</td>
      <td>${r.demand.toLocaleString("fr-FR")}</td>
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
// 6. Données de Démonstration & Modèles
// ==========================================================================
function loadDemoData() {
  HectorState.products.clear();

  HectorState.products.set("Crème Solaire SPF50 200ml", {
    sku: "Crème Solaire SPF50 200ml",
    monthlyDemand: [45, 60, 110, 280, 750, 1420, 1850, 1600, 420, 130, 50, 40]
  });

  HectorState.products.set("Boîte Chocolats Prestige 500g", {
    sku: "Boîte Chocolats Prestige 500g",
    monthlyDemand: [80, 95, 120, 140, 90, 75, 60, 70, 110, 310, 1250, 2100]
  });

  HectorState.products.set("Vis Inox A4 M6x25 (Boîte 100)", {
    sku: "Vis Inox A4 M6x25 (Boîte 100)",
    monthlyDemand: [420, 450, 460, 430, 470, 440, 390, 310, 480, 490, 460, 410]
  });

  HectorState.products.set("Cahier Spirale Grand Format 96p", {
    sku: "Cahier Spirale Grand Format 96p",
    monthlyDemand: [150, 140, 160, 180, 210, 450, 1100, 2400, 1850, 320, 190, 160]
  });

  setFileStatus("✓ Jeu de démonstration chargé avec succès (accents et formats validés) !");
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
      "Référence Produit", "Classification", "Mois", "Demande Prévue", 
      "Coeff. Saison (CS)", "Demande sur Délai L", "Stock Sécurité (SS)", 
      "Stock MIN (Alerte)", "Stock MAX (Plafond)", "Lot Réassort"
    ]
  ];

  HectorState.products.forEach(p => {
    p.calculations.forEach(c => {
      monthlyRows.push([
        p.sku,
        p.isSeasonal ? "Saisonnier" : "Stable",
        c.monthName,
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
    "Référence Produit;Classification;Mois;Demande Prévue;Coeff Saison;Demande Délai;Stock Sécurité;Stock MIN;Stock MAX;Lot Réassort"
  ];

  HectorState.products.forEach(p => {
    p.calculations.forEach(c => {
      lines.push([
        `"${p.sku.replace(/"/g, '""')}"`,
        p.isSeasonal ? "Saisonnier" : "Stable",
        c.monthName,
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

  // \uFEFF garantit à Excel sous Windows d'ouvrir immédiatement le CSV en UTF-8 sans altérer les accents
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, "Hector_Stock_Min_Max_Catalogue.csv");
}

function exportSelectedMonthToExcel() {
  if (HectorState.products.size === 0) return;
  const m = HectorState.selectedMonth;
  const monthName = MONTH_NAMES[m];

  const rows = [
    [
      "Référence Produit", "Classification", "Phase Saison", `Demande ${monthName}`,
      "Coeff. Saison (CS)", "Demande sur Délai L", "Stock Sécurité (SS)", 
      "Stock MIN (Alerte)", "Stock MAX (Plafond)", "Lot Réassort"
    ]
  ];

  HectorState.products.forEach(p => {
    const c = p.calculations[m];
    rows.push([
      p.sku,
      p.isSeasonal ? "Saisonnier" : "Stable",
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
    `Référence Produit;Classification;Phase Saison;Demande ${monthName};Coeff Saison;Demande Délai;Stock Sécurité;Stock MIN;Stock MAX;Lot Réassort`
  ];

  HectorState.products.forEach(p => {
    const c = p.calculations[m];
    lines.push([
      `"${p.sku.replace(/"/g, '""')}"`,
      p.isSeasonal ? "Saisonnier" : "Stable",
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
