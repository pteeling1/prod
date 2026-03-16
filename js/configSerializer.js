/**
 * Configuration Serializer
 * Captures and restores the complete application state
 */

/**
 * Serialize all app state into a SavedConfiguration object
 * This captures everything needed to fully reconstruct a sizing session
 */
export function serializeConfiguration(name, description = '') {
  const timestamp = new Date().toISOString();

  // Capture sizing mode
  const activePill = document.querySelector("#sizingModePills .nav-link.active");
  const sizingMode = activePill?.getAttribute("data-mode") || "vm";

  // Capture manual configuration state
  const uiState = {
    nodeCount: parseInt(document.getElementById("nodeSlider")?.value || "4", 10),
    nodeType: document.querySelector('input[name="nodeType"]:checked')?.value || "AX 770",
    cpuChoice: document.getElementById("cpuChoice")?.value || "32 cores",
    memorySize: document.getElementById("memorySize")?.value || "256 GB",
    disksPerNode: parseInt(document.getElementById("disks")?.value || "4", 10),
    diskSize: document.getElementById("diskSize")?.value || "3.84",
    resiliency: document.getElementById("resiliency")?.value || "3-Way Mirror",
    clusterType: document.querySelector('input[name="clusterType"]:checked')?.value || "Non-Converged",
    switchMode: document.querySelector('input[name="switchMode"]:checked')?.value || "separate",
    connectionType: document.querySelector('input[name="connectiontype"]:checked')?.value || "Twinax",
    pptxTheme: document.getElementById("pptxTheme")?.value || "dark"
  };

  // Capture sizing modal inputs based on active mode
  let sizingInput = {};

  if (sizingMode === "vm") {
    sizingInput = {
      vmCount: parseInt(document.getElementById("vmCount")?.value || "0", 10),
      vCPUsPerVM: parseInt(document.getElementById("vCPU")?.value || "0", 10),
      vcpuRatio: parseFloat(document.getElementById("vcpuRatio")?.value || "1"),
      ramPerVM: parseInt(document.getElementById("ramPerVM")?.value || "0", 10),
      storagePerVM: parseFloat(document.getElementById("storagePerVM")?.value || "0")
    };
  } else if (sizingMode === "infra") {
    sizingInput = {
      cpuUnit: document.getElementById("cpuUnit")?.value || "cores",
      totalCPU: parseInt(document.getElementById("cpuRequirement")?.value || "0", 10),
      totalGHz: parseFloat(document.getElementById("ghzRequirement")?.value || "0"),
      totalRAM: parseInt(document.getElementById("totalRAM")?.value || "0", 10),
      totalStorage: parseFloat(document.getElementById("totalStorage")?.value || "0")
    };
  } else if (sizingMode === "workload") {
    const workloads = [];
    document.querySelectorAll(".workload-row").forEach((row, idx) => {
      workloads.push({
        name: row.querySelector(".workload-name")?.value || `Workload ${idx + 1}`,
        users: parseInt(row.querySelector(".workload-users")?.value || "0", 10),
        concurrency: parseInt(row.querySelector(".workload-concurrency")?.value || "100", 10),
        sessionType: row.querySelector(".workload-session")?.value || "multi",
        workloadType: row.querySelector(".workload-type")?.value || "light",
        addProfileShare: row.querySelector(".workload-profile")?.checked || false,
        profileSize: row.querySelector(".workload-profile")?.checked
          ? parseInt(row.querySelector(".workload-profile-size")?.value || "0", 10)
          : 0
      });
    });
    sizingInput = { workloads };
  }

  // Build complete configuration envelope
  const config = {
    metadata: {
      id: `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      createdDate: timestamp,
      lastModified: timestamp,
      appVersion: "1.0.0"
    },

    uiState: {
      manual: uiState,
      sizingMode,
      ...sizingInput,
      universal: {
        disconnectedOpsEnabled: document.getElementById("disconnectedOpsCheckbox")?.checked || false,
        haLevel: document.getElementById("haLevel")?.value || "n+1",
        growthFactorPercent: parseFloat(document.getElementById("growthFactor")?.value || "0")
      }
    },

    calculation: {
      input: window.originalRequirements || null,
      output: window.lastSizingResult || null,
      cableInfo: {
        cableSummaryText: window.cableSummaryText || "",
        cableCount: window.cableCount || 0,
        cableLabel: window.cableLabel || ""
      }
    },

    state: {
      requirementslocked: window.requirementslocked || false,
      isManualMode: window.lastSizingResult?.isManualMode || false
    }
  };

  return config;
}

/**
 * Deserialize a SavedConfiguration and restore all UI state
 * @param {Object} config - The SavedConfiguration object
 */
export function deserializeConfiguration(config) {
  if (!config || !config.uiState) {
    console.error("Invalid configuration object");
    return false;
  }

  try {
    const ui = config.uiState.manual;
    const universal = config.uiState.universal;
    const sizingMode = config.uiState.sizingMode;

    // Restore manual configuration
    const nodeSlider = document.getElementById("nodeSlider");
    if (nodeSlider) nodeSlider.value = ui.nodeCount;
    const nodeValue = document.getElementById("nodeValue");
    if (nodeValue) nodeValue.textContent = ui.nodeCount;

    document.querySelector(`input[name="nodeType"][value="${ui.nodeType}"]`)?.click();
    document.getElementById("cpuChoice").value = ui.cpuChoice;
    document.getElementById("memorySize").value = ui.memorySize;

    const diskSlider = document.getElementById("disks");
    if (diskSlider) diskSlider.value = ui.disksPerNode;
    const diskValue = document.getElementById("diskValue");
    if (diskValue) diskValue.textContent = ui.disksPerNode;

    document.getElementById("diskSize").value = ui.diskSize;
    document.getElementById("resiliency").value = ui.resiliency;
    document.querySelector(`input[name="clusterType"][value="${ui.clusterType}"]`)?.click();
    document.querySelector(`input[name="switchMode"][value="${ui.switchMode}"]`)?.click();
    document.querySelector(`input[name="connectiontype"][value="${ui.connectionType}"]`)?.click();
    document.getElementById("pptxTheme").value = ui.pptxTheme;

    // Restore universal settings
    document.getElementById("disconnectedOpsCheckbox").checked = universal.disconnectedOpsEnabled;
    document.getElementById("haLevel").value = universal.haLevel;
    document.getElementById("growthFactor").value = universal.growthFactorPercent;

    // Restore sizing mode and inputs
    document.querySelector(`#sizingModePills button[data-mode="${sizingMode}"]`)?.click();

    if (sizingMode === "vm" && config.uiState.vmCount !== undefined) {
      document.getElementById("vmCount").value = config.uiState.vmCount;
      document.getElementById("vCPU").value = config.uiState.vCPUsPerVM;
      document.getElementById("vcpuRatio").value = config.uiState.vcpuRatio;
      document.getElementById("ramPerVM").value = config.uiState.ramPerVM;
      document.getElementById("storagePerVM").value = config.uiState.storagePerVM;
    } else if (sizingMode === "infra" && config.uiState.totalCPU !== undefined) {
      document.getElementById("cpuUnit").value = config.uiState.cpuUnit;
      document.getElementById("cpuRequirement").value = config.uiState.totalCPU;
      document.getElementById("ghzRequirement").value = config.uiState.totalGHz;
      document.getElementById("totalRAM").value = config.uiState.totalRAM;
      document.getElementById("totalStorage").value = config.uiState.totalStorage;
    } else if (sizingMode === "workload" && config.uiState.workloads) {
      // Restore workload rows
      const workloadList = document.getElementById("workloadList");
      workloadList.innerHTML = "";
      config.uiState.workloads.forEach((workload) => {
        addWorkloadRow(workload);
      });
    }

    // Restore calculation results if available
    if (config.calculation.input) {
      window.originalRequirements = config.calculation.input;
    }
    if (config.calculation.output) {
      window.lastSizingResult = config.calculation.output;
    }

    console.log("✅ Configuration restored successfully");
    return true;
  } catch (error) {
    console.error("Error deserializing configuration:", error);
    return false;
  }
}

/**
 * Helper function to add a workload row (used during deserialization)
 * This assumes the same structure as the main.js workload creation
 */
function addWorkloadRow(workload = {}) {
  const workloadList = document.getElementById("workloadList");
  const rowId = `workload_${Date.now()}`;

  const row = document.createElement("div");
  row.className = "workload-row card p-3 mb-3";
  row.innerHTML = `
    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label">Workload Name</label>
        <input type="text" class="form-control workload-name" value="${workload.name || ''}">
      </div>
      <div class="col-md-6">
        <label class="form-label">Number of Users</label>
        <input type="number" class="form-control workload-users" value="${workload.users || 0}">
      </div>
      <div class="col-md-6">
        <label class="form-label">Concurrency (%)</label>
        <input type="number" class="form-control workload-concurrency" value="${workload.concurrency || 100}" min="0" max="100">
      </div>
      <div class="col-md-6">
        <label class="form-label">Session Type</label>
        <select class="form-select workload-session">
          <option value="single" ${workload.sessionType === 'single' ? 'selected' : ''}>Single</option>
          <option value="multi" ${workload.sessionType === 'multi' ? 'selected' : ''}>Multi</option>
        </select>
      </div>
      <div class="col-md-6">
        <label class="form-label">Workload Type</label>
        <select class="form-select workload-type">
          <option value="light" ${workload.workloadType === 'light' ? 'selected' : ''}>Light</option>
          <option value="medium" ${workload.workloadType === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="heavy" ${workload.workloadType === 'heavy' ? 'selected' : ''}>Heavy</option>
          <option value="power" ${workload.workloadType === 'power' ? 'selected' : ''}>Power</option>
        </select>
      </div>
      <div class="col-md-6">
        <div class="form-check mt-4">
          <input class="form-check-input workload-profile" type="checkbox" ${workload.addProfileShare ? 'checked' : ''}>
          <label class="form-check-label">Add Profile Share</label>
        </div>
      </div>
      <div class="col-md-6" ${workload.addProfileShare ? '' : 'style="display: none;"'}>
        <label class="form-label">Profile Size (GB)</label>
        <input type="number" class="form-control workload-profile-size" value="${workload.profileSize || 0}">
      </div>
      <div class="col-12">
        <button class="btn btn-sm btn-danger" onclick="this.closest('.workload-row').remove();">Remove</button>
      </div>
    </div>
  `;

  workloadList.appendChild(row);
}

/**
 * Get a checksum/hash of current configuration for dirty state detection
 */
export function getConfigChecksum() {
  const state = serializeConfiguration("temp", "");
  return JSON.stringify(state).split('').reduce((hash, char) => {
    return ((hash << 5) - hash) + char.charCodeAt(0);
  }, 0).toString(16);
}
