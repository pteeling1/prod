// ====================================================================
// 🚫 FEATURE FLAG: 17G SUPPORT (AX 670 & AX 770)
// Set to false to disable 17G features until March 17, 2026
// ====================================================================
const ENABLE_17G = false;

// === Imports ===
import { cpuList as cpuDataOld } from './cpuData.js';
import { cpuList as cpuDataNew } from './17GcpuData.js';
import {
  updateNodeImage,
  updateDiskLimits,
  updateStorage
} from './uihandlers.js';
import { calculateUsableStorage } from './calculateUsableStorage.js';
import { getMaxMemoryPerNode, getValidDiskSizes } from './hardwareConfig.js';
import { drawStorageChart } from './charts.js';
import { drawConnections, initializeVisuals, updateLegend, updateNodeStack } from './visuals-debug.js';
import { setupPDFExport } from './pdfexporter.js';
import { getSizingPayloadFromHTML, sizeCluster } from './sizingEngine.js';
import { renderRelativeFillBarChart } from "./barchart.js";
import {exportToPowerPoint} from './exportToPowerPoint.js';
import { setupPPTXExport } from "./pptxExporter.js";
import { setupPPTXExportLight } from "./pptxExporterLight.js";
import { logger } from './logger.js';

// ✅ Dynamic CPU list selection based on node type
let cpuList = cpuDataOld; // Default to old CPU data

function getCpuListForNodeType(nodeType) {
  if (nodeType === "AX 670" || nodeType === "AX 770") {
    return cpuDataNew;
  }
  if (nodeType === "AX-4510c" || nodeType === "AX-4520c") {
    // Return Ice Lake D CPUs from cpuDataOld (they were just added)
    return cpuDataOld.filter(cpu => cpu.model.includes("Xeon D-"));
  }
  return cpuDataOld;
}

// 🧮 Get socket count based on chassis model
function getSocketCountForChassis(chassisModel) {
  // AX-4510c and AX-4520c are single-socket
  if (chassisModel === "AX-4510c" || chassisModel === "AX-4520c") {
    return 1;
  }
  // All other models are dual-socket
  return 2;
}

setupPDFExport();

// ✅ Make visual functions globally accessible for the exporter
window.initializeVisuals = initializeVisuals;
window.updateNodeStack = updateNodeStack;
window.drawConnections = drawConnections;

// ✅ PowerPoint theme selector wrapper
function setupPPTXExportWrapper() {
  const themeSelector = document.getElementById("pptxTheme");
  const selectedTheme = themeSelector?.value || "dark";
  
  if (selectedTheme === "light") {
    setupPPTXExportLight({ buttonId: "exportPPTX" });
  } else {
    setupPPTXExport({ buttonId: "exportPPTX" });
  }
}

// ✅ Enhanced visual refresh function for manual UI changes
function refreshAllVisuals() {
  try {
    
    
    // Force re-initialization
    if (typeof initializeVisuals === "function") {
      initializeVisuals();
    }
    
    // Update the node display
    if (typeof updateNodeStack === "function") {
      updateNodeStack();
    }
    
    // Redraw connections
    if (typeof drawConnections === "function") {
      drawConnections();
    }
    
    // Update legend if needed
    if (typeof updateLegend === "function") {
      updateLegend();
    }
    
    
  } catch (error) {
    console.warn("⚠️ Visual refresh encountered issues:", error);
  }
}

window.openAboutModal = function () {
  // Wait until DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => loadAboutContent());
  } else {
    loadAboutContent();
  }
};

// Expose helper to enable config controls and diagnostic globally
 

function loadAboutContent() {
  const modalBody = document.getElementById("aboutModalBody");
  if (!modalBody) {
    console.error("❌ aboutModalBody not found in DOM");
    return;
  }

  fetch("about.html")
    .then(response => response.text())
    .then(html => {
      modalBody.innerHTML = html;
      const modal = new bootstrap.Modal(document.getElementById("aboutModal"));
      modal.show();
    })
    .catch(error => {
      console.error("❌ Failed to load about.html:", error);
      modalBody.innerHTML = "<p>Unable to load About content.</p>";
      const modal = new bootstrap.Modal(document.getElementById("aboutModal"));
      modal.show();
    });
}

