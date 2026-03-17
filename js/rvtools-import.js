import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs';
import { sizeCluster } from './sizingEngine.js';
import { cpuList } from './cpuData.js';

const uploadInput = document.getElementById('rvtoolsUpload');
const previewTable = document.getElementById('preview-table');
const fileTabs = document.getElementById('file-tabs');
const clusterContainer = document.getElementById('clusterFilterContainer');
const excludePoweredOffCheckbox = document.getElementById('excludePoweredOff');
const summaryDiv = document.getElementById('preview-summary');
const sizingResultsDiv = document.getElementById('sizing-results');
const runSizingBtn = document.getElementById('runSizingBtn');
const groupInputsDiv = document.getElementById('groupInputs');
const addGroupBtn = document.getElementById('addGroupBtn');

let currentVMData = [];
let currentFilteredVMs = [];
let currentHostData = [];
let currentFileName = '';
let currentFileIndex = 0;
let groupCounter = 1;
let savedClusterGroups = [];
let sizingResults = [];

uploadInput.addEventListener('change', handleFileUpload);
excludePoweredOffCheckbox.addEventListener('change', updatePreview);
runSizingBtn.addEventListener('click', runSizing);
addGroupBtn.addEventListener('click', addClusterGroup);
document.getElementById('exportSummaryBtn').addEventListener('click', () => {
  exportSizingSummaryToExcel(sizingResults);
});
function populateCpuOverrideDropdown() {
  const select = document.getElementById("cpuOverrideSelect");
  if (!select || !Array.isArray(cpuList)) return;

  const models = [...new Set(cpuList.map(cpu => cpu.model))].sort();

 cpuList.forEach(cpu => {
  const option = document.createElement("option");
  option.value = cpu.model;
  option.textContent = `${cpu.model} (${cpu.cores} cores)`;
  select.appendChild(option);
});
}
document.addEventListener("DOMContentLoaded", populateCpuOverrideDropdown);

function addClusterGroup() {
  // Collect selected clusters (excluding "all") and normalize
  const selectedClusters = Array.from(
    clusterContainer.querySelectorAll('input[type="checkbox"]:checked')
  )
    .map(cb => cb.value)
    .filter(c => c !== "all")
    .map(c => c.trim());

  if (selectedClusters.length === 0) {
    alert("Please select at least one cluster before adding a group.");
    return;
  }

  // Deduplicate cluster names
  const uniqueClusters = Array.from(new Set(selectedClusters));

  // Prompt for a group name with a stable default
  const defaultName = `Group ${savedClusterGroups.length + 1}`;
  const groupName = prompt("Enter a name for this group:", defaultName);
  if (!groupName) return;

  // If the group name already exists, merge clusters; otherwise add new group
  const existing = savedClusterGroups.find(g => g.name === groupName);
  if (existing) {
    existing.clusters = Array.from(new Set([
      ...existing.clusters.map(c => c.trim()),
      ...uniqueClusters
    ]));
  } else {
    savedClusterGroups.push({ name: groupName.trim(), clusters: uniqueClusters });
  }

  // Clear selection checkboxes after grouping
  clusterContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);

  // Re-render the group definitions list cleanly
  groupInputsDiv.innerHTML = '';

  const definitionHeader = document.createElement('div');
  definitionHeader.style.marginBottom = '6px';
  definitionHeader.textContent = `${savedClusterGroups.length} manually defined group${savedClusterGroups.length > 1 ? 's' : ''}`;
  groupInputsDiv.appendChild(definitionHeader);

  savedClusterGroups.forEach(group => {
    const line = document.createElement('div');
    line.textContent = `${group.name} – ${group.clusters.join(', ')}`;
    groupInputsDiv.appendChild(line);
  });

  // Create a single Clear Groups button (avoid duplicates)
  let clearGroupsBtn = document.getElementById('clearGroupsBtn');
  if (!clearGroupsBtn) {
    clearGroupsBtn = document.createElement('button');
    clearGroupsBtn.id = 'clearGroupsBtn';
    clearGroupsBtn.textContent = "Clear Groups";
    clearGroupsBtn.style.marginTop = '8px';
    clearGroupsBtn.onclick = () => {
      savedClusterGroups = [];
      groupInputsDiv.innerHTML = '';
      updatePreview();
      console.log("🧹 Cleared all groups");
    };
    groupInputsDiv.appendChild(clearGroupsBtn);
  }

  console.log(`📦 Added/Updated ${groupName}:`, uniqueClusters);

  // Refresh preview to reflect group-level aggregation
  updatePreview();
}

