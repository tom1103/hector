/**
 * HECTOR — Optimiseur de Stock Min/Max Saisonnier
 * Moteur de calcul Supply Chain & Interface Utilisateur
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
  chartInstance: null,
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
  initSearch();
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
  // Bouton démo
  document.getElementById("btn-demo").addEventListener("click", loadDemoData);

  // Bouton téléchargement du modèle
  document.getElementById("btn-download-template").addEventListener("click", downloadExcelTemplate);

  // Sélecteur de produit
  document.getElementById("product-select").addEventListener("change", (e) => {
    HectorState.selectedSku = e.target.value;
    renderSelectedProduct();
  });

  // Exports
  document.getElementById("btn-export-excel").addEventListener("click", exportResultsToExcel);
  document.getElementById("btn-export-csv").addEventListener("click", exportResultsToCSV);
}

function initSearch() {
  const searchInput = document.getElementById("catalog-search");
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    filterSummaryTable(query);
  });
}

// ==========================================================================
// 2. Gestion de l'Upload et Drag & Drop
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

// ==========================================================================
// 3. Analyse et Parsing Multi-Fichiers S?curis? (100% dans le Navigateur)
// ==========================================================================
async function handleUploadedFiles(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;

  setFileStatus(`Lecture de ${files.length} fichier(s) en cours...`);
  updateParamsFromUI();
  HectorState.products.clear();

  const tempAgg = new Map(); // sku -> Array(12)
  let filesParsed = 0;
  const errors = [];

  for (const file of files) {
    try {
      const data = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

      if (!rawRows || rawRows.length < 2) continue;

      const fileNameHint = extractMonthFromFileName(file.name);
      processDatasetRows(rawRows, tempAgg, fileNameHint);
      filesParsed++;
    } catch (err) {
      console.error(err);
      errors.push(`${file.name}: ${err.message}`);
    }
  }

  if (tempAgg.size === 0) {
    setFileStatus(`Erreur lors de l'analyse : aucun produit exploitable d?tect?. ${errors.join(', ')}`, true);
    return;
  }

  for (const [sku, monthlyDemand] of tempAgg.entries()) {
    HectorState.products.set(sku, {
      sku: sku,
      monthlyDemand: monthlyDemand
    });
  }

  recalculateAll();
  setFileStatus(`? ${filesParsed} fichier(s) analys?(s) avec succ?s ! ${tempAgg.size} r?f?rences charg?es.`);
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Lecture impossible du fichier"));
    reader.readAsArrayBuffer(file);
  });
}

function extractMonthFromFileName(filename) {
  const name = filename.toLowerCase();
  for (let m = 0; m < 12; m++) {
    if (name.includes(MONTH_NAMES[m].toLowerCase()) || name.includes(MONTH_SHORT[m].toLowerCase())) {
      return m;
    }
  }
  const mMatch = name.match(/month[_-\s]?(\d{1,2})|mois[_-\s]?(\d{1,2})|m(\d{1,2})/);
  if (mMatch) {
    const num = parseInt(mMatch[1] || mMatch[2] || mMatch[3], 10);
    if (num >= 1 && num <= 12) return num - 1;
  }
  return -1;
}

function processDatasetRows(rows, tempAgg, fileNameHint) {
  const headers = rows[0].map(h => String(h || "").trim().toLowerCase());

  // D?tection Format Matrice : 12 colonnes de mois
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
  let prodColIdx = headers.findIndex(h => /prod|art|ref|sku|code|designation|dsignation|nom/i.test(h));
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
  // D?tection colonne produit
  let prodIdx = headers.findIndex(h => /prod|art|ref|sku|code|designation|dsignation|libell/i.test(h));
  if (prodIdx === -1) prodIdx = 0;

  // D?tection colonne quantit? (en ?vitant le Chiffre d'Affaires / Prix / Montant)
  let qtyIdx = headers.findIndex(h => 
    (/qte|qt|quant|vent|sales|volume|demande|nombre/i.test(h)) && 
    !(/ca|chiffre|affaires|prix|montant|total|eur|euro|cost|price/i.test(h))
  );
  if (qtyIdx === -1) {
    // Si pas trouv? par mot-cl? explicite, chercher une colonne num?rique qui n'est pas le CA
    qtyIdx = headers.findIndex(h => /volume|vendu|qte/i.test(h));
    if (qtyIdx === -1) qtyIdx = rows[0].length - 1;
  }

  // D?tection colonne date
  let dateIdx = headers.findIndex(h => /date|mois|month|periode|priode|jour|day/i.test(h));
  if (dateIdx === -1) {
    // Tester sur la ligne 1 si une colonne ressemble ? une date
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
    // Si la colonne date n'a pas donn? de r?sultat mais qu'un indice de fichier existe
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

  // 1. D?tection par nom de mois textuel (Janvier..D?cembre)
  for (let m = 0; m < 12; m++) {
    const full = MONTH_NAMES[m].toLowerCase();
    const short = MONTH_SHORT[m].toLowerCase().substring(0, 3);
    if (str.includes(full) || str.startsWith(short)) {
      return m;
    }
  }

  // 2. D?tection par regex date stricte (JJ/MM/AAAA ou AAAA-MM-JJ ou JJ-MM-AAAA)
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

  // 3. D?tection si c'est un num?ro de mois isol? (1 ? 12 ou 01 ? 12)
  if (/^(0?[1-9]|1[0-2])$/.test(str)) {
    return parseInt(str, 10) - 1;
  }

  // 4. Objet Date natif
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    return rawDate.getMonth();
  }

  // 5. Nombre s?rial Excel (dates entre ~1980 et ~2060 : ~29000 ? 60000)
  if (typeof rawDate === "number" && rawDate >= 29000 && rawDate <= 60000) {
    const jsDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) return jsDate.getUTCMonth();
  }

  // ATTENTION : Ne JAMAIS faire new Date(str) pour des nombres bruts (ex: CA, ID) !
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

  // Mois pic et mois creux
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
    // On projette sur les mois à venir pour capturer la montée vers le pic
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
    // Modélisation robuste : proportionnelle à la racine de la demande (Loi de Poisson/Normale en gestion de stock)
    // Plus la demande est forte, plus la dispersion absolue augmente
    const sigmaDay = Math.sqrt(Math.max(1, dailyDemand * 1.5));

    // Stock de sécurité : SS = Z * sigma_jour * sqrt(L)
    const safetyStock = Math.ceil(Z * sigmaDay * Math.sqrt(L));

    // Seuil Min (Point de commande) = Demande pendant délai + Stock de sécurité
    const stockMin = Math.ceil(leadTimeDemand + safetyStock);

    // Lot de réassort (couverture de la période de revue P)
    const reorderLot = Math.ceil(dailyDemand * P);

    // Seuil Max = Min + Lot de réassort
    const stockMax = stockMin + Math.max(1, reorderLot);

    calculations.push({
      monthIndex: m,
      monthName: MONTH_NAMES[m],
      demand: Math.round(currentMonthDemand),
      seasonalIndex: parseFloat(seasonalIndices[m].toFixed(2)),
      leadTimeDemand: Math.round(leadTimeDemand),
      safetyStock: safetyStock,
      stockMin: stockMin,
      stockMax: stockMax,
      reorderLot: reorderLot
    });
  }

  return {
    ...product,
    annualTotal: Math.round(annualTotal),
    avgMonthly: Math.round(avgMonthly),
    seasonalIndices: seasonalIndices,
    isSeasonal: isSeasonal,
    peakMonth: MONTH_NAMES[peakIdx],
    lowMonth: MONTH_NAMES[lowIdx],
    calculations: calculations
  };
}

function recalculateAll() {
  if (HectorState.products.size === 0) return;

  for (const [sku, prod] of HectorState.products.entries()) {
    const computed = calculateProductStockParameters(prod, HectorState.params);
    HectorState.products.set(sku, computed);
  }

  // Mettre à jour l'article sélectionné
  if (!HectorState.selectedSku || !HectorState.products.has(HectorState.selectedSku)) {
    HectorState.selectedSku = HectorState.products.keys().next().value;
  }

  renderUI();
}

// ==========================================================================
// 5. Rendu Visuel (Interface, Tableau, Graphique Chart.js)
// ==========================================================================
function renderUI() {
  document.getElementById("results-section").style.display = "flex";
  document.getElementById("results-section").style.flexDirection = "column";

  renderKPIs();
  renderProductSelector();
  renderSelectedProduct();
  renderSummaryTable();
}

function renderKPIs() {
  const products = Array.from(HectorState.products.values());
  const totalSkus = products.length;
  const seasonalCount = products.filter(p => p.isSeasonal).length;
  const totalDemand = products.reduce((sum, p) => sum + p.annualTotal, 0);

  // Moyenne des stocks de sécurité de tous les produits
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

  // Badge saisonnalité
  const badge = document.getElementById("product-season-badge");
  if (prod.isSeasonal) {
    badge.textContent = `⚡ Saisonnier (Pic en ${prod.peakMonth})`;
    badge.className = "badge badge-seasonal";
  } else {
    badge.textContent = "◆ Consommation Stable";
    badge.className = "badge badge-stable";
  }

  // Tableau mensuel
  const tbody = document.getElementById("product-monthly-tbody");
  tbody.innerHTML = "";

  prod.calculations.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${row.monthName}</strong></td>
      <td>${row.demand.toLocaleString("fr-FR")}</td>
      <td>${row.seasonalIndex.toFixed(2)}</td>
      <td>${row.leadTimeDemand.toLocaleString("fr-FR")}</td>
      <td>${row.safetyStock.toLocaleString("fr-FR")}</td>
      <td class="col-highlight-min">${row.stockMin.toLocaleString("fr-FR")}</td>
      <td class="col-highlight-max">${row.stockMax.toLocaleString("fr-FR")}</td>
      <td>+${row.reorderLot.toLocaleString("fr-FR")}</td>
    `;
    tbody.appendChild(tr);
  });

  // Graphique
  renderChart(prod);
}

function renderChart(prod) {
  const ctx = document.getElementById("stock-chart").getContext("2d");

  const labels = MONTH_SHORT;
  const maxData = prod.calculations.map(c => c.stockMax);
  const minData = prod.calculations.map(c => c.stockMin);
  const ssData = prod.calculations.map(c => c.safetyStock);
  const demandData = prod.calculations.map(c => c.demand);

  if (HectorState.chartInstance) {
    HectorState.chartInstance.destroy();
  }

  HectorState.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Stock Max (Plafond)',
          data: maxData,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          fill: '+1',
          borderWidth: 2.5,
          tension: 0.3,
          pointRadius: 4
        },
        {
          label: 'Stock Min (Seuil de commande)',
          data: minData,
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.08)',
          fill: '+1',
          borderWidth: 2.5,
          tension: 0.3,
          pointRadius: 4
        },
        {
          label: 'Stock de Sécurité',
          data: ssData,
          borderColor: '#f59e0b',
          borderDash: [5, 4],
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 3
        },
        {
          label: 'Ventes Mensuelles Prévues',
          data: demandData,
          borderColor: '#94a3b8',
          borderWidth: 1.5,
          borderDash: [2, 2],
          tension: 0.2,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: 'Inter', weight: 'bold' },
          bodyFont: { family: 'Inter' },
          padding: 10,
          cornerRadius: 6
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#e2e8f0' },
          ticks: { font: { family: 'JetBrains Mono' } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', weight: '600' } }
        }
      }
    }
  });
}

function renderSummaryTable() {
  const tbody = document.getElementById("all-products-tbody");
  tbody.innerHTML = "";

  HectorState.products.forEach(prod => {
    const mins = prod.calculations.map(c => c.stockMin);
    const maxs = prod.calculations.map(c => c.stockMax);
    const minLow = Math.min(...mins);
    const minHigh = Math.max(...mins);
    const maxLow = Math.min(...maxs);
    const maxHigh = Math.max(...maxs);

    const tr = document.createElement("tr");
    tr.setAttribute("data-sku", prod.sku.toLowerCase());
    tr.innerHTML = `
      <td><strong>${prod.sku}</strong></td>
      <td>${prod.isSeasonal ? '<span class="badge badge-seasonal">Saisonnier</span>' : '<span class="badge badge-stable">Stable</span>'}</td>
      <td>${prod.annualTotal.toLocaleString("fr-FR")}</td>
      <td>${prod.peakMonth}</td>
      <td>${minLow.toLocaleString("fr-FR")}</td>
      <td class="col-highlight-min">${minHigh.toLocaleString("fr-FR")}</td>
      <td>${maxLow.toLocaleString("fr-FR")}</td>
      <td class="col-highlight-max">${maxHigh.toLocaleString("fr-FR")}</td>
    `;
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      HectorState.selectedSku = prod.sku;
      document.getElementById("product-select").value = prod.sku;
      renderSelectedProduct();
      window.scrollTo({ top: document.querySelector(".detail-container").offsetTop - 80, behavior: 'smooth' });
    });
    tbody.appendChild(tr);
  });
}

function filterSummaryTable(query) {
  const rows = document.querySelectorAll("#all-products-tbody tr");
  rows.forEach(r => {
    const sku = r.getAttribute("data-sku") || "";
    r.style.display = sku.includes(query) ? "" : "none";
  });
}

// ==========================================================================
// 6. Données de Démonstration & Modèles
// ==========================================================================
function loadDemoData() {
  HectorState.products.clear();

  // 1. Produit très saisonnier été
  HectorState.products.set("Crème Solaire SPF50 200ml", {
    sku: "Crème Solaire SPF50 200ml",
    monthlyDemand: [45, 60, 110, 280, 750, 1420, 1850, 1600, 420, 130, 50, 40]
  });

  // 2. Produit très saisonnier hiver / fin d'année
  HectorState.products.set("Boîte Chocolats Prestige 500g", {
    sku: "Boîte Chocolats Prestige 500g",
    monthlyDemand: [80, 95, 120, 140, 90, 75, 60, 70, 110, 310, 1250, 2100]
  });

  // 3. Produit régulier / quincaillerie industrielle (non-saisonnier)
  HectorState.products.set("Vis Inox A4 M6x25 (Boîte 100)", {
    sku: "Vis Inox A4 M6x25 (Boîte 100)",
    monthlyDemand: [420, 450, 460, 430, 470, 440, 390, 310, 480, 490, 460, 410]
  });

  // 4. Produit rentrée scolaire
  HectorState.products.set("Cahier Spirale Grand Format 96p", {
    sku: "Cahier Spirale Grand Format 96p",
    monthlyDemand: [150, 140, 160, 180, 210, 450, 1100, 2400, 1850, 320, 190, 160]
  });

  setFileStatus("✓ Jeu de données de démonstration chargé avec succès !");
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
// 7. Exportations (Excel & CSV)
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

  const summaryRows = [
    [
      "Référence Produit", "Classification", "Ventes Annuelles", 
      "Mois Pic", "Mois Creux", "Min Basse Saison", "Min Haute Saison", 
      "Max Basse Saison", "Max Haute Saison"
    ]
  ];

  HectorState.products.forEach(p => {
    const mins = p.calculations.map(c => c.stockMin);
    const maxs = p.calculations.map(c => c.stockMax);
    summaryRows.push([
      p.sku,
      p.isSeasonal ? "Saisonnier" : "Stable",
      p.annualTotal,
      p.peakMonth,
      p.lowMonth,
      Math.min(...mins),
      Math.max(...mins),
      Math.min(...maxs),
      Math.max(...maxs)
    ]);
  });

  const wb = XLSX.utils.book_new();
  const wsMonthly = XLSX.utils.aoa_to_sheet(monthlyRows);
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);

  XLSX.utils.book_append_sheet(wb, wsSummary, "Synthese_Catalogue");
  XLSX.utils.book_append_sheet(wb, wsMonthly, "Seuils_Min_Max_Mensuels");

  XLSX.writeFile(wb, `Hector_Seuils_Min_Max_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportResultsToCSV() {
  if (HectorState.products.size === 0) return;

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Reference;Classification;Mois;Demande;Coeff_Saison;Demande_Delai_L;Stock_Securite;Stock_MIN;Stock_MAX;Lot_Reassort\n";

  HectorState.products.forEach(p => {
    p.calculations.forEach(c => {
      const row = [
        `"${p.sku}"`,
        p.isSeasonal ? "Saisonnier" : "Stable",
        c.monthName,
        c.demand,
        c.seasonalIndex,
        c.leadTimeDemand,
        c.safetyStock,
        c.stockMin,
        c.stockMax,
        c.reorderLot
      ].join(";");
      csvContent += row + "\n";
    });
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Hector_Seuils_Min_Max_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