document.addEventListener("DOMContentLoaded", () => {
  // === Element references ===
  const nodeSlider = document.getElementById("nodeSlider");
  const nodeValueDisplay = document.getElementById("nodeValue");
  const nodeWarning = document.getElementById("nodeWarning");

nodeSlider.addEventListener("input", () => {
  const val = parseInt(nodeSlider.value, 10);
  nodeValueDisplay.textContent = val;
  nodeWarning.style.display = val > 7 ? "block" : "none";
});
  const diskSlider = document.getElementById("disks");
  const diskValueDisplay = document.getElementById("diskValue");
  const diskSizeSelect = document.getElementById("diskSize");
  const cpuSelect = document.getElementById("cpuChoice");
  const memorySelect = document.getElementById("memorySize");
  const resiliencySelect = document.getElementById("resiliency");
  const nodeTypeRadios = document.querySelectorAll('input[name="nodeType"]');
  const outputContainer = document.getElementById("output");
  const cableLegendEl = document.getElementById("cableLegend");
const cpuUnitSelect = document.getElementById("cpuUnit");
const coreInputWrapper = document.getElementById("coreInputWrapper");
const ghzInputWrapper = document.getElementById("ghzInputWrapper");
  const memoryOptions = [64, 128, 192, 256, 384, 512, 768, 1024, 1152, 1536, 2048, 3072, 4096, 6144, 8192];
  const diskSizesTB = [0.96, 1.92, 3.84, 7.68, 15.36];

  const switchModePanel = document.getElementById("switchModePanel");
  const switchModeHeader = switchModePanel?.querySelector(".card-title");
  const separateLabel = document.querySelector("label[for='separate']");
  const sharedLabel = document.querySelector("label[for='shared']");
  const separateRadio = document.getElementById("separate");
  const sharedRadio = document.getElementById("shared");
const toggleVisualsBtn = document.getElementById("toggleVisualsBtn");
const visualsSection = document.getElementById("visuals");

toggleVisualsBtn.addEventListener("click", () => {
  const isHidden = visualsSection.classList.contains("d-none");
  visualsSection.classList.toggle("d-none");
  toggleVisualsBtn.textContent = isHidden ? "Hide Visuals" : "Show Visuals";
  if (isHidden) {
    refreshAllVisuals();
  }
});
  const relativeFillBarChart = document.getElementById("relativeFillBarChart");
relativeFillBarChart.style.display = "none";

const addBtn = document.getElementById("addWorkloadBtn");
  if (addBtn) {
    addBtn.addEventListener("click", addWorkloadRow);

  }
const workloadList = document.getElementById("workloadList");
  if (workloadList) {
    workloadList.addEventListener("click", (e) => {
      if (e.target.matches(".btn-outline-danger")) {
        const card = e.target.closest(".workload-row");
        if (card) card.remove();
      }
    });
  }

  let isManualOverride = false;
  let isSyncingConfig = false;
  cpuUnitSelect?.addEventListener("change", () => {
  const unit = cpuUnitSelect.value;
  if (unit === "ghz") {
    coreInputWrapper?.classList.add("d-none");
    ghzInputWrapper?.classList.remove("d-none");
  } else {
    coreInputWrapper?.classList.remove("d-none");
    ghzInputWrapper?.classList.add("d-none");
  }
});

  function updateCpuOptions() {
    const nodeType = getSelectedNodeType();
    cpuList = getCpuListForNodeType(nodeType);

    if (!cpuSelect) return;
    const prevSelected = cpuSelect.value;

    cpuSelect.innerHTML = "";
    cpuList.forEach(cpu => {
      const option = document.createElement("option");
      option.value = cpu.model;
      option.textContent = `${cpu.model} — ${cpu.cores} cores @ ${cpu.base_clock_GHz} GHz`;
      cpuSelect.appendChild(option);
    });

    // Prefer previously selected CPU if still available
    if (prevSelected && cpuList.some(c => c.model === prevSelected)) {
      cpuSelect.value = prevSelected;
      return;
    }

    // Next prefer CPU selected by the last sizing result
    const lastCpuModel = window.lastSizingResult?.cpuModel;
    if (lastCpuModel && cpuList.some(c => c.model === lastCpuModel)) {
      cpuSelect.value = lastCpuModel;
      return;
    }

    // Fallback to the first available CPU
    cpuSelect.value = cpuList[0]?.model;
  }

  function updateMemoryOptions() {
    const nodeType = getSelectedNodeType();
    const maxMemory = getMaxMemoryPerNode(nodeType);
    
    // Filter memory options to only show those within the chassis limit
    const validMemoryOptions = memoryOptions.filter(size => size <= maxMemory);
    
    memorySelect.innerHTML = "";
    validMemoryOptions.forEach(size => {
      const option = document.createElement("option");
      option.value = size;
      option.textContent = `${size} GB`;
      memorySelect.appendChild(option);
    });
    
    // Set default value to largest available option or 512
    const defaultValue = Math.min(512, validMemoryOptions[validMemoryOptions.length - 1] || 512);
    memorySelect.value = defaultValue;
  }

  function updateDiskSizeOptions() {
    const nodeType = getSelectedNodeType();
    const validDiskSizes = getValidDiskSizes(nodeType);
    
    diskSizeSelect.innerHTML = "";
    validDiskSizes.forEach(size => {
      const option = document.createElement("option");
      option.value = size;
      option.textContent = `${size} TB`;
      diskSizeSelect.appendChild(option);
    });
    
    // Set default value to 3.84 TB if available, otherwise largest available
    const defaultValue = validDiskSizes.includes(3.84) ? 3.84 : validDiskSizes[validDiskSizes.length - 1] || 3.84;
    diskSizeSelect.value = defaultValue;
  }

function renderWorkloadSummary(payload) {
  const container = document.getElementById("workloadSummaryContent");
  const workloads = payload.workloads || [];

  const totalVMs = workloads.reduce((sum, w) => sum + w.vmsNeeded, 0);
  const totalvCPUs = workloads.reduce((sum, w) => sum + w.totalVcpu, 0);
  const physicalCores = Math.ceil(totalvCPUs / 2);
  const totalRAM = workloads.reduce((sum, w) => sum + w.totalMemory, 0);
  const totalDiskGB = workloads.reduce((sum, w) => sum + w.totalDisk, 0);

  let html = `
    <div class="row">
      <div class="col-md-6">
        <ul class="mb-0">
          <li><strong>Total VMs:</strong> ${totalVMs}</li>
          <li><strong>Total vCPUs:</strong> ${totalvCPUs}</li>
          <li><strong>Physical Cores (2:1 ratio):</strong> ${physicalCores}</li>
        </ul>
      </div>
      <div class="col-md-6">
        <ul class="mb-0">
          <li><strong>Total Memory:</strong> ${totalRAM} GB</li>
          <li><strong>Total Storage:</strong> ${(totalDiskGB / 1024).toFixed(2)} TB</li>
        </ul>
      </div>
    </div>

    <table class="table table-sm table-bordered mt-3">
      <thead class="table-light">
        <tr>
          <th>Workload</th>
          <th>Type</th>
          <th>VMs</th>
          <th>vCPUs</th>
          <th>vCPU/VM</th>
          <th>Memory (GB)</th>
          <th>Memory/VM (GB)</th>
          <th>Storage</th>
          <th>Storage/VM (GB)</th>
        </tr>
      </thead>
      <tbody>
  `;

  workloads.forEach(w => {
    const storageDisplay = w.totalDisk >= 1024
      ? `${(w.totalDisk / 1024).toFixed(2)} TB`
      : `${w.totalDisk} GB`;

    html += `
      <tr>
        <td>${w.name}</td>
        <td>${w.type}</td>
        <td>${w.vmsNeeded}</td>
        <td>${w.totalVcpu}</td>
        <td>${w.vcpuPerVM}</td>
        <td>${w.totalMemory}</td>
        <td>${w.memoryPerVM}</td>
        <td>${storageDisplay}</td>
        <td>${w.storagePerVM}</td>
      </tr>
    `;
  });

  const totalStorageDisplay = totalDiskGB >= 1024
    ? `${(totalDiskGB / 1024).toFixed(2)} TB`
    : `${totalDiskGB} GB`;

  html += `
      </tbody>
      <tfoot>
        <tr class="fw-bold">
          <td colspan="2">Totals</td>
          <td>${totalVMs}</td>
          <td>${totalvCPUs}</td>
          <td>-</td>
          <td>${totalRAM} GB</td>
          <td>-</td>
          <td>${totalStorageDisplay}</td>
          <td>-</td>
        </tr>
      </tfoot>
    </table>
  `;

  container.innerHTML = html;
}

  function getSelectedNodeType() {
    return document.querySelector('input[name="nodeType"]:checked')?.value || "AX 770";
  }

  function updateResiliencyOptionsBasedOnNodes(nodes) {
    resiliencySelect.innerHTML = "";
    if (nodes < 3) {
      resiliencySelect.innerHTML = `<option value="2-way">2-way</option>`;
      resiliencySelect.value = "2-way";
    } else {
      resiliencySelect.innerHTML = `
        <option value="2-way">2-way</option>
        <option value="3-way">3-way</option>`;
      resiliencySelect.value = "3-way";
    }
  }
    function calculateCableSummary(nodeCount) {
    const connectionType = document.querySelector('input[name="connectiontype"]:checked')?.value || "Twinax";
    const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value || "Standard";
    const switchMode = document.querySelector('input[name="switchMode"]:checked')?.value || "separate";

    let label = connectionType;
    let count = 0;
    const emoji = connectionType === "Twinax" ? "🟦" : "🟥";
    const isSFP = connectionType === "SFP";

    if (clusterType === "Switchless") {
      const pairs = (nodeCount * (nodeCount - 1)) / 2;
      const uplinkCables = nodeCount * (isSFP ? 4 : 2);
      const peerCables = pairs * (switchMode === "separate" ? 2 : 1) * (isSFP ? 2 : 1);
      count = uplinkCables + peerCables;
    } else {
      const isConverged = clusterType === "Converged";
      count = isSFP
        ? isConverged ? nodeCount * 4 : nodeCount * 8
        : isConverged ? nodeCount * 2 : nodeCount * 4;
    }

    const summary = `${emoji} ${label} Required: ${count}`;
    return { label, count, summary };
  }

  function calculateTotals() {
  if (isSyncingConfig) return; // ✅ Prevent recursion

  if (!isManualOverride && window.lastSizingResult) {
    isSyncingConfig = true;
    syncConfigUI(window.lastSizingResult);
    isSyncingConfig = false;
    return;
  }

  // ✅ Manual override mode – recalculate and update output
  const nodes = parseInt(nodeSlider.value, 10);
  const disksPerNode = parseInt(diskSlider.value, 10);
  const diskSizeTB = parseFloat(diskSizeSelect.value);
  const resiliency = resiliencySelect.value;
  const nodeType = getSelectedNodeType();
  cpuList = getCpuListForNodeType(nodeType); // ✅ Update CPU list based on node type
  const memorySize = parseInt(memorySelect.value, 10);
  const cpuModel = cpuSelect.value;
  const cpu = cpuList.find(c => c.model === cpuModel);

  const socketCount = getSocketCountForChassis(nodeType);
  const totalCores = cpu ? cpu.cores * nodes * socketCount : "N/A";
  const totalGHzRaw = cpu ? (cpu.base_clock_GHz * totalCores) : 0;
  const totalGHz = Number.isFinite(totalGHzRaw) ? Math.round(totalGHzRaw) : totalGHzRaw;
const totalUsableCores = totalCores - 4;
  const results = calculateUsableStorage(nodes, disksPerNode, diskSizeTB, resiliency);
const totalMemoryGB = memorySize * nodes;
const totalUsableMemory = Math.round(totalMemoryGB * 0.96);
 window.lastSizingResult = {
  ...results,
  nodeCount: nodes,
  disksPerNode,
  diskSizeTB,
  storageResiliency: resiliency,
  memorySizeGB: memorySize,
  memoryConfig: memorySize,
  cpuModel,
  totalCores,
  totalGHz,
  totalMemoryGB: memorySize * nodes,
  cpuCoresPerSocket: cpu?.cores || "N/A",
  cpuClockGHz: cpu?.base_clock_GHz || "N/A",
  chassisModel: nodeType,
  clusterCount: 1,
  clusterSizes: [nodes],
  isManualMode: true,
  totalUsableCores,
  totalUsableMemory
};

  // ✅ Only overwrite output in manual mode
  outputContainer.innerHTML = `
    <strong>Total Machines:</strong> ${nodes}<br>
    <strong>Total Cores:</strong> ${totalCores}<br>
    <strong>Total GHz:</strong> ${totalGHz} GHz<br>
    <strong>Total Memory:</strong> ${memorySize * nodes} GB<br>
    <strong>Raw Storage:</strong> ${results.rawTB} TB<br>
    <strong>Usable Storage:</strong> ${results.usableTB} TB <strong>(${results.usableTiB} TiB)</strong><br>
    <strong>Resiliency Overhead:</strong> ${results.resiliencyTB} TB
  `;

  drawStorageChart(
    parseFloat(results.usableTiB),
    parseFloat(results.reserveTiB),
    parseFloat(results.resiliencyTiB)
  );

  const cableInfo = calculateCableSummary(nodes);
  if (cableLegendEl) cableLegendEl.textContent = cableInfo.summary;
  window.cableSummaryText = cableInfo.summary;
  window.cableCount = cableInfo.count;
  window.cableLabel = cableInfo.label;
}
function renderRequirementsSummary({ totalCPU, totalGHz, totalRAM, totalStorage, growthPct, haLevel }) {
  const reqBox = document.getElementById("requirementsSummary");
  reqBox.classList.remove("text-muted");
reqBox.classList.add("alert-info");
  const isGHzMode = totalCPU === 0 && totalGHz > 0;
  const cpuText = isGHzMode ? `${totalGHz} GHz` : `${totalCPU} cores`;

  reqBox.innerHTML = `
    <h5> Requirements provided</h5> 
    <ul class="list-unstyled mb-0"><br>
    <li><strong>CPU:</strong> ${cpuText.toLocaleString()}</li>
    <li><strong>RAM:</strong> ${totalRAM.toLocaleString()} GB</li>
    <li><strong>Storage:</strong> ${parseFloat(totalStorage).toFixed(2).toLocaleString()} TiB</li>
    <li><strong>Growth:</strong> ${(growthPct * 100).toFixed(1)}%</li>
    <li><strong>Resiliency:</strong> ${haLevel.toUpperCase()}</li>
    </ul>
  `;
}
const sizingDetails = document.getElementById("sizingDetails");
sizingDetails.classList.add("alert", "alert-info");

function updateSwitchModeUI() {
    const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value || "Standard";
    const nodeCount = parseInt(nodeSlider.value, 10);
    if (!switchModePanel || !switchModeHeader) return;

    const sharedWrapper = sharedRadio?.closest(".form-check");

    if (clusterType === "Switchless") {
      switchModeHeader.innerHTML = `<i class="bi bi-link"></i> Link Configuration`;
      if (separateLabel) separateLabel.textContent = "Dual Link";
      if (sharedLabel) sharedLabel.textContent = "Single Link";

      if (nodeCount === 1) {
        switchModePanel.classList.add("d-none");
      } else {
        switchModePanel.classList.remove("d-none");
        if (sharedWrapper) sharedWrapper.style.display = nodeCount === 2 ? "none" : "block";
        separateRadio.checked = true;
      }
    } else {
      switchModePanel.classList.remove("d-none");
      switchModeHeader.innerHTML = `<i class="bi bi-toggle2-on"></i> Switch Mode`;
      if (separateLabel) separateLabel.textContent = "Separate";
      if (sharedLabel) sharedLabel.textContent = "Shared";
      if (sharedWrapper) sharedWrapper.style.display = "block";
    }
  }
function syncConfigUI(result) {
  isSyncingConfig = true;
const firstInstanceSize = result.clusterSummaries?.[0]?.nodeCount ?? result.nodeCount;

nodeSlider.value = firstInstanceSize;
nodeValueDisplay.textContent = firstInstanceSize;
  diskSlider.value = result.disksPerNode;
  diskValueDisplay.textContent = result.disksPerNode;

  // Disk size mapping
  const diskSizeKey = result.diskSizeTB.toFixed(2);
  const diskSizeMap = {
    "0.96": "960 GB",
    "1.92": "1.92 TB",
    "3.84": "3.84 TB",
    "7.68": "7.68 TB",
    "15.36": "15.36 TB"
  };
  const diskSizeText = diskSizeMap[diskSizeKey];
  const matchingOption = Array.from(diskSizeSelect.options).find(opt =>
    opt.textContent.trim() === diskSizeText
  );
  if (matchingOption) matchingOption.selected = true;

  memorySelect.value = result.memorySizeGB;
  cpuSelect.value = result.cpuModel;

  updateResiliencyOptionsBasedOnNodes(result.nodeCount);
  resiliencySelect.value = result.storageResiliency;

  updateStorage();
  updateLegend();

  isSyncingConfig = false;
}
function renderInstanceSummaryBlock({
  name,
  nodeCount,
  reservedNodes,
  usableCores,
  usableGHz,
  usableMemoryGB,
  usableTiB,
  resiliency,
  switchMode,
  clusterType, 
  postFailureCapabilities

}) {
  logger.info(`Rendering ${name}: clusterType = ${clusterType}`);

  const container = document.getElementById("clusterSummaryContainer");
  if (!container) return;
  
  const normalizedType = clusterType?.toLowerCase();
  const switchports = nodeCount * (normalizedType === "converged" ? 2 : 4);

  const block = document.createElement("div");
  block.className = "cluster-summary-block alert alert-info";
  block.innerHTML = `
  <h5>${name} (${nodeCount} machines)</h5>
  <ul class="list-unstyled mb-0">
    <li><strong>CPU:</strong> ${usableCores} cores / ${usableGHz.toFixed(1)} GHz</li>
    <li><strong>RAM:</strong> ${usableMemoryGB.toLocaleString()} GB</li>
    <li><strong>Storage:</strong> ${usableTiB.toFixed(2)} TiB usable</li>
    <li><strong>Resiliency:</strong> ${resiliency}</li>
    <li><strong>Instance Type:</strong> ${clusterType}</li>
    <li><strong>Switchports Required:</strong> ${nodeCount * (clusterType?.toLowerCase() === "converged" ? 2 : 4)}</li>
  </ul>
  <hr>
    <h6>Post-Failure Capacity</h6>
    <ul class="list-unstyled mb-0">
      <li><strong>Active Machines:</strong> ${postFailureCapabilities.activeNodes}</li>
      <li><strong>CPU:</strong> ${postFailureCapabilities.usableCores.toLocaleString()} cores / ${postFailureCapabilities.usableGHz.toFixed(1)} GHz</li>
      <li><strong>RAM:</strong> ${postFailureCapabilities.usableMemoryGB.toLocaleString()} GB</li>
      <li><strong>Storage:</strong> ${usableTiB.toFixed(2)} TiB usable</li>
    </ul>
`;
  container.appendChild(block);
}

function getSwitchModeForCluster(index) {
  // Placeholder logic â€" refine as needed
  return "Converged";
}

function runSizing() {
  logger.debug("🔍 runSizing was called");

  try {
    const sizingPayload = getSizingPayloadFromHTML();
    window.originalRequirements = sizingPayload;
    window.requirementslocked = true;
    logger.info("Captured requirements:", JSON.stringify(sizingPayload, null, 2));
    logger.info("⚙️ Sizing engine triggered with:", sizingPayload);
if (!sizingPayload) {
    logger.warn("🚫 runSizing triggered without payload - skipping");
    return;
  }

    const result = sizeCluster(sizingPayload);
    const switchlessRadio = document.getElementById("switchless");
const switchlessWrapper = switchlessRadio?.closest(".form-check");

if (switchlessWrapper) {
  if (result.nodeCount > 4) {
    switchlessWrapper.style.display = "none";
    if (switchlessRadio.checked) {
      document.getElementById("converged").checked = true;
    }
  } else {
    switchlessWrapper.style.display = "block";
    if (result.nodeCount === 1) {
      switchlessRadio.checked = true;
    }
  }
}
    const cleanResult = {
      ...result,
      isManualMode: false
    };

    window.lastSizingResult = cleanResult;
    isManualOverride = false;

    logger.info("âœ… Final result for export:", JSON.stringify(window.lastSizingResult, null, 2));

    renderRequirementsSummary(sizingPayload);
    syncConfigUI(result);
if (window.originalRequirements) {
  window.originalRequirements.totalCPU = window.originalRequirements.totalCPU ?? window.originalRequirements.totalCores;
  window.originalRequirements.totalRAM = window.originalRequirements.totalRAM ?? window.originalRequirements.totalMemoryGB;
  window.originalRequirements.totalStorage = window.originalRequirements.totalStorage ?? window.originalRequirements.usableTiB;
}

    renderRelativeFillBarChart(window.originalRequirements, result);
    document.getElementById("relativeFillBarChart").style.display = "block";
    document.getElementById("sizingDetails").classList.remove("d-none");

    setupPPTXExportWrapper();

    if (!result) {
      outputContainer.textContent = "No valid configuration found for the given requirements.";
      return;
    }

    const clusterSummary = result.clusterSizes.map(size => `${size} machines`).join(" + ");
    const selectedType = document.querySelector('input[name="clusterType"]:checked')?.value;

    const container = document.getElementById("clusterSummaryContainer");
    if (container) container.innerHTML = "";

    result.clusterSummaries.forEach((summary, index) => {
  const clusterName = `Instance ${String.fromCharCode(65 + index)}`;

  renderInstanceSummaryBlock({
    ...summary,
    name: clusterName,
    clusterType: selectedType,
    switchMode: getSwitchModeForCluster(index),
    postFailureCapabilities: summary.postFailure 
  });
});

renderInstanceSummaryBlock({
  name: "Total Capacity (Aggregate)",
  nodeCount: result.totalClusterResources.normal.nodes,
  usableCores: result.totalClusterResources.normal.usableCores,
  usableGHz: result.totalClusterResources.normal.usableGHz,
  usableMemoryGB: result.totalClusterResources.normal.usableMemoryGB,
  usableTiB: result.usableTiB,
  resiliency: result.storageResiliency,
  switchMode: "Mixed",
  clusterType: "Aggregate",
  postFailureCapabilities: result.totalClusterResources.postFailure
});

    outputContainer.innerHTML = `
      <h5>${result.nodeCount} machines recommendation calculated</h5><br>
      <ul class="list-unstyled mb-0">
      <li><strong>Instances:</strong> ${result.clusterCount} total • ${clusterSummary}</li> 
      <li><strong>Chassis:</strong> ${result.chassisModel} </li>
      <li><strong>CPU:</strong> ${result.cpuModel} • ${result.cpuCoresPerSocket} core, ${result.cpuClockGHz} GHz</li>
      <li><strong>Total Cores: </strong>${result.totalCores.toLocaleString()}</li>
      <li><strong>Memory:</strong> ${result.memorySizeGB.toLocaleString()} GB per node • ${result.totalMemoryGB.toLocaleString()} GB total</li>
      <li><strong>Disks:</strong> ${result.disksPerNode} × ${result.diskSizeTB} TB</li>
      <li><strong> Storage Resiliency:</strong> ${result.storageResiliency}</li>
      <li><strong>Usable Storage:</strong> ${parseFloat(result.usableTiB).toFixed(2).toLocaleString()} TiB</li>
      </ul>
      ${result.disconnectedOps && result.disconnectedOps.enabled ? `
      <div class="mt-3 pt-3 border-top">
        <h6 class="text-primary"><i class="bi bi-cloud-check"></i> Disconnected Operations Overhead</h6>
        <ul class="list-unstyled small text-muted mb-0">
          <li><strong>Workload Cluster:</strong> ${result.disconnectedOps.workloadCluster.cores} cores, ${result.disconnectedOps.workloadCluster.ram} GB RAM, ${result.disconnectedOps.workloadCluster.storage.toFixed(2)} TB storage</li>
          <li><strong>Management Cluster:</strong> ${result.disconnectedOps.managementCluster.cores} cores, ${result.disconnectedOps.managementCluster.ram} GB RAM, ${result.disconnectedOps.managementCluster.storage} TB storage (${result.disconnectedOps.managementCluster.nodes} nodes)</li>
        </ul>
      </div>
      ` : ''}
    `;

    setTimeout(() => {
      drawStorageChart(
        parseFloat(result.usableTiB),
        parseFloat(result.reserveTiB),
        parseFloat(result.resiliencyTiB)
      );
    }, 0);
    // Ensure any visible Bootstrap modals are properly hidden
    try {
      document.querySelectorAll('.modal.show').forEach(modEl => {
        try {
          const inst = bootstrap.Modal.getInstance(modEl) || new bootstrap.Modal(modEl);
          inst?.hide();
        } catch (inner) {
          // fallback: manually remove show/display
          modEl.classList.remove('show');
          modEl.style.display = 'none';
        }
      });

      // Remove any leftover overlay/backdrop elements and clear body modal state
      document.querySelectorAll('.modal-backdrop, .modal-overlay').forEach(el => el.remove());
      document.body.classList.remove('modal-open');
      document.body.style.paddingRight = '';
    } catch (e) {
      // Non-fatal
      console.warn('Could not clean modal backdrops or hide modals:', e);
    }
    // Controls are available after modal hide above.
  } catch (err) {
    logger.error("❌ Sizing failed:", err);
    const outputBox = document.getElementById("output");
    outputBox.textContent = "Sizing failed — please check inputs.";
  }
}

const runBtn = document.getElementById("runSizing");
runBtn?.addEventListener("click", () => {
  const activePill = document.querySelector("#sizingModePills .nav-link.active");
  const mode = activePill?.getAttribute("data-mode") || "vm";

  if (mode === "workload") {
    // Hide requirements modal first
    const reqEl = document.getElementById("requirementsModal");
    let reqModal = bootstrap.Modal.getInstance(reqEl);
    if (!reqModal) reqModal = new bootstrap.Modal(reqEl);
    reqModal.hide();

    // Delay payload collection slightly to ensure DOM is updated
    setTimeout(() => {
      const payload = getSizingPayloadFromHTML();
      renderWorkloadSummary(payload);

      const sumEl = document.getElementById("summaryModal");
      const summaryModal = new bootstrap.Modal(sumEl);
      summaryModal.show();

      document.getElementById("proceedSizingBtn").onclick = () => {
        runSizing(payload);
        const inst = bootstrap.Modal.getInstance(sumEl);
        inst?.hide();
      };
      document.getElementById("backToRequirementsBtn").onclick = () => {
        const inst = bootstrap.Modal.getInstance(sumEl);
        inst?.hide();
        const reqInst = new bootstrap.Modal(reqEl);
        reqInst.show();
      };
    }, 50); // Small delay to allow DOM reflow
  } else {
    const payload = getSizingPayloadFromHTML();
    runSizing(payload);
  }
});

// Modal no longer contains machine-type radios; main UI drives chassis selection
const SYS_CPU = 4;


document.addEventListener("change", (e) => {
  if (e.target.classList.contains("workload-profile")) {
    const row = e.target.closest(".workload-row");
    const wrapper = row.querySelector(".profile-size-wrapper");
    wrapper.classList.toggle("d-none", !e.target.checked);
  }
});


// ✅ Enhanced recalculateSizingFromUI function with improved visual handling
function recalculateSizingFromUI() {
  if (!window.lastSizingResult || !isManualOverride) return;
  
   if (!window.originalRequirements) {
    window.originalRequirements = getSizingPayloadFromHTML();
  }
if (window.originalRequirements) {
  if (!("totalCPU" in window.originalRequirements)) {
    window.originalRequirements.totalCPU = window.lastSizingResult.totalCores;
  }
  if (!("totalRAM" in window.originalRequirements)) {
    window.originalRequirements.totalRAM = window.lastSizingResult.totalMemoryGB;
  }
  if (!("totalGHz" in window.originalRequirements)) {
    window.originalRequirements.totalGHz = window.lastSizingResult.totalGHz;
  }
}


  const updatedPayload = getSizingPayloadFromHTML();
  if (!updatedPayload.memorySizeGB) {
  updatedPayload.memorySizeGB = parseInt(document.getElementById("memorySlider")?.value, 10) || 0;
}
if (!updatedPayload.cpuCount) {
  updatedPayload.cpuCount = parseInt(document.getElementById("cpuSlider")?.value, 10) || 0;
}

  // ✅ Declare all variables first
  const nodeCount = parseInt(document.getElementById("nodeSlider")?.value || "1", 10);
  const nodeType = document.querySelector('input[name="nodeType"]:checked')?.value;
  const cpuModel = document.getElementById("cpuChoice")?.value;
  const memorySize = parseInt(document.getElementById("memorySize")?.value || "512", 10);
  const diskSize = parseFloat(document.getElementById("diskSize")?.value || "1");
  const resiliency = document.getElementById("resiliency")?.value || "3-way";

  // ✅ Fix: Get values from lastSizingResult with safe fallbacks
  const originalRequirements = window.lastSizingResult;
  const safeTotalGHz = typeof originalRequirements.totalGHz === "number" ? originalRequirements.totalGHz : parseFloat(originalRequirements.totalGHz) || 0;
  const safeTotalCPU = typeof originalRequirements.totalCPU === "number" ? originalRequirements.totalCPU : parseFloat(originalRequirements.totalCPU) || 0;
  const safeTotalRAM = typeof originalRequirements.totalRAM === "number" ? originalRequirements.totalRAM : parseFloat(originalRequirements.totalRAM) || 0;

  // ✅ Calculate current totals based on UI selections
  const currentTotalMemory = memorySize * nodeCount;
  const currentUsableMemory = Math.round(currentTotalMemory * 0.96);
  
  // Get CPU info for calculations
  cpuList = getCpuListForNodeType(nodeType); // ✅ Update CPU list based on node type
  const cpu = cpuList.find(c => c.model === cpuModel);
  const socketCount = getSocketCountForChassis(nodeType);
  const currentTotalCores = cpu ? cpu.cores * nodeCount * socketCount : 0;
  const currentTotalGHz = cpu ? (cpu.base_clock_GHz * currentTotalCores) : 0;
  const currentUsableCores = Math.max(0, currentTotalCores - 4); // System reserve

  updateDiskLimits();
  const rawDiskCount = parseInt(document.getElementById("disks")?.value || "4", 10);

  const diskLimits = {
    "AX 660": [2, 10],
    "AX 670": [2, 16],
    "AX 760": [2, 24],
    "AX 770": [2, 16]
  };
  const [minDisks, maxDisks] = diskLimits[nodeType] || [4, 24];
  const diskCount = Math.max(minDisks, Math.min(rawDiskCount, maxDisks));

  const storage = calculateUsableStorage(nodeCount, diskCount, diskSize, resiliency);
  if (!storage || parseFloat(storage.usableTiB) === 0) {
    console.warn("⚠️ Invalid disk configuration — skipping recalculation");
    return;
  }

  // In manual override mode we use the locally-calculated `window.lastSizingResult`
  // (calculated by `calculateTotals`) rather than calling the engine which
  // computes node counts from requirements and would overwrite the user's choice.
  const result = window.lastSizingResult;
  if (!result) {
    console.warn("⚠️ No existing manual sizing result found — skipping recalculation");
    return;
  }

  const container = document.getElementById("clusterSummaryContainer");
  if (container) container.innerHTML = ""; // Clear old blocks

  // If the manual `result` doesn't include `clusterSummaries` (manual-mode quick result),
  // build a minimal summary so the UI rendering functions can operate.
  if (!result.clusterSummaries || !Array.isArray(result.clusterSummaries)) {
    const cpuCoresPerSocket = cpu?.cores || 0;
    const socketCount = getSocketCountForChassis(nodeType);
    const physicalCoresPerNode = cpuCoresPerSocket * socketCount;
    const usableCores = currentUsableCores;
    const usableGHz = currentTotalGHz;
    const usableMemoryGB = currentUsableMemory;
    const usableTiB = parseFloat(storage.usableTiB);
    const postFailure = {
      activeNodes: Math.max(nodeCount - 1, 1),
      usableCores: Math.max(0, (Math.max(nodeCount - 1, 1) * physicalCoresPerNode) - SYS_CPU),
      usableGHz: usableGHz ? (usableGHz * (Math.max(nodeCount - 1, 1) / nodeCount)) : 0,
      usableMemoryGB: Math.round((Math.max(nodeCount - 1, 1) * memorySize) * 0.96)
    };

    result.clusterSummaries = [{
      name: 'Instance A',
      nodeCount,
      reservedNodes: Math.min(nodeCount, 2),
      usableCores,
      usableGHz,
      usableMemoryGB,
      usableTiB,
      resiliency: resiliency,
      diskSizeTB: diskSize,
      disksPerNode: diskCount,
      rawTiB: storage.rawTB,
      reserveTiB: storage.reserveTiB,
      resiliencyTiB: storage.resiliencyTiB,
      postFailure
    }];

    result.clusterCount = 1;
    result.clusterSizes = [nodeCount];
  }

  result.clusterSummaries.forEach((summary, index) => {
    const clusterName = `Instance ${String.fromCharCode(65 + index)}`;
    renderInstanceSummaryBlock({
      ...summary,
      name: clusterName,
      clusterType: document.querySelector('input[name="clusterType"]:checked')?.value || "Standard",
      switchMode: document.querySelector('input[name="switchMode"]:checked')?.value || "separate",
      postFailureCapabilities: summary.postFailure
    });
  });
  // Don't overwrite user-controlled sliders when in manual override mode
  if (!isManualOverride) {
    nodeSlider.value = result.nodeCount;
    nodeValueDisplay.textContent = result.nodeCount;
  }

// ✅ Patch requirements with expected fields
if (window.originalRequirements) {
  window.originalRequirements.totalCPU = window.originalRequirements.totalCPU ?? window.originalRequirements.totalCores ?? 0;
  window.originalRequirements.totalRAM = window.originalRequirements.totalRAM ?? window.originalRequirements.totalMemoryGB ?? 0;
  window.originalRequirements.totalStorage = window.originalRequirements.totalStorage ?? window.originalRequirements.usableTiB ?? 0;
}

result.totalCores = currentTotalCores;
result.totalMemoryGB = currentTotalMemory;
result.totalUsableGHz = currentTotalGHz;

renderRelativeFillBarChart(window.originalRequirements, result);

  syncConfigUI(result);
  calculateTotals();
  
  // ✅ Enhanced visual updates with delay for complex changes
  refreshAllVisuals();
  
  setTimeout(() => {
    const visualsSection = document.getElementById("visuals");
    if (visualsSection && !visualsSection.classList.contains("d-none")) {
      refreshAllVisuals(); // Double-refresh for complex changes
    }
  }, 100);
}



  // === Event Bindings ===
nodeSlider.addEventListener("input", () => {
  isManualOverride = true;
  const value = parseInt(nodeSlider.value, 10);
  nodeValueDisplay.textContent = value;

  const switchlessRadio = document.getElementById("switchless");
  const switchlessWrapper = switchlessRadio?.closest(".form-check");

  if (switchlessWrapper) {
    if (value > 4) {
      switchlessWrapper.style.display = "none";
      if (switchlessRadio.checked) {
        document.getElementById("converged").checked = true;
      }
    } else {
      switchlessWrapper.style.display = "block";
    }
  }

  updateResiliencyOptionsBasedOnNodes(value);
  updateSwitchModeUI();
  updateStorage();
  calculateTotals();
  updateLegend();
  
  // ✅ Enhanced visual updates
  refreshAllVisuals();
  recalculateSizingFromUI();
});

diskSlider.addEventListener("input", () => {
  isManualOverride = true;
  diskValueDisplay.textContent = diskSlider.value;
  calculateTotals();
  updateLegend();
  
  // Just refresh the visuals with the new disk count, don't recalculate sizing
  refreshAllVisuals();
});

[diskSizeSelect, cpuSelect, memorySelect, resiliencySelect].forEach(el =>
  el.addEventListener("change", () => {
    isManualOverride = true;
    calculateTotals();
    updateLegend();
    recalculateSizingFromUI();
  })
);

nodeTypeRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    updateNodeImage();
    updateDiskLimits();
    updateCpuOptions();
    updateMemoryOptions();
    updateDiskSizeOptions();
    updateStorage();
    updateLegend();
    
    // If we're in automated sizing mode (not manual override), recalculate with new chassis
    if (!isManualOverride && window.lastSizingResult) {
      runSizing();
    } else {
      // In manual mode, just update the display
      isManualOverride = true;
      calculateTotals();
      recalculateSizingFromUI();
    }
  });
});