function buildGroupsForMode() {
  const groupingMode = document.getElementById('groupingMode')?.value || 'perCluster';
  const allClustersSelected = clusterContainer.querySelector('input[value="all"]')?.checked;
  const selectedClusters = Array.from(clusterContainer.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.value)
    .filter(v => v !== 'all');
  const hasGroups = savedClusterGroups.length > 0;

  let groups = [];

  if (groupingMode === 'perCluster') {
    if (allClustersSelected) {
      // A: all clusters, per cluster
      groups = getUniqueClusters(currentVMData).map(c => ({ name: c, clusters: [c] }));
    } else if (hasGroups) {
      // C: groups exist, expand to per cluster
      groups = savedClusterGroups.flatMap(group =>
        group.clusters.map(c => ({ name: `${group.name} – ${c}`, clusters: [c] }))
      );
    } else {
      // B: selected clusters, per cluster
      groups = selectedClusters.map(c => ({ name: c, clusters: [c] }));
    }
  }

  if (groupingMode === 'grouped') {
    if (allClustersSelected) {
      // A: all clusters aggregated
      groups = [{ name: 'All Clusters', clusters: getUniqueClusters(currentVMData) }];
    } else if (hasGroups) {
      // C: groups aggregated
      groups = savedClusterGroups;
    } else {
      // B: selected clusters aggregated
      groups = [{ name: 'Grouped Selection', clusters: selectedClusters }];
    }
  }

  return groups;
}


function normalizeVMRow(vm, memoryMap = {}, consumedStorageMap = {}) {
  const name = vm["VM"]?.trim() || 'Unnamed VM';
  const activeMB = memoryMap[name];
  const consumedMiB = consumedStorageMap[name];

  return {
    VMName: name,
    Cluster: vm["Cluster"]?.trim() || 'Unknown',
    PowerState: vm["Powerstate"]?.trim().toLowerCase() || 'unknown',
    NumCpu: parseFloat(vm["CPUs"]) || 0,
    MemoryGB: activeMB
      ? activeMB / 1024
      : parseFloat(vm["Memory"]) / 1024 || 0,
    ProvisionedSpaceGB: parseFloat(vm["In Use MiB"]) / 1024 || 0,  // Provisioned (In Use MiB from vInfo)
    ConsumedSpaceGB: consumedMiB ? consumedMiB / 1024 : 0,           // Guest OS consumed (ConsumedMiB from vPartition)

    // 👇 Map the verbose RVTools column to a clean property
    GuestOS: vm["OS according to the configuration file"]?.trim() || 'Unknown',

    // 👇 Capture the "Include" column value (yes/no). Default to true if column missing.
    Include: vm["Include"] ? vm["Include"].trim().toLowerCase() === 'yes' : true,

    SourceFile: vm.SourceFile || 'Unknown File'
  };
}

function normalizeHostRow(host) {
  const rawCores = host['# Cores'];
  const totalCores = typeof rawCores === 'string'
    ? parseInt(rawCores.replace(/[^0-9]/g, ''))
    : parseInt(rawCores);

  const cpuUsageRaw = host['CPU usage %'];
  const cpuUsage = typeof cpuUsageRaw === 'string'
    ? parseFloat(cpuUsageRaw.replace(/[^0-9.]/g, ''))
    : parseFloat(cpuUsageRaw);

  return {
    hostName: host['Host'] || host['Name'] || 'Unknown',
    Cluster: host['Cluster'] || 'Unknown',
    totalCores: isNaN(totalCores) ? 0 : totalCores,
    cpuUsage: isNaN(cpuUsage) ? 0 : cpuUsage
  };
}

function isPoweredOn(vm) {
  const state = vm.PowerState?.toLowerCase().trim();
  return state === 'poweredon' || state === 'powered on';
}

