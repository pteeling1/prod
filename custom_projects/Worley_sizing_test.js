// Test script to run Worley sizing data through AX Calculator sizing engine
// Usage: node Worley_sizing_test.js

import { sizeCluster } from './js/sizingEngine.js';
import fs from 'fs';

// Load test data
const testData = JSON.parse(fs.readFileSync('./Worley_sizing_test.json', 'utf8'));

console.log('🔍 Running Worley Sizing Data through AX Calculator Engine\n');
console.log('═'.repeat(100));

const results = [];

for (const cluster of testData.clusters) {
  try {
    // Convert units
    const totalRAMGB = cluster.totalMemoryTiB * 1024;
    const totalStorageTiB = cluster.storageUsedTiB;
    
    // Build sizing request
    const req = {
      totalCPU: cluster.totalCores,
      totalGHz: 0, // Use cores, not GHz
      totalRAM: totalRAMGB,
      totalStorage: totalStorageTiB,
      haLevel: 'n+1',
      chassisModel: 'AX 770',
      growthPct: 0,
      switchMode: 'separate'
    };

    console.log(`\n📍 ${cluster.location} - ${cluster.name} (${cluster.type})`);
    console.log(`   Input: ${cluster.totalCores} cores, ${cluster.totalMemoryTiB}TB RAM, ${cluster.storageUsedTiB}TB storage`);

    const result = sizeCluster(req);

    console.log(`   ✅ Result: ${result.nodeCount} nodes (${result.clusterCount} cluster(s))`);
    console.log(`      CPU: ${result.cpuModel} (${result.cpuCoresPerSocket} cores @ ${result.cpuClockGHz} GHz)`);
    console.log(`      Memory: ${result.memorySizeGB}GB per node`);
    console.log(`      Storage: ${result.usableTiB} TiB usable`);
    console.log(`      Efficiency: CPU ${result.efficiency.cpuUtilization}, Memory ${result.efficiency.memoryUtilization}`);

    results.push({
      cluster: cluster.name,
      location: cluster.location,
      type: cluster.type,
      input: {
        cores: cluster.totalCores,
        gHz: cluster.totalGHz,
        memoryTiB: cluster.totalMemoryTiB,
        storageTiB: cluster.storageUsedTiB
      },
      output: {
        nodeCount: result.nodeCount,
        clusterCount: result.clusterCount,
        cpuModel: result.cpuModel,
        memoryGB: result.memorySizeGB,
        usableTiB: result.usableTiB,
        cpuUtil: result.efficiency.cpuUtilization,
        memUtil: result.efficiency.memoryUtilization
      }
    });

  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    results.push({
      cluster: cluster.name,
      location: cluster.location,
      error: err.message
    });
  }
}

console.log('\n' + '═'.repeat(100));
console.log('\n📊 Summary Report:');
console.log(JSON.stringify(results, null, 2));

// Write results to file
fs.writeFileSync('./Worley_sizing_results.json', JSON.stringify(results, null, 2));
console.log('\n✅ Results saved to Worley_sizing_results.json');