document.querySelectorAll('input[name="connectiontype"]').forEach(input =>
  input.addEventListener("change", () => {
    isManualOverride = true;
    calculateTotals();
    updateLegend();
    recalculateSizingFromUI();
  })
);

// Cluster type change listener
document.querySelectorAll('input[name="clusterType"]').forEach(input => {
  input.addEventListener("change", () => {
    updateSwitchModeUI();
    calculateTotals();
    updateLegend();
    recalculateSizingFromUI();
  });
});

// Switch mode change listener
document.querySelectorAll('input[name="switchMode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const driveSizeInput = document.getElementById("driveSizeInput").value;
    logger.info("Drive size before sizing:", driveSizeInput);

    const selectedMode = document.querySelector('input[name="switchMode"]:checked')?.value || "separate";

    const updatedSummaries = window.lastSizingResult?.clusterSummaries?.map(summary => {
      const { name, nodeCount } = summary;
      logger.info(`Rendering ${name}: ${nodeCount} machines, mode = ${selectedMode}`);
      return {
        ...summary,
        switchMode: selectedMode
      };
    });

    const container = document.getElementById("clusterSummaryContainer");
    if (container) container.innerHTML = "";

    updatedSummaries?.forEach(renderInstanceSummaryBlock);
    recalculateSizingFromUI();
  });
});