function handleFileUpload(event) {
  const files = Array.from(event.target.files);

  // Reset UI
  fileTabs.innerHTML = '';
  previewTable.innerHTML = '';
  clusterContainer.innerHTML = '';
  summaryDiv.innerHTML = '';
  sizingResultsDiv.innerHTML = '';
  groupInputsDiv.innerHTML = '';
  groupCounter = 1;

  // Reset state
  currentVMData = [];
  currentHostData = [];
  const previewDataByFile = [];

  // Show loading indicator
  const loadingIndicator = document.getElementById("loadingIndicator");
  if (loadingIndicator) loadingIndicator.style.display = "block";

  let filesProcessed = 0;

  files.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      const vInfoSheet = workbook.Sheets['vInfo'];
      const vHostSheet = workbook.Sheets['vHost'];

      if (!vInfoSheet) {
        fileTabs.innerHTML += `<div>❌ ${file.name}: Missing 'vInfo' tab</div>`;
        filesProcessed++;
        if (filesProcessed === files.length && loadingIndicator) {
          loadingIndicator.style.display = "none";
        }
        return;
      }

      // vMemory for active memory
      const vMemorySheet = workbook.Sheets["vMemory"];
      const rawMemoryData = vMemorySheet ? XLSX.utils.sheet_to_json(vMemorySheet) : [];
      const vmActiveMemoryMap = {};
      rawMemoryData.forEach(row => {
        const vmName = row["VM"]?.trim();
        const activeMB = parseFloat(row["Active"]);
        if (vmName && !isNaN(activeMB)) {
          vmActiveMemoryMap[vmName] = activeMB;
        }
      });

      // vPartition for consumed storage (guest OS level)
      const vPartitionSheet = workbook.Sheets["vPartition"];
      const rawPartitionData = vPartitionSheet ? XLSX.utils.sheet_to_json(vPartitionSheet) : [];
      const vmConsumedStorageMap = {};
      rawPartitionData.forEach(row => {
        const vmName = row["VM"]?.trim();
        const consumedMiB = parseFloat(row["Consumed MiB"]);
        if (vmName && !isNaN(consumedMiB)) {
          // Sum consumed storage per VM (in case of multiple partitions per VM)
          vmConsumedStorageMap[vmName] = (vmConsumedStorageMap[vmName] || 0) + consumedMiB;
        }
      });

      // vInfo normalization
      const rawVMData = XLSX.utils.sheet_to_json(vInfoSheet);
      
      // 🔍 Debug: Show all column names in the Excel file
      if (rawVMData.length > 0) {
        const columnNames = Object.keys(rawVMData[0]);
        console.log("📋 Column names in vInfo sheet:", columnNames);
        console.log("🔍 First row raw data:", rawVMData[0]);
      }
      
      const normalizedVMs = rawVMData.map(vm => {
        const normalized = normalizeVMRow(vm, vmActiveMemoryMap, vmConsumedStorageMap);
        normalized.SourceFile = file.name;
        return normalized;
      });
      console.group(`📥 File Loaded: ${file.name}`);
console.log(`🔍 VM Count: ${normalizedVMs.length}`);

// Show VMs excluded due to "include" column
const excludedByInclude = normalizedVMs.filter(vm => vm.Include === false);
if (excludedByInclude.length > 0) {
  console.warn(`⚠️ VMs excluded by 'include' column: ${excludedByInclude.length}`);
  console.table(excludedByInclude.map(vm => ({ VMName: vm.VMName, Include: vm.Include })));
} else {
  console.log("✅ No VMs excluded by 'include' column (or column not found)");
}

console.log("🧠 Sample VM:", normalizedVMs[0]);
console.log("📊 Total vCPU:", normalizedVMs.reduce((sum, vm) => sum + vm.NumCpu, 0));
console.log("📊 Total Memory (GB):", normalizedVMs.reduce((sum, vm) => sum + vm.MemoryGB, 0).toFixed(1));
console.log("📊 Total Disk - Provisioned (GB):", normalizedVMs.reduce((sum, vm) => sum + vm.ProvisionedSpaceGB, 0).toFixed(1));
console.log("📊 Total Disk - Consumed (GB):", normalizedVMs.reduce((sum, vm) => sum + vm.ConsumedSpaceGB, 0).toFixed(1));
console.groupEnd();
      currentVMData.push(...normalizedVMs);

      // vHost normalization
      if (vHostSheet) {
        const rawHostData = XLSX.utils.sheet_to_json(vHostSheet);
        const taggedHosts = rawHostData.map(host => {
          const normalized = normalizeHostRow(host);
          normalized.SourceFile = file.name;
          return normalized;
        });
        currentHostData.push(...taggedHosts);
      }

      previewDataByFile.push({ name: file.name, vmData: normalizedVMs, index });
      fileTabs.innerHTML += `<div>✅ ${file.name}: ${normalizedVMs.length} VMs</div>`;

      // When all files are processed
      filesProcessed++;
      if (filesProcessed === files.length) {
        if (loadingIndicator) loadingIndicator.style.display = "none";

        // Render cluster and OS filters
        const clusters = getUniqueClusters(currentVMData);
        renderClusterCheckboxes(clusters);
        renderOSFilterOptions(currentVMData);

        // Render previews
        previewDataByFile.forEach(file => {
          renderPreview(file.vmData, file.name, file.index);
        });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
function renderOSFilterOptions(vmData) {
  const osContainer = document.getElementById('osFilterContainer');
  if (!osContainer) return; // safety check

  // Clear any previous options
  osContainer.innerHTML = '';

  // Collect unique OS values from normalized VMs
  const uniqueOS = Array.from(new Set(vmData.map(vm => vm.GuestOS))).sort();

  if (uniqueOS.length === 0) {
    osContainer.innerHTML = '<p class="text-muted">No OS data available</p>';
    return;
  }

  // Build a checkbox for each OS
  uniqueOS.forEach(os => {
    const id = `os-${os.replace(/[^a-z0-9]/gi, '_')}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'form-check';
    wrapper.innerHTML = `
      <input class="form-check-input os-filter" type="checkbox" value="${os}" id="${id}" checked>
      <label class="form-check-label" for="${id}">${os}</label>
    `;
    osContainer.appendChild(wrapper);
  });

  // Re-run preview whenever OS selections change
  osContainer.querySelectorAll('.os-filter').forEach(cb => {
    cb.addEventListener('change', updatePreview);
  });
}
function getUniqueClusters(vmData) {
  const clusters = new Set();
  vmData.forEach(vm => clusters.add(vm.Cluster || 'Unknown'));
  return Array.from(clusters).sort();
  console.log("All clusters:", getUniqueClusters(currentVMData));
}

function renderClusterCheckboxes(clusters) {
  clusterContainer.innerHTML = '';

  const allLabel = document.createElement('label');
  allLabel.innerHTML = `<input type="checkbox" value="all" checked /> All Clusters`;
  clusterContainer.appendChild(allLabel);

  clusters.forEach(cluster => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${cluster}" /> ${cluster}`;
    clusterContainer.appendChild(label);
  });

  clusterContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', (e) => {
    const clickedValue = e.target.value;

    if (clickedValue === "all" && e.target.checked) {
      // Uncheck all other clusters
      clusterContainer.querySelectorAll('input[type="checkbox"]').forEach(other => {
        if (other.value !== "all") other.checked = false;
      });
    } else if (clickedValue !== "all" && e.target.checked) {
      // Uncheck "all" if any specific cluster is selected
      const allCheckbox = clusterContainer.querySelector('input[value="all"]');
      if (allCheckbox) allCheckbox.checked = false;
    }

    updatePreview();
  });
});
}

