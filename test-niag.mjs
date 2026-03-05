import { sizeCluster } from './js/sizingEngine.js';

async function testNIAGPSCBatch() {
  const clusterName = 'NIAG-PSC';
  const vmCount = 10;
  const inUseVCPU = 38;
  const inUseRAM = 25;
  const inUseDisk = 3.998538684844971;
  const p2vRatio = 2.375;
  
  // Calculate physical cores (same as batch-sizing.js)
  const inTheCpuCores = Math.round(inUseVCPU / p2vRatio);
  
  const haLevel = 'n+1';
  
  const payload = {
    totalCPU: inTheCpuCores,
    totalRAM: inUseRAM,
    totalStorage: inUseDisk,
    growthPct: 0,
    haLevel: haLevel,
    chassisModel: 'AX-4510c'
  };
  
  console.log(`=== NIAG-PSC Batch Sizing Test ===`);
  console.log(`Input: ${vmCount} VMs, ${inUseVCPU} vCPU, P2V=${p2vRatio}`);
  console.log(`Calculated Physical Cores: ${inTheCpuCores}`);
  console.log(`RAM: ${inUseRAM} GB, Disk: ${inUseDisk} TB`);
  console.log(`HA Level: ${haLevel}`);
  console.log(`\nTrying all chassis models and preferring fewer nodes...`);
  
  const chassisModelsToTry = vmCount <= 10 
    ? ['AX-4510c', 'AX 760', 'AX 770']
    : ['AX 760', 'AX 770'];
  
  let sizingResults = [];
  
  for (const model of chassisModelsToTry) {
    try {
      const testPayload = { ...payload, chassisModel: model };
      console.log(`\n🔧 Sizing with ${model}...`);
      const result = sizeCluster(testPayload);
      console.log(`✅ ${model} succeeded: ${result.nodeCount} nodes`);
      sizingResults.push(result);
    } catch (err) {
      console.log(`❌ ${model} failed: ${err.message}`);
    }
  }
  
  if (sizingResults.length === 0) {
    console.log(`\n❌ FAILED: No viable chassis model found!`);
    return;
  }
  
  // BATCH MODE: prefer fewer nodes
  sizingResults.sort((a, b) => a.nodeCount - b.nodeCount);
  const sizingResult = sizingResults[0];
  
  console.log(`\n=== FINAL RESULT (Batch Mode - Fewest Nodes Preferred) ===`);
  console.log(`Chassis: ${sizingResult.chassisModel}`);
  console.log(`Nodes: ${sizingResult.nodeCount}`);
  console.log(`CPU: ${sizingResult.cpuModel}`);
  console.log(`Memory: ${sizingResult.memorySizeGB} GB total`);
  console.log(`Disks: ${sizingResult.disksPerNode} × ${sizingResult.diskSizeTB} TB per node`);
  console.log(`Total Usable Cores: ${sizingResult.totalUsableCores}`);
  console.log(`Total Usable Memory: ${sizingResult.totalUsableMemory} GB`);
  console.log(`Total Usable Storage: ${sizingResult.usableTiB} TiB`);
}

testNIAGPSCBatch().catch(err => console.error('Test error:', err));
