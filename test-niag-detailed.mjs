#!/usr/bin/env node

// Import the sizing engine
import { sizeCluster } from './js/sizingEngine.js';

// NIAG-PSC test case: 10 VMs, 38 vCPU, 25 GB RAM, 3.998 TB storage, P2V=2.375
// Physical cores = 38 / 2.375 = 15.99 ≈ 16 cores

const niag_psc_payload = {
  totalCPU: 16,          // Physical cores from 38 vCPU / 2.375 P2V
  totalRAM: 25,          // GB
  totalStorage: 3.998,   // TiB (passed as-is from batch input which is in TB)
  growthPct: 0,
  haLevel: 'n+1',
  chassisModel: 'AX-4510c'
};

console.log('\n📊 NIAG-PSC Detailed Sizing Test');
console.log('='.repeat(60));
console.log('INPUT REQUIREMENTS:');
console.log(`  Physical Cores Required: 16 (from 38 vCPU / 2.375 P2V ratio)`);
console.log(`  RAM Required: 25 GB`);
console.log(`  Storage Required: 3.998 TiB`);
console.log(`  HA Level: N+1 (must survive single node failure)`);
console.log(`  Chassis: AX-4510c (1U, single-socket Xeon D, max 512GB RAM, max 4 disks)`);
console.log('='.repeat(60));

try {
  const result = sizeCluster(niag_psc_payload);
  
  console.log('\n✅ SIZING RESULT:');
  console.log(`  Nodes: ${result.nodeCount}`);
  console.log(`  Chassis: ${result.chassisModel}`);
  console.log(`  CPU: ${result.cpu.model} (${result.cpu.cores} cores/socket)`);
  console.log(`  Memory: ${result.memoryConfig.totalGB}GB per node (${result.memoryConfig.dimmCount} × ${result.memoryConfig.dimmSize}GB)`);
  console.log(`  Disk: ${result.diskConfig.disksPerNode} × ${result.diskConfig.diskSizeTB}TB per node (${result.diskConfig.usableTiB.toFixed(2)} TiB usable)`);
  
} catch (err) {
  console.error('\n❌ SIZING FAILED:', err.message);
}

// Now let's manually trace constraint checking for 2 vs 3 nodes
console.log('\n' + '='.repeat(60));
console.log('MANUAL CONSTRAINT ANALYSIS');
console.log('='.repeat(60));

console.log('\n🔴 2-NODE SCENARIO (AX-4510c with D-2788CX 20-core):');
console.log('CPU Constraint (N+1 survivability):');
console.log('  Formula: (nodes - 1) × coresPerNode - SYS_CPU >= requiredCores');
console.log('  Calc: (2 - 1) × 20 - 4 = 20 - 4 = 16 cores');
console.log('  Required: 16 cores');
console.log('  Result: 16 >= 16 ✓ PASSES');

console.log('\nMemory Constraint (N+1 with 512GB max per node):');
console.log('  Formula: (nodes - 1) × (nodeMemory × 0.96) >= adjustedRAM');
console.log('  Calc: (2 - 1) × (512 × 0.96) = 1 × 491.52 = 491.52 GB');
console.log('  Required (adjusted): 25 / 0.60 = 41.67 GB');
console.log('  Result: 491.52 >= 41.67 ✓ PASSES');

console.log('\nDisk Constraint (2-way resiliency for 2 nodes):');
console.log('  Max disks per node: 4');
console.log('  Max drive size: 3.84 TB');
console.log('  Calc raw: 2 nodes × 4 disks × 3.84 TB = 30.72 TB');
console.log('  Reserved (1 disk per node, min 1, max 4): 2 × 3.84 = 7.68 TB');
console.log('  Usable after reserve: 30.72 - 7.68 = 23.04 TB');
console.log('  With 2-way resiliency: 23.04 / 2 = 11.52 TB = 10.44 TiB');
console.log('  Required: 3.998 TiB');
console.log('  Result: 10.44 >= 3.998 ✓ PASSES');

console.log('\n🟢 3-NODE SCENARIO (AX-4510c with D-2788CX 20-core):');
console.log('CPU Constraint (N+1 survivability):');
console.log('  Formula: (nodes - 1) × coresPerNode - SYS_CPU >= requiredCores');
console.log('  Calc: (3 - 1) × 20 - 4 = 40 - 4 = 36 cores');
console.log('  Required: 16 cores');
console.log('  Result: 36 >= 16 ✓ PASSES');

console.log('\nMemory Constraint (N+1 with 512GB max per node):');
console.log('  Formula: (nodes - 1) × (nodeMemory × 0.96) >= adjustedRAM');
console.log('  Calc: (3 - 1) × (512 × 0.96) = 2 × 491.52 = 983.04 GB');
console.log('  Required (adjusted): 41.67 GB');
console.log('  Result: 983.04 >= 41.67 ✓ PASSES');

console.log('\nDisk Constraint (3-way resiliency for 3+ nodes):');
console.log('  Max disks per node: 4');
console.log('  Max drive size: 3.84 TB');
console.log('  Calc raw: 3 nodes × 4 disks × 3.84 TB = 46.08 TB');
console.log('  Reserved: 3 × 3.84 = 11.52 TB');
console.log('  Usable after reserve: 46.08 - 11.52 = 34.56 TB');
console.log('  With 3-way resiliency: 34.56 / 3 = 11.52 TB = 10.44 TiB');
console.log('  Required: 3.998 TiB');
console.log('  Result: 10.44 >= 3.998 ✓ PASSES');

console.log('\n' + '='.repeat(60));
console.log('ANALYSIS: Both 2 and 3 nodes should pass all constraints!');
console.log('Check console output above for why sizing engine chose 3 nodes.');
console.log('Likely reasons:');
console.log('  1. CPU scoring preferences (e.g., preferring more robust overshoot)');
console.log('  2. Memory or disk scoring penalties (selecting larger configs)');
console.log('  3. Disk config scoring (balancing drive count/size tradeoffs)');
console.log('='.repeat(60));