function summarizeVMs(vmData) {
  const summary = {};

  vmData.forEach(vm => {
    const cluster = vm.Cluster?.trim() || 'Unknown';
    const source = vm.SourceFile || 'Unknown File';
    const key = `${source}::${cluster}`;

    if (!summary[key]) {
      summary[key] = {
        source,
        cluster,
        vmCount: 0,
        totalCpu: 0,
        totalMemory: 0,
        totalProvisionedDisk: 0,
        totalConsumedDisk: 0
      };
    }

    summary[key].vmCount += 1;
    summary[key].totalCpu += vm.NumCpu || 0;
    summary[key].totalMemory += vm.MemoryGB || 0;
    summary[key].totalProvisionedDisk += vm.ProvisionedSpaceGB || 0;
    summary[key].totalConsumedDisk += vm.ConsumedSpaceGB || 0;
  });

  return summary;}
  



function updatePreview() {
  previewTable.innerHTML = '';
  summaryDiv.innerHTML = '';
  sizingResultsDiv.innerHTML = '';

  const excludePoweredOff = document.getElementById("excludePoweredOff")?.checked;

  // Start with all VMs, applying filters in sequence
  let filteredVMs = currentVMData.filter(vm => {
    // Exclude VMs that have Include = false
    if (vm.Include === false) return false;
    
    // Exclude powered-off VMs if checkbox is enabled
    if (excludePoweredOff && !isPoweredOn(vm)) return false;
    
    return true;
  });

  // 🔎 Apply OS filter if checkboxes exist
  const osCheckboxes = document.querySelectorAll('.os-filter:checked');
  if (osCheckboxes.length > 0) {
    const selectedOS = Array.from(osCheckboxes).map(cb => cb.value);
    filteredVMs = filteredVMs.filter(vm => selectedOS.includes(vm.GuestOS));
  }

  // Build groups based on groupingMode + selections
  let groupsToPreview = buildGroupsForMode();

  // Fallback: if no groups were built, default to all clusters
  if (!groupsToPreview || groupsToPreview.length === 0) {
    groupsToPreview = getUniqueClusters(currentVMData).map(c => ({ name: c, clusters: [c] }));
  }

  // Collect all clusters from those groups
  const allClustersInGroups = groupsToPreview.flatMap(g => g.clusters.map(c => c.trim().toLowerCase()));

  // Filter VMs down to only those clusters
  filteredVMs = filteredVMs.filter(vm =>
    allClustersInGroups.includes(vm.Cluster?.trim().toLowerCase())
  );

  currentFilteredVMs = filteredVMs;

  console.log("🔎 GroupsToPreview:", groupsToPreview.map(g => g.name));
  console.log("🔎 FilteredVMs count:", filteredVMs.length);

  // Render preview list
  const previewList = document.createElement('ul');
  previewList.style.listStyleType = 'none';
  previewList.style.paddingLeft = '0';

  groupsToPreview.forEach(group => {
    const normalizedClusters = group.clusters.map(c => c.trim().toLowerCase());

    const groupVMs = filteredVMs.filter(vm => {
      const vmCluster = vm.Cluster?.trim().toLowerCase();
      return normalizedClusters.includes(vmCluster);
    });

    const totalVMs = groupVMs.length;
    const totalCPU = groupVMs.reduce((sum, vm) => sum + vm.NumCpu, 0);
    const totalMemory = groupVMs.reduce((sum, vm) => sum + vm.MemoryGB, 0);
    const totalProvisionedDisk = groupVMs.reduce((sum, vm) => sum + vm.ProvisionedSpaceGB, 0);
    const totalConsumedDisk = groupVMs.reduce((sum, vm) => sum + vm.ConsumedSpaceGB, 0);
    const totalDisk = totalProvisionedDisk; // Default to provisioned for preview

    const groupItem = document.createElement('li');
    groupItem.innerHTML = `
      <strong>${group.name}</strong> – ${group.clusters.join(', ')}<br>
      Total VMs: ${totalVMs}<br>
      Total vCPU: ${totalCPU}<br>
      Total Memory: ${totalMemory.toFixed(1)} GB<br>
      Total Disk: ${totalDisk.toFixed(1)} GB
    `;
    previewList.appendChild(groupItem);
  });

  previewTable.appendChild(previewList);

  const groupLabel = groupsToPreview.length > 1
    ? `${groupsToPreview.length} groups/clusters`
    : `${groupsToPreview.length} group/cluster`;

  summaryDiv.innerHTML = `
    <p>✅ ${currentVMData[0]?.SourceFile || 'RVTools'}: ${currentVMData.length} VMs total</p>
    <p>Previewing ${groupLabel} across ${filteredVMs.length} powered-on VMs.</p>
  `;
}