document.querySelectorAll("#sizingModePills .nav-link").forEach(pill => {
  pill.addEventListener("click", () => {
    // Update active pill
    document.querySelectorAll("#sizingModePills .nav-link").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");

    const mode = pill.getAttribute("data-mode");

    const vmSection = document.getElementById("vmSizingSection");
    const infraSection = document.getElementById("infraSizingSection");
    const workloadSection = document.getElementById("workloadSizingSection");
    const disconnectedOpsCheckbox = document.getElementById("disconnectedOpsCheckbox");
    const disconnectedOpsContainer = disconnectedOpsCheckbox?.closest(".form-check");

    // Hide all sections
    vmSection.classList.add("d-none");
    infraSection.classList.add("d-none");
    workloadSection.classList.add("d-none");

    if (mode === "vm") {
      vmSection.classList.remove("d-none");
      // Show disconnected ops for VM mode
      if (disconnectedOpsContainer) disconnectedOpsContainer.classList.remove("d-none");
    } else if (mode === "infra") {
      infraSection.classList.remove("d-none");
      // Show disconnected ops for Infra mode
      if (disconnectedOpsContainer) disconnectedOpsContainer.classList.remove("d-none");
    } else if (mode === "workload") {
      workloadSection.classList.remove("d-none");
      // Hide disconnected ops for Workload mode (AVD not supported)
      if (disconnectedOpsContainer) disconnectedOpsContainer.classList.add("d-none");
      // Uncheck if it was checked
      if (disconnectedOpsCheckbox) disconnectedOpsCheckbox.checked = false;

      // Auto-populate if empty
      const list = document.getElementById("workloadList");
      if (list.children.length === 0) {
        addWorkloadRow();
      }
    }

    const sizingPayload = getSizingPayloadFromHTML();
    renderRequirementsSummary(sizingPayload);
    recalculateSizingFromUI();
  });
});

