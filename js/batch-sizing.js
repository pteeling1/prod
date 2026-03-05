import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs';
import { sizeCluster } from './sizingEngine.js';

/**
 * Batch sizing tool for reading Excel files with multiple system requirements
 * and automatically sizing each cluster using the sizing engine.
 */

export async function loadAndProcessBatchFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array' });
        const results = processBatchWorkbook(workbook);
        resolve(results);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function processBatchWorkbook(workbook) {
  const allResults = [];
  
  // Process each sheet
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 Processing sheet: "${sheetName}" with ${data.length} rows`);
    
    const sheetResults = processSheetData(data, sheetName);
    allResults.push({
      sheetName,
      results: sheetResults
    });
  });
  
  return allResults;
}

function processSheetData(rows, sheetName) {
  const results = [];
  
  if (rows.length === 0) {
    console.warn(`⚠️ Sheet "${sheetName}" has no data rows`);
    return results;
  }
  
  // Get first row to debug column names
  const firstRow = rows[0];
  const actualColumns = Object.keys(firstRow);
  console.log(`📋 Sheet "${sheetName}" columns:`, actualColumns);
  console.log(`📊 First data row:`, firstRow);
  
  // Try to find column names with flexible matching
  function findColumn(row, ...possibleNames) {
    for (const name of possibleNames) {
      // Exact match
      if (name in row) {
        const val = row[name];
        if (val !== undefined && val !== null && val !== '') {
          return val;
        }
      }
      // Case-insensitive match
      const key = Object.keys(row).find(k => k.toLowerCase().trim() === name.toLowerCase().trim());
      if (key) {
        const val = row[key];
        if (val !== undefined && val !== null && val !== '') {
          return val;
        }
      }
    }
    return null;
  }
  
  rows.forEach((row, idx) => {
    try {
      // Extract input columns with flexible naming
      const clusterName = findColumn(row, 'Cluster', 'System', 'Name') || `Row ${idx + 2}`;
      const vmCount = parseInt(findColumn(row, 'VM Count', 'VMs', 'VM_Count') || 0) || 0;
      const customerNodes = parseInt(findColumn(row, 'Nodes', 'Node Count') || 1) || 1;
      const inUseVCPU = parseInt(findColumn(row, 'In Use vCPU', 'In the vCPU', 'In the CPU', 'vCPU', 'Cores') || 0) || 0;
      const p2vRatio = parseFloat(findColumn(row, 'P2V Core Ratio', 'P2V Ratio', 'Core Ratio') || 1) || 1;
      const inTheRamGB = parseInt(findColumn(row, 'In Use RAM (GB)', 'In the RAM (GB)', 'In the RAM', 'RAM', 'RAM (GB)') || 0) || 0;
      const inTheDiskTB = parseFloat(findColumn(row, 'In Use Disk (TB)', 'In the Disk (TB)', 'In the Disk', 'Disk', 'Storage', 'Disk (TB)') || 0) || 0;
      
      // Calculate physical cores from vCPU and P2V ratio
      // P2V ratio = vCPU per physical core, so divide vCPU by ratio to get physical cores
      const inTheCpuCores = Math.round(inUseVCPU / p2vRatio);
      
      // Debug: log what we extracted
      console.log(`   → ${clusterName}: VMs=${vmCount}, nodes=${customerNodes}, vCPU=${inUseVCPU}, P2V=${p2vRatio}, Physical Cores=${inTheCpuCores}, ram=${inTheRamGB}GB, disk=${inTheDiskTB}TB`);
      
      // Skip if no requirements specified
      if (inTheCpuCores === 0 && inTheRamGB === 0 && inTheDiskTB === 0) {
        console.log(`⏭️  Skipping ${clusterName} - no requirements (cores: ${inTheCpuCores}, ram: ${inTheRamGB}, disk: ${inTheDiskTB})`);
        return;
      }
      
      // Determine chassis model based on VM count preference with fallback chain
      let chassisModel = 'AX 770'; // Default fallback for larger deployments
      if (vmCount <= 10) {
        chassisModel = 'AX-4510c'; // Prefer 4510c for small clusters (≤10 VMs)
      }
      
      // Determine HA level based on customer's chosen node count
      let haLevel = 'n+1'; // Default: redundancy for multi-node
      if (customerNodes === 1) {
        haLevel = 'n'; // Single node: no redundancy
      }
      
      // Build sizing payload
      const payload = {
        totalCPU: inTheCpuCores,
        totalRAM: inTheRamGB,
        totalStorage: inTheDiskTB,
        growthPct: 0,
        haLevel: haLevel,
        chassisModel: chassisModel,
        disableSweetSpot: true  // Batch sizing: minimize node count, disable sweet spot bonus
      };
      
      // Run sizing engine with chassis fallback: AX-4510c → AX-760 → AX-770
      // For batch mode: collect ALL viable results and prefer fewer nodes
      let sizingResults = [];  // Collect all successful results
      const chassisModelsToTry = vmCount <= 10 
        ? ['AX-4510c', 'AX 760', 'AX 770']  // Small clusters: try 4510c first, then fallback
        : ['AX 760', 'AX 770'];              // Larger clusters: try 760 first, then 770
      
      for (const model of chassisModelsToTry) {
        try {
          const testPayload = { ...payload, chassisModel: model };
          console.log(`🔧 Sizing ${clusterName} using ${model} (${haLevel}): ${inTheCpuCores}c, ${inTheRamGB}GB, ${inTheDiskTB}TB`);
          const result = sizeCluster(testPayload);
          console.log(`   → Result: nodes=${result.nodeCount}, model=${result.chassisModel}, ha=${result.haLevel}`);
          sizingResults.push(result);
        } catch (err) {
          console.warn(`   ⚠️ ${model} sizing failed: ${err.message}`);
        }
      }
      
      // For batch sizing: prefer fewer nodes
      if (sizingResults.length === 0) {
        throw new Error(`Failed to size ${clusterName} with any available chassis model`);
      }
      
      // Sort by node count (ascending), prefer smaller deployments
      sizingResults.sort((a, b) => a.nodeCount - b.nodeCount);
      const sizingResult = sizingResults[0];
      const finalChassisModel = sizingResult.chassisModel;
      
      console.log(`   ✅ Selected ${finalChassisModel} with ${sizingResult.nodeCount} nodes (preferred for batch)`);
      
      
      results.push({
        clusterName,
        input: {
          vmCount,
          customerNodes,
          vCPU: inUseVCPU,
          p2vRatio: p2vRatio,
          cores: inTheCpuCores,
          ramGB: inTheRamGB,
          storageTB: inTheDiskTB
        },
        output: sizingResult,
        status: 'success'
      });
      
    } catch (err) {
      const clusterName = row['Cluster'] || `Row ${idx + 2}`;
      console.error(`❌ Error sizing ${clusterName}:`, err.message);
      results.push({
        clusterName,
        input: row,
        error: err.message,
        status: 'failed'
      });
    }
  });
  
  return results;
}

/**
 * Export batch sizing results to Excel file
 */
export function exportBatchResultsToExcel(allResults, filename = 'sizing-results.xlsx') {
  const workbook = XLSX.utils.book_new();
  
  allResults.forEach(({ sheetName, results }) => {
    // Create a new worksheet for results
    const rows = [];
    
    // Header row
    rows.push([
      'Cluster',
      'Status',
      'Customer VMs',
      'Customer Nodes',
      'Input vCPU',
      'P2V Core Ratio',
      'Input Physical Cores',
      'Input RAM (GB)',
      'Input Storage (TB)',
      'Recommended Model',
      'Recommended Nodes',
      'Recommended CPU',
      'Total Cores',
      'RAM Config',
      'Usable RAM (GB)',
      'Drives (Qty × Size TB)',
      'Usable Storage (TiB)',
      'CPU Utilization %',
      'Memory Utilization %',
      'Storage Utilization %',
      'Error',
      'Environment'
    ]);
    
    // Data rows
    results.forEach(result => {
      const { clusterName, input, output, status, error } = result;
        
        let cpuUtil = 'N/A';
        let memUtil = 'N/A';
        let storageUtil = 'N/A';
        let drivesFormat = 'N/A';
        
        if (status === 'success' && output) {
          // CPU utilization
          if (output.totalUsableCores > 0) {
            cpuUtil = ((input.cores / output.totalUsableCores) * 100).toFixed(1) + '%';
          }
          
          // Memory utilization from output
          memUtil = output.efficiency?.memoryUtilization || 'N/A';
          
          // Calculate storage utilization
          if (output.usableTiB > 0) {
            storageUtil = ((input.storageTB / output.usableTiB) * 100).toFixed(1) + '%';
          }
          
          // Format drives
          const totalDrives = (output.disksPerNode || 0) * (output.nodeCount || 0);
          if (totalDrives > 0) {
            drivesFormat = `${totalDrives} × ${output.diskSizeTB || 'N/A'} TB`;
          }
        }
        
        rows.push([
          clusterName,
          status,
          input.vmCount || '',
          input.customerNodes || '',
          input.vCPU || '',
          input.p2vRatio || '',
          input.cores || '',
          input.ramGB || '',
          input.storageTB || '',
          output?.chassisModel || '',
          output?.nodeCount || '',
          output?.cpuModel ? `${output.cpuModel} (${output.cpuCoresPerSocket} cores)` : '',
          output?.totalUsableCores || '',
          output?.memoryConfig || '',
          output?.totalUsableMemory || '',
          drivesFormat,
          output?.usableTiB?.toFixed(2) || '',
          cpuUtil,
          memUtil,
          storageUtil,
          error || '',
          sheetName
        ]);
    });
    
    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });
  
  // Generate and trigger download
  XLSX.writeFile(workbook, filename);
  console.log(`✅ Results exported to ${filename}`);
}

/**
 * Create a simple UI element for batch sizing
 */
export function createBatchSizingUI(containerSelector = '#batchSizingContainer') {
  const container = document.querySelector(containerSelector);
  if (!container) {
    console.warn(`Container ${containerSelector} not found`);
    return;
  }
  
  container.innerHTML = `
    <div class="card">
      <div class="card-header bg-info text-white">
        <h5 class="mb-0">🚀 Batch Sizing</h5>
      </div>
      <div class="card-body">
        <p class="text-muted">Upload an Excel file with multiple clusters to size automatically.</p>
        
        <div class="mb-3">
          <label for="batchFileInput" class="form-label">Select Excel File:</label>
          <input type="file" class="form-control" id="batchFileInput" accept=".xls,.xlsx,.csv">
        </div>
        
        <button id="processBatchBtn" class="btn btn-primary" disabled>
          Process Batch Sizing
        </button>
        <button id="exportResultsBtn" class="btn btn-success" disabled style="margin-left: 10px;">
          Export Results to Excel
        </button>
        
        <div id="batchProgress" class="mt-3" style="display: none;">
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <span id="progressText" style="margin-left: 10px;">Processing...</span>
        </div>
        
        <div id="batchResults" class="mt-4" style="display: none;">
          <h6>Results Summary:</h6>
          <table id="batchResultsTable" class="table table-sm table-striped">
            <thead>
              <tr>
                <th>Cluster</th>
                <th>Status</th>
                <th>Model</th>
                <th>Nodes</th>
                <th>CPU</th>
                <th>Total Cores</th>
                <th>RAM Config</th>
                <th>Usable RAM (GB)</th>
                <th>Drives</th>
                <th>Usable Storage (TiB)</th>
                <th>CPU %</th>
                <th>Memory %</th>
                <th>Storage %</th>
              </tr>
            </thead>
            <tbody id="batchResultsBody">
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  
  // Wire up event handlers
  const fileInput = document.getElementById('batchFileInput');
  const processBatchBtn = document.getElementById('processBatchBtn');
  const exportResultsBtn = document.getElementById('exportResultsBtn');
  const progressDiv = document.getElementById('batchProgress');
  const resultsDiv = document.getElementById('batchResults');
  const resultsBody = document.getElementById('batchResultsBody');
  
  let batchResults = null;
  
  fileInput.addEventListener('change', () => {
    processBatchBtn.disabled = !fileInput.files.length;
  });
  
  processBatchBtn.addEventListener('click', async () => {
    if (!fileInput.files[0]) return;
    
    progressDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
    processBatchBtn.disabled = true;
    
    try {
      const results = await loadAndProcessBatchFile(fileInput.files[0]);
      batchResults = results;
      
      // Display results grouped by environment
      resultsBody.innerHTML = '';
      let totalSuccess = 0;
      let totalFailed = 0;
      
      // Group results by environment (sheetName)
      const groupedByEnv = {};
      results.forEach(({ sheetName, results: sheetResults }) => {
        if (!groupedByEnv[sheetName]) {
          groupedByEnv[sheetName] = [];
        }
        groupedByEnv[sheetName].push(...sheetResults);
      });
      
      // Display each environment with header divider
      Object.entries(groupedByEnv).forEach(([envName, envResults]) => {
        // Add environment header row
        const headerRow = `
          <tr style="background-color: #e8f4f8; font-weight: bold; height: 32px;">
            <td colspan="13" style="padding: 8px; border-top: 2px solid #0066cc; border-bottom: 2px solid #0066cc;">
              📌 Environment: ${envName}
            </td>
          </tr>
        `;
        resultsBody.innerHTML += headerRow;
        
        // Add results for this environment
        envResults.forEach(result => {
          if (result.status === 'success') {
            totalSuccess++;
            const output = result.output;
            const input = result.input;
            
            // Calculate CPU utilization %
            const cpuUtilization = output?.totalUsableCores > 0 
              ? ((input.cores / output.totalUsableCores) * 100).toFixed(1)
              : 'N/A';
            
            // Calculate storage utilization %
            const storageUtilization = output?.usableTiB > 0 
              ? ((input.storageTB / output.usableTiB) * 100).toFixed(1)
              : 'N/A';
            
            // Format drives: "qty x size TB" for all nodes
            const totalDrives = (output?.disksPerNode || 0) * (output?.nodeCount || 0);
            const drivesFormat = totalDrives > 0 
              ? `${totalDrives} × ${output?.diskSizeTB || 'N/A'} TB`
              : 'N/A';
            
            const row = `
              <tr class="table-success">
                <td>${result.clusterName}</td>
                <td>✅ Success</td>
                <td>${output?.chassisModel || 'N/A'}</td>
                <td>${output?.nodeCount || 'N/A'}</td>
                <td>${output?.cpuModel ? `${output.cpuModel} (${output.cpuCoresPerSocket} cores)` : 'N/A'}</td>
                <td>${output?.totalUsableCores || 'N/A'}</td>
                <td>${output?.memoryConfig || 'N/A'}</td>
                <td>${output?.totalUsableMemory || 'N/A'}</td>
                <td>${drivesFormat}</td>
                <td>${output?.usableTiB?.toFixed(2) || 'N/A'}</td>
                <td>${cpuUtilization}%</td>
                <td>${output?.efficiency?.memoryUtilization || 'N/A'}</td>
                <td>${storageUtilization}%</td>
              </tr>
            `;
            resultsBody.innerHTML += row;
          } else {
            totalFailed++;
            const row = `
              <tr class="table-danger">
                <td>${result.clusterName}</td>
                <td>❌ Failed</td>
                <td colspan="11">${result.error}</td>
              </tr>
            `;
            resultsBody.innerHTML += row;
          }
        });
      });
      
      progressDiv.style.display = 'none';
      resultsDiv.style.display = 'block';
      exportResultsBtn.disabled = false;
      
      console.log(`✅ Batch sizing complete: ${totalSuccess} success, ${totalFailed} failed`);
      
    } catch (err) {
      console.error('Batch sizing error:', err);
      progressDiv.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    } finally {
      processBatchBtn.disabled = false;
    }
  });
  
  exportResultsBtn.addEventListener('click', () => {
    if (batchResults) {
      exportBatchResultsToExcel(batchResults);
    }
  });
}