function renderPreview(vmData, fileName, fileIndex) {
  const header = document.createElement('h5');
  header.textContent = `Summary for ${fileName}`;
  previewTable.appendChild(header);

  if (!vmData || vmData.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.textContent = 'No powered-on VMs matched the selection.';
    previewTable.appendChild(emptyMessage);
    previewTable.appendChild(document.createElement('hr'));
    return;
  }

  const summary = summarizeVMs(vmData); // vmData is already filtered
  const table = document.createElement('table');
  table.className = 'preview-table';

  const headerRow = document.createElement('tr');
  ['Site', 'Cluster', 'VMs', 'CPU', 'Memory (GB)', 'Disk (GB)'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  Object.values(summary).forEach(stats => {
    const row = document.createElement('tr');

    const siteCell = document.createElement('td');
    siteCell.textContent = stats.source;

    const clusterCell = document.createElement('td');
    clusterCell.textContent = stats.cluster;

    const vmCell = document.createElement('td');
    vmCell.textContent = stats.vmCount;

    const cpuCell = document.createElement('td');
    cpuCell.textContent = stats.totalCpu;

    const memCell = document.createElement('td');
    memCell.textContent = stats.totalMemory.toFixed(1);

    const diskCell = document.createElement('td');
    diskCell.textContent = stats.totalProvisionedDisk.toFixed(1);

    row.appendChild(siteCell);
    row.appendChild(clusterCell);
    row.appendChild(vmCell);
    row.appendChild(cpuCell);
    row.appendChild(memCell);
    row.appendChild(diskCell);

    table.appendChild(row);
  });

  previewTable.appendChild(table);

  const divider = document.createElement('hr');
  divider.style.marginTop = '24px';
  divider.style.marginBottom = '24px';
  previewTable.appendChild(divider);
}

function runSizing() {
  sizingResultsDiv.innerHTML = '';
  sizingResults = [];

  const growthPct = parseFloat(document.getElementById('growthFactor').value) || 0;
  const haLevel = document.getElementById('haLevel').value;
  const excludePoweredOff = document.getElementById("excludePoweredOff")?.checked;

  // Build groups based on groupingMode + selections
  let groupsToSize = buildGroupsForMode();

  // Fallback: if no groups were built, default to all clusters (per-cluster)
  if (!groupsToSize || groupsToSize.length === 0) {
    groupsToSize = getUniqueClusters(currentVMData).map(c => ({ name: c, clusters: [c] }));
  }

  // Safety: if preview never ran, derive filtered VMs from groups here
  if (!currentFilteredVMs || currentFilteredVMs.length === 0) {
    let poweredVMs = currentVMData.filter(vm => excludePoweredOff ? isPoweredOn(vm) : true);

    // 🔎 Apply OS filter
    const osCheckboxes = document.querySelectorAll('.os-filter:checked');
    if (osCheckboxes.length > 0) {
      const selectedOS = Array.from(osCheckboxes).map(cb => cb.value);
      poweredVMs = poweredVMs.filter(vm => selectedOS.includes(vm.GuestOS));
    }

    const allClustersInGroups = groupsToSize
      .flatMap(g => g.clusters.map(c => c.trim().toLowerCase()));

    currentFilteredVMs = poweredVMs.filter(vm =>
      allClustersInGroups.includes(vm.Cluster?.trim().toLowerCase())
    );
  }

  console.log("🔎 Groups to size:", groupsToSize.map(g => g.name));
  console.log("🔎 CurrentFilteredVMs count:", currentFilteredVMs.length);

  groupsToSize.forEach(group => {
    const normalizedClusters = group.clusters.map(c => c.trim().toLowerCase());

    // Partition VMs by site (file/source)
    const vmsBySite = {};
    currentFilteredVMs.forEach(vm => {
      const site = vm.SourceFile || 'Unknown File';
      const vmCluster = vm.Cluster?.trim().toLowerCase();
      if (normalizedClusters.includes(vmCluster)) {
        if (!vmsBySite[site]) vmsBySite[site] = [];
        vmsBySite[site].push(vm);
      }
    });

    Object.entries(vmsBySite).forEach(([site, vms]) => {
      if (vms.length === 0) return;

      // Aggregate VM totals
      const totalVcpu = vms.reduce((sum, vm) => sum + vm.NumCpu, 0);
      const totalRAM = vms.reduce((sum, vm) => sum + vm.MemoryGB, 0);

      // Get selected storage calculation method
      const storageMethod = document.querySelector('input[name="storageMethod"]:checked')?.value || 'provisioned';
      const provisionedDiskGB = vms.reduce((sum, vm) => sum + vm.ProvisionedSpaceGB, 0);
      const consumedDiskGB = vms.reduce((sum, vm) => sum + vm.ConsumedSpaceGB, 0);
      const selectedDiskGB = storageMethod === 'consumed' ? consumedDiskGB : provisionedDiskGB;
      const totalDisk = selectedDiskGB / 1024; // TiB

      console.log(`📊 Storage - Provisioned: ${provisionedDiskGB.toFixed(1)} GB, Consumed: ${consumedDiskGB.toFixed(1)} GB, Using: ${storageMethod} (${selectedDiskGB.toFixed(1)} GB)`);

      // Match hosts for this site + cluster(s)
      const matchingHosts = currentHostData.filter(host =>
        normalizedClusters.includes(host.Cluster?.trim().toLowerCase()) &&
        host.SourceFile === site
      );

      const hostCount = matchingHosts.length;
      const totalPhysicalCores = matchingHosts.reduce((sum, host) => sum + host.totalCores, 0);
      const totalUsageWeighted = matchingHosts.reduce((sum, host) => sum + (host.totalCores * host.cpuUsage), 0);
      const totalCores = matchingHosts.reduce((sum, host) => sum + host.totalCores, 0);
      const avgCpuUsage = totalCores > 0 ? totalUsageWeighted / totalCores : 0;



      // CPU estimation based on observed vCPU/core and usage
      const vcpuCoreRatio = totalPhysicalCores > 0 ? totalVcpu / totalPhysicalCores : 1;
      const adjustedVcpuDemand = totalVcpu * (avgCpuUsage / 100);
      const estimatedPhysicalCPU = Math.ceil((adjustedVcpuDemand / vcpuCoreRatio) * (1 + growthPct / 100));
      const finalCPU = Math.max(estimatedPhysicalCPU, 1);

      console.group(`🧠 CPU Estimation Debug`);
console.log("🔍 Total vCPU:", totalVcpu);
console.log("🔍 Matching Hosts:", matchingHosts.length);
console.log("🔍 Total Physical Cores:", totalPhysicalCores);
console.log("🔍 Avg CPU Usage:", avgCpuUsage);
console.log("🔍 vCPU/Core Ratio:", vcpuCoreRatio);
console.log("🔍 Adjusted vCPU Demand:", adjustedVcpuDemand);
console.groupEnd();

      // Calculate adjusted RAM and storage for payload
      const adjustedTotalRAM = Math.ceil(totalRAM * (1 + growthPct / 100));
      const adjustedTotalStorage = totalDisk * (1 + growthPct / 100);

      const forcedCpuModel = document.getElementById("cpuOverrideSelect")?.value;

      // Try multiple chassis and pick the one with minimum nodes (batch sizing preference)
      // Always try all chassis: let sizing engine decide what's viable
      const chassisModelsToTry = ['AX-4510c', 'AX 760', 'AX 770'];

      let result = null;
      let sizingAttempts = [];

      for (const chassis of chassisModelsToTry) {
        try {
          const testPayload = {
            totalCPU: finalCPU,
            totalRAM: adjustedTotalRAM,
            totalStorage: adjustedTotalStorage,
            haLevel,
            growthPct: growthPct / 100,
            chassisModel: chassis,
            disableSweetSpot: true  // Batch sizing: minimize node count
          };

          if (forcedCpuModel) {
            testPayload.cpuModel = forcedCpuModel;
          }

          const testResult = sizeCluster(testPayload);
          console.log(`   ✓ ${chassis}: ${testResult.nodeCount} nodes`);
          sizingAttempts.push(testResult);
        } catch (err) {
          console.warn(`   ⚠️ ${chassis} failed: ${err.message}`);
        }
      }

      if (sizingAttempts.length === 0) {
        throw new Error(`Failed to size cluster with any chassis model`);
      }

      // Select the configuration with minimum nodes (batch sizing preference)
      sizingAttempts.sort((a, b) => {
        // Primary: fewer nodes
        if (a.nodeCount !== b.nodeCount) return a.nodeCount - b.nodeCount;
        // Tiebreaker: prefer AX-4510c > AX-760 > AX-770
        const order = { 'AX-4510c': 0, 'AX 760': 1, 'AX 770': 2 };
        return (order[a.chassisModel] || 99) - (order[b.chassisModel] || 99);
      });

      result = sizingAttempts[0];
      console.log(`   ✅ Selected: ${result.chassisModel} with ${result.nodeCount} nodes (batch preference)`);


      sizingResults.push({
        clusterName: `${site} / ${group.name}`,
        vmCount: vms.length,
        totalVcpu,
        totalRamGB: adjustedTotalRAM,
        totalDiskTiB: adjustedTotalStorage,
        hostCount,
        avgCpuUsage,
        vcpuCoreRatio,
        totalCPU: finalCPU,
        recommendedNodes: result.nodeCount,
        ...result
      });

      const resultHTML = `
        <div class="cluster-result">
          <h5>${site} / ${group.name}</h5>

          <h5>📋 Requirements</h5>
          <ul>
            <li>VMs: ${vms.length}</li>
            <li>Total vCPU: ${totalVcpu}</li>
            <li>Total RAM: ${adjustedTotalRAM} GB</li>
            <li>Total Disk: ${adjustedTotalStorage.toFixed(1)} TiB</li>
            <li>Hosts: ${hostCount}</li>
            <li>Avg CPU Usage: ${avgCpuUsage.toFixed(1)}%</li>
            <li>vCPU/Core Ratio: ${vcpuCoreRatio.toFixed(2)}</li>
            <li>Estimated Physical CPU: ${finalCPU}</li>
          </ul>

          <h5>⚙️ Recommended Configuration</h5>
          <ul>
            <li>Required Nodes: ${result.nodeCount}</li>
            <li>CPU Model – ${result.cpuModel} – ${result.cpuCoresPerSocket} core, ${result.cpuClockGHz} GHz</li>
            <li>Total Cores (all nodes): ${result.totalCores}</li>
            <li>Memory Config: ${result.memoryConfig}</li>
            <li>Disk Config: ${result.disksPerNode} × ${result.diskSizeTB} TB</li>
            <li>Resiliency: ${result.resiliency}</li>
            <li>Usable Storage (TiB): ${result.usableTiB}</li>
            <li>CPU Utilization: ${result.efficiency?.cpuUtilization}</li>
            <li>Memory Utilization: ${result.efficiency?.memoryUtilization}</li>
            <li>Post-Failure Cores: ${result.totalClusterResources?.postFailure?.usableCores}</li>
<li>Post-Failure RAM (GB): ${result.totalClusterResources?.postFailure?.usableMemoryGB}</li>
          </ul>
        </div>
      `;
      sizingResultsDiv.innerHTML += resultHTML;
    });
  });

  console.log("📊 Final sizing results:", sizingResults);
}
function exportSizingSummaryToExcel(results) {
  if (!results || results.length === 0) {
    console.warn("⚠️ No sizing results available for export.");
    return;
  }

  const exportData = results.map(result => ({
    Cluster: result.clusterName,
    VM_Count: result.vmCount,
    Total_vCPU: result.totalVcpu,
    Total_RAM_GB: result.totalRamGB,
    Total_Disk_TiB: result.totalDiskTiB,
    Current_Hosts: result.hostCount,
    Avg_CPU_Usage: (result.avgCpuUsage / 100).toFixed(2),
    vCPU_Core_Ratio: result.vcpuCoreRatio,
    Estimated_Physical_CPU: result.totalCPU,
    Required_Nodes: result.nodeCount,
    CPU_Model: result.cpuModel,
    Cores_per_Socket: result.cpuCoresPerSocket,
    Clock_GHz: result.cpuClockGHz,
    Memory_Config: result.memoryConfig,
    Disk_Config: `${result.disksPerNode} × ${result.diskSizeTB} TB`,
    Resiliency: result.resiliency,
    Usable_Storage_TiB: result.usableTiB,
    CPU_Utilization: result.efficiency?.cpuUtilization,
    Memory_Utilization: result.efficiency?.memoryUtilization,
    PostFailure_Cores: result.totalClusterResources?.postFailure?.usableCores,
PostFailure_RAM_GB: result.totalClusterResources?.postFailure?.usableMemoryGB
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const headerKeys = Object.keys(exportData[0]);
headerKeys.forEach((key, index) => {
  const cellRef = XLSX.utils.encode_cell({ r: 0, c: index });
  if (!worksheet[cellRef]) return;

  worksheet[cellRef].s = {
    font: { bold: true }
  };
});
const defaultName = "SizingSummary";
const userFilename = prompt("Enter a name for your export file:", defaultName);

if (!userFilename) {
  console.warn("⚠️ Export cancelled — no filename provided.");
  return;
}

const exportFilename = `${userFilename}.xlsx`;  

const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sizing Summary");

  XLSX.writeFile(workbook, exportFilename);
}

document.addEventListener("DOMContentLoaded", populateCpuOverrideDropdown);