// Keep a simple counter to ensure unique IDs per inserted row
let workloadRowCounter = 0;

function addWorkloadRow() {
  const container = document.getElementById("workloadList");
  if (!container) return;

  workloadRowCounter += 1;
  const checkboxId = `workloadProfile_${workloadRowCounter}`;

  container.insertAdjacentHTML("beforeend", `
    <div class="card shadow-sm border-0 mb-3 workload-row">
      <div class="card-body">
        <h6 class="card-title text-primary mb-3">Workload ${workloadRowCounter}</h6>

        <div class="mb-3">
          <label class="form-label">Workload Category</label>
          <select class="form-select workload-category">
            <option value="avd" selected>Azure Virtual Desktop</option>
          </select>
        </div>

        <div class="mb-3">
          <label class="form-label">Workload Name</label>
          <input type="text" class="form-control workload-name" value="Workload ${workloadRowCounter}">
        </div>

        <div class="mb-3">
          <label class="form-label">Total Users</label>
          <input type="number" class="form-control workload-users" value="100" min="1">
        </div>

        <div class="mb-3">
          <label class="form-label">Max Concurrency (%)</label>
          <input type="number" class="form-control workload-concurrency" value="90" min="1" max="100">
        </div>

        <div class="mb-3">
          <label class="form-label">Session Type</label>
          <select class="form-select workload-session">
            <option value="multi" selected>Multi-session</option>
            <option value="single">Single-session</option>
          </select>
        </div>

        <div class="mb-3">
          <label class="form-label">Workload Type</label>
          <select class="form-select workload-type">
  <option value="light" selected>Light</option>
  <option value="medium">Medium</option>
  <option value="heavy">Heavy</option>
  <option value="power" class="multi-only">Power (multi-session only)</option>
</select>
        </div>

        <div class="form-check mb-3">
          <input class="form-check-input workload-profile" type="checkbox" id="${checkboxId}">
          <label class="form-check-label" for="${checkboxId}">Add file share for user profile</label>
        </div>
<div class="col-md-4 profile-size-wrapper d-none">
  <label class="form-label">Profile size (GB per user)</label>
  <input type="number" class="form-control workload-profile-size" value="20" min="1" step="1">
</div>

        <div class="text-end">
          <button type="button" class="btn btn-sm btn-outline-danger">
  Remove Workload
</button>
        </div>
      </div>
    </div>
  `);
}

function removeWorkloadRow(btn) {
  const card = btn.closest(".workload-row");
  if (card) card.remove();
}

function removeWorkloadRow(btn) {
  btn.closest(".workload-row").remove();
}

  // === Initial Setup ===
  updateCpuOptions();
  updateMemoryOptions();
  updateDiskSizeOptions();
  updateNodeImage();
  updateDiskLimits();
  updateResiliencyOptionsBasedOnNodes(parseInt(nodeSlider.value, 10));
  updateSwitchModeUI();
  updateStorage();
  isManualOverride = true;
  calculateTotals();
  updateLegend();
 setTimeout(() => {
  initializeVisuals();
}, 50);
setupPPTXExportWrapper();

// ✅ Theme selector listener - reinitialize export button when theme changes
const themeSelector = document.getElementById("pptxTheme");
if (themeSelector) {
  themeSelector.addEventListener("change", () => {
    setupPPTXExportWrapper();
  });
}

});

