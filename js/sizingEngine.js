import { calculateUsableStorage } from './calculateUsableStorage.js';
import { cpuList as cpuDataOld } from './cpuData.js'
import { cpuList as cpuDataNew } from './17GcpuData.js';
import {
  diskSizesTB,
  getValidDiskCounts,
  getValidMemoryOptions,
  sizingConstraints
} from './hardwareConfig.js';

// 🎯 Constants
const SYS_CPU = 4; // System overhead cores per cluster
const SYS_MEM_RATIO = 0.04; // 4% memory overhead
const cpuScoreLog = []

// Get the correct CPU list based on chassis model
function getCpuListForChassis(chassisModel) {
  if (chassisModel === "AX 670" || chassisModel === "AX 770") {
    return cpuDataNew;
  }
  return cpuDataOld;
}

// 🧠 Optimized Scoring Functions

function calculateCpuEfficiencyScore(cpu, requiredCores, requiredGHz) {
  const physicalCores = cpu.cores;
  const totalGhz = physicalCores * cpu.base_clock_GHz;

  let coreScore = 0;
  let ghzScore = 0;

  if (requiredCores > 0) {
    const coreOvershoot = Math.max(0, physicalCores - requiredCores);
    coreScore = coreOvershoot * 50;
    if (coreOvershoot <= 4) coreScore -= 100;
  }

  if (requiredGHz > 0) {
    const ghzOvershoot = Math.max(0, totalGhz - requiredGHz);
    ghzScore = ghzOvershoot * 5;
    if (ghzOvershoot <= totalGhz * 0.1) ghzScore -= 30;
  }

  // 🧠 Updated preference logic
  const cpuTypeBonus = cpu.model.includes("Gold 6")
    ? -2000
    : cpu.model.includes("Silver")
      ? 2000
      : 0;

  const clockBonus = cpu.base_clock_GHz * -200;

  return coreScore + ghzScore + cpuTypeBonus + clockBonus;
}

function calculateNodePenalty(nodesNeeded) {
  const minNodes = sizingConstraints.minClusterSize || 3;
  const optimalMax = 6; // Sweet spot for most workloads
  
  if (nodesNeeded < minNodes) {
    return (minNodes - nodesNeeded) * 1000; // Heavy penalty for under-minimum
  }
  
  if (nodesNeeded <= optimalMax) {
    return 0; // No penalty in sweet spot
  }
  
  // Moderate penalty for larger clusters
  return (nodesNeeded - optimalMax) * 20;
}

function calculateResourceOvershootPenalty(actual, required, weight = 1, maxPenalty = Infinity) {
  if (actual <= required) return 0;
  const overshootRatio = actual / required;
  const rawPenalty = Math.pow(overshootRatio - 1, 1.5) * weight * 1000;
  return Math.min(rawPenalty, maxPenalty);
}

// 🎯 Optimized CPU Selection

function selectOptimalCpuForCores(requiredCores, totalRAM, totalStorageTiB, haLevel, workloadType, cpuListOverride = cpuList, maxCPUUtilization = 0.60, maxMemoryUtilization = 0.60) {
  if (requiredCores <= 0) throw new Error("Required cores must be greater than 0");

  let bestCandidate = null;
  let bestGoldCandidate = null;
  const goldPreferenceThreshold = 1000;

 for (const cpu of cpuListOverride) {
  if (workloadType === "azure_virtual_desktop" && cpu.baseClockGHz < 2.8) {
    continue;
  }



    const usableCoresPerNode = cpu.cores * 2;

    let nodesNeeded = 1;
    while (true) {
      const survivableCores = haLevel === "n+1"
        ? (nodesNeeded - 1) * usableCoresPerNode - SYS_CPU
        : nodesNeeded * usableCoresPerNode - SYS_CPU;

      // Check if survivable cores meet requirement
      if (survivableCores >= requiredCores) {
        // Also ensure CPU utilization won't exceed max threshold
        const totalUsableCoresCheck = nodesNeeded * usableCoresPerNode - SYS_CPU;
        const utilizationCheck = requiredCores / totalUsableCoresCheck;
        if (utilizationCheck <= maxCPUUtilization) break;
      }
      
      nodesNeeded++;
      if (nodesNeeded > 512) break;
    }

    const totalPhysicalCores = nodesNeeded * cpu.cores * 2;
    const totalUsableCores = totalPhysicalCores - SYS_CPU;
    const coreOvershoot = Math.max(0, totalUsableCores - requiredCores);

    // Enforce survivability
    const postFailureCores = haLevel === "n+1"
      ? (nodesNeeded - 1) * usableCoresPerNode - SYS_CPU
      : totalUsableCores;

    if (postFailureCores < requiredCores) continue;

    // Validate memory
    const memoryConfig = selectOptimalMemoryConfig(totalRAM, nodesNeeded, haLevel);
    const memoryRequiredNodes = haLevel === "n+1"
      ? Math.ceil(totalRAM / memoryConfig.usableMemoryPerNode) + 1
      : Math.ceil(totalRAM / memoryConfig.usableMemoryPerNode);

    if (memoryRequiredNodes > nodesNeeded) continue;

    // Validate disk
    //try {
    //  selectDiskConfig(totalStorageTiB, nodesNeeded);
    //} catch {
     // continue;
   // }

    // Sweet spot bonus
   // const sweetSpot = nodesNeeded >= 4 && nodesNeeded <= 6 &&
//                   totalPhysicalCores >= 200 && totalPhysicalCores <= 250;

const sweetSpot = nodesNeeded >= 4 && nodesNeeded <= 6;

    const clockBonus = cpu.base_clock_GHz * -100; // Higher clock speed gets lower (better) score

    const score =
      totalPhysicalCores * 12 +
      nodesNeeded * 800 +
      coreOvershoot * 20 +
      (nodesNeeded > 7 ? 2500 : 0) +
      (sweetSpot ? -3000 : 0) +
      clockBonus;
cpuScoreLog.push({
  CPU: cpu.model,
  CoresPerSocket: cpu.cores,
  ClockGHz: cpu.base_clock_GHz,
  Nodes: nodesNeeded,
  TotalPhysicalCores: totalPhysicalCores,
  Score: Math.round(score)
});

    const candidate = {
      cpu,
      nodesNeeded,
      usableCoresPerNode,
      totalPhysicalCores,
      totalUsableCores,
      coreOvershoot,
      memoryConfig,
      score
    };

    if (!bestCandidate || score < bestCandidate.score) {
      bestCandidate = candidate;
    } else if (score === bestCandidate.score && cpu.base_clock_GHz > bestCandidate.cpu.base_clock_GHz) {
      // Tie-breaker: if scores are equal, prefer higher clock speed
      bestCandidate = candidate;
    } else if (cpu.cores === bestCandidate.cpu.cores && nodesNeeded === bestCandidate.nodesNeeded &&
               cpu.base_clock_GHz > bestCandidate.cpu.base_clock_GHz) {
      // Strong preference: if same core count and same node count, ALWAYS pick higher clock speed
      // even if score is slightly worse - higher clock is better for performance
      bestCandidate = candidate;
    } else if (cpu.cores === bestCandidate.cpu.cores && 
               Math.abs(nodesNeeded - bestCandidate.nodesNeeded) <= 1 &&
               cpu.base_clock_GHz > bestCandidate.cpu.base_clock_GHz &&
               Math.abs(score - bestCandidate.score) < 500) {
      // If cores match and node counts are very close (within 1) and clock is higher,
      // and score difference is negligible, prefer higher clock
      bestCandidate = candidate;
    }

    if (cpu.model.includes("Gold 6") &&
        (!bestGoldCandidate || score < bestGoldCandidate.score)) {
      bestGoldCandidate = candidate;
    } else if (cpu.model.includes("Gold 6") && score === bestGoldCandidate.score && 
               cpu.base_clock_GHz > bestGoldCandidate.cpu.base_clock_GHz) {
      // Tie-breaker: if scores are equal, prefer higher clock speed
      bestGoldCandidate = candidate;
    } else if (cpu.model.includes("Gold 6") && cpu.cores === bestGoldCandidate.cpu.cores && 
               nodesNeeded === bestGoldCandidate.nodesNeeded &&
               cpu.base_clock_GHz > bestGoldCandidate.cpu.base_clock_GHz) {
      // Strong preference: if same core count and same node count, ALWAYS pick higher clock speed
      bestGoldCandidate = candidate;
    } else if (cpu.model.includes("Gold 6") && cpu.cores === bestGoldCandidate.cpu.cores && 
               Math.abs(nodesNeeded - bestGoldCandidate.nodesNeeded) <= 1 &&
               cpu.base_clock_GHz > bestGoldCandidate.cpu.base_clock_GHz &&
               Math.abs(score - bestGoldCandidate.score) < 500) {
      // If cores match and node counts are very close (within 1) and clock is higher,
      // and score difference is negligible, prefer higher clock
      bestGoldCandidate = candidate;
    }
  }

  if (!bestCandidate) throw new Error("No viable CPU configuration found");
  
  // Debug: show all CPU options and why the winner was chosen
  console.group("🔍 CPU Selection Debug (selectOptimalCpuForCores)");
  console.table(cpuScoreLog);
  console.log(`✅ Selected: ${bestCandidate.cpu.model} (${bestCandidate.cpu.cores} cores, ${bestCandidate.cpu.base_clock_GHz} GHz) with score ${Math.round(bestCandidate.score)}`);
  if (bestGoldCandidate) {
    console.log(`  (Gold alternative: ${bestGoldCandidate.cpu.model} with score ${Math.round(bestGoldCandidate.score)})`);
  }
  console.groupEnd();

  // 🧠 Relative preference logic
  const finalCandidate = (bestGoldCandidate &&
                          bestGoldCandidate.score < bestCandidate.score + goldPreferenceThreshold)
    ? bestGoldCandidate
    : bestCandidate;

  

  return finalCandidate;
}
function selectOptimalCpuForGHz(requiredGHz, totalRAM, totalStorageTiB, haLevel, cpuListOverride = cpuList) {
  if (requiredGHz <= 0) {
    throw new Error("Required GHz must be greater than 0");
  }

  let bestCandidate = null;
  let bestGoldCandidate = null;
  const goldPreferenceThreshold = 1000;
  const cpuScoreLog = []

// Get the correct CPU list based on chassis model
function getCpuListForChassis(chassisModel) {
  if (chassisModel === "AX 670" || chassisModel === "AX 770") {
    return cpuDataNew;
  }
  return cpuDataOld;
};

  for (const cpu of cpuListOverride) {
    const usableCoresPerNode = cpu.cores * 2;
    const usableGHzPerNode = usableCoresPerNode * cpu.base_clock_GHz;

    let nodesNeeded = 1;
    while (true) {
      const clusterCount = splitClusters(nodesNeeded).length;
      const postFailureGHz = haLevel === "n+1"
        ? ((nodesNeeded - 1) * usableCoresPerNode - clusterCount * SYS_CPU) * cpu.base_clock_GHz
        : nodesNeeded * usableGHzPerNode;

      if (postFailureGHz >= requiredGHz) break;
      nodesNeeded++;
      if (nodesNeeded > 512) break;
    }

    const actualGHz = nodesNeeded * usableGHzPerNode;
    const actualCores = nodesNeeded * usableCoresPerNode;

    // Overshoot cap
    if (actualGHz > requiredGHz * 2.5) continue;

    // Memory validation
    const memoryConfig = selectOptimalMemoryConfig(totalRAM, nodesNeeded, haLevel);
    const memoryRequiredNodes = haLevel === "n+1"
      ? Math.ceil(totalRAM / memoryConfig.usableMemoryPerNode) + 1
      : Math.ceil(totalRAM / memoryConfig.usableMemoryPerNode);

    if (memoryRequiredNodes > nodesNeeded) continue;

    // Disk validation
    try {
        selectDiskConfig(totalStorageTiB, nodesNeeded, chassisModel);
    } catch {
      continue;
    }

    // Scoring
    const efficiencyScore = calculateCpuEfficiencyScore(cpu, 0, requiredGHz);
    const nodePenalty = calculateNodePenalty(nodesNeeded);
    const ghzOvershootPenalty = calculateResourceOvershootPenalty(actualGHz, requiredGHz, 6, 3000);
    const overshootRatio = actualGHz / requiredGHz;
    const tightFitBonus = overshootRatio <= 1.2 ? -1000 : 0;
    const ghzDensityPenalty = usableGHzPerNode < 160 ? 1000 : 0;
    const sweetSpot = nodesNeeded >= 4 && nodesNeeded <= 6;
    const sweetSpotBonus = sweetSpot ? -3000 : 0;

    const totalScore = efficiencyScore + nodePenalty + ghzOvershootPenalty + tightFitBonus + ghzDensityPenalty + sweetSpotBonus;

    cpuScoreLog.push({
      CPU: cpu.model,
      CoresPerSocket: cpu.cores,
      ClockGHz: cpu.base_clock_GHz,
      Nodes: nodesNeeded,
      ActualGHz: Math.round(actualGHz),
      OvershootGHz: Math.round(actualGHz - requiredGHz),
      Score: Math.round(totalScore)
    });

    const candidate = {
      cpu,
      nodesNeeded,
      usableCoresPerNode,
      usableGHzPerNode,
      actualCores,
      actualGHz,
      memoryConfig,
      score: totalScore
    };

    if (!bestCandidate || totalScore < bestCandidate.score) {
      bestCandidate = candidate;
    } else if (totalScore === bestCandidate.score && cpu.base_clock_GHz > bestCandidate.cpu.base_clock_GHz) {
      // Tie-breaker: if scores are equal, prefer higher clock speed
      bestCandidate = candidate;
    }

    if (cpu.model.includes("Gold 6") &&
        (!bestGoldCandidate || totalScore < bestGoldCandidate.score)) {
      bestGoldCandidate = candidate;
    } else if (cpu.model.includes("Gold 6") && totalScore === bestGoldCandidate.score && 
               cpu.base_clock_GHz > bestGoldCandidate.cpu.base_clock_GHz) {
      // Tie-breaker: if scores are equal, prefer higher clock speed
      bestGoldCandidate = candidate;
    }
  }

  if (!bestCandidate) throw new Error("No viable CPU configuration found");

  // Debug: show all CPU options and why the winner was chosen
  console.group("🔍 CPU Selection Debug (selectOptimalCpuForGHz)");
  console.table(cpuScoreLog);
  console.log(`✅ Selected: ${bestCandidate.cpu.model} (${bestCandidate.cpu.cores} cores, ${bestCandidate.cpu.base_clock_GHz} GHz) with score ${Math.round(bestCandidate.score)}`);
  if (bestGoldCandidate) {
    console.log(`  (Gold alternative: ${bestGoldCandidate.cpu.model} with score ${Math.round(bestGoldCandidate.score)})`);
  }
  console.groupEnd();

  const finalCandidate = (bestGoldCandidate &&
                          bestGoldCandidate.score < bestCandidate.score + goldPreferenceThreshold)
    ? bestGoldCandidate
    : bestCandidate;

  

  return finalCandidate;
}

// 💾 Optimized Memory Selection

function selectOptimalMemoryConfig(requiredRAM, nodeCount, haLevel) {
  const memoryOptions = getValidMemoryOptions();
  
  const candidates = memoryOptions.map(option => {
    const usableMemoryPerNode = Math.floor(option.totalGB * (1 - SYS_MEM_RATIO));
    
    let effectiveNodes = nodeCount;
    if (haLevel === "n+1") {
      effectiveNodes = nodeCount - 1; // Account for one node failure
    }
    
    const totalUsableMemory = effectiveNodes * usableMemoryPerNode;
    const memoryShortfall = Math.max(0, requiredRAM - totalUsableMemory);
    const memoryOvershoot = Math.max(0, totalUsableMemory - requiredRAM);
    
    // Scoring: prefer configurations that meet requirements with minimal overshoot
    let score = 0;
    
    if (memoryShortfall > 0) {
      score += memoryShortfall * 100; // Heavy penalty for insufficient memory
    } else {
      score += calculateResourceOvershootPenalty(totalUsableMemory, requiredRAM, 1);
    }
    
    // Prefer standard DIMM configurations (16 or 32 DIMMs typically)
    if (option.dimmCount === 16 || option.dimmCount === 32) {
      score -= 50;
    }
    
    return {
      ...option,
      usableMemoryPerNode,
      totalUsableMemory,
      memoryShortfall,
      memoryOvershoot,
      meetsRequirement: memoryShortfall === 0,
      score
    };
  });
  
  // Sort by score and filter for viable options
  // Use totalGB as tie-breaker: prefer smaller configs when scores are equal
  candidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.01) { // scores are essentially equal
      return a.totalGB - b.totalGB; // prefer smaller memory config
    }
    return a.score - b.score;
  });
  
  const viableOptions = candidates.filter(c => c.meetsRequirement);
  const selectedConfig = viableOptions.length > 0 ? viableOptions[0] : candidates[0];
  
  console.table({
    "Required RAM": requiredRAM,
    "Node Count": nodeCount,
    "HA Level": haLevel,
    "Selected Config": `${selectedConfig.dimmCount} × ${selectedConfig.dimmSize}GB`,
    "Total Per Node": selectedConfig.totalGB,
    "Usable Per Node": selectedConfig.usableMemoryPerNode,
    "Total Usable": selectedConfig.totalUsableMemory,
    "Shortfall": selectedConfig.memoryShortfall,
    "Score": selectedConfig.score.toFixed(2),
    "Viable Options Count": viableOptions.length
  });
  
  return selectedConfig;
}
function selectDiskConfig(requiredUsableTiB, nodeCount, chassisModel) {
  const resiliencyLevel = nodeCount < 3 ? "2-way" : "3-way";
  const allowSmallFootprint = requiredUsableTiB < 3;

  

  const candidates = [];

  diskSizesTB.forEach(size => {
    // getValidDiskCounts expects a chassis model to enforce per-chassis disk limits
    const validCounts = getValidDiskCounts(chassisModel);
    validCounts.forEach(count => {
      const storage = calculateUsableStorage(nodeCount, count, size, resiliencyLevel);
      const usableTiB = parseFloat(storage.usableTiB);

      candidates.push({
        diskSizeTB: size,
        disksPerNode: count,
        usableTiB,
        reserveTiB: parseFloat(storage.reserveTiB),
        resiliencyTiB: parseFloat(storage.resiliencyTiB),
        meetsRequirement: usableTiB >= requiredUsableTiB
      });
    });
  });

  function calculateStorageOvershootPenalty(usableTiB, requiredTiB, penaltyPerTiB = 5) {
    const overshoot = usableTiB - requiredTiB;
    return overshoot > 0 ? Math.round(overshoot * penaltyPerTiB) : 0;
  }

  function diskScore(config) {
    const { disksPerNode, diskSizeTB, usableTiB } = config;

    const baseScore = disksPerNode * 80;
    const smallDrivePenalty = allowSmallFootprint ? 0 : (diskSizeTB < 1.92 ? 1000 : 0);
    const ultraLowPenalty = allowSmallFootprint ? 0 : (disksPerNode < 4 ? 500 : 0);
    const sweetSpotBonus = (disksPerNode >= 6 && disksPerNode <= 16) ? -200 : 0;
    const overshootPenalty = calculateStorageOvershootPenalty(usableTiB, requiredUsableTiB);

    return baseScore + smallDrivePenalty + ultraLowPenalty + sweetSpotBonus + overshootPenalty;
  }

  const viable = candidates.filter(c => c.meetsRequirement);

  if (viable.length === 0) {
    throw new Error(`❌ No disk config met required usable storage of ${requiredUsableTiB.toFixed(2)} TiB at nodeCount = ${nodeCount}`);
  }

  const bestDisk = viable.sort((a, b) => diskScore(a) - diskScore(b))[0];

  

  // Recalculate final storage breakdown to ensure consistency
  const finalStorage = calculateUsableStorage(
    nodeCount,
    bestDisk.disksPerNode,
    bestDisk.diskSizeTB,
    resiliencyLevel
  );

  Object.assign(bestDisk, {
    usableTiB: parseFloat(finalStorage.usableTiB),
    reserveTiB: parseFloat(finalStorage.reserveTiB),
    resiliencyTiB: parseFloat(finalStorage.resiliencyTiB)
  });

  if (bestDisk.usableTiB < requiredUsableTiB) {
    throw new Error(`❌ Disk config failed to meet required usable storage of ${requiredUsableTiB.toFixed(2)} TiB`);
  }

  return bestDisk;
}


// 🔧 Utility Functions

function splitClusters(nodeCount) {
  const maxSize = sizingConstraints.maxClusterSize || 16;
  const configMinSize = sizingConstraints.minClusterSize || 1;

  // Dynamically raise minSize if nodeCount is large
  const minSize = nodeCount >= 10 ? Math.max(configMinSize, 3) : configMinSize;

  // Try to find a balanced split
  for (let clusterCount = 1; clusterCount <= nodeCount; clusterCount++) {
    const baseSize = Math.floor(nodeCount / clusterCount);
    const remainder = nodeCount % clusterCount;

    const smallest = baseSize;
    const largest = baseSize + (remainder > 0 ? 1 : 0);

    if (smallest >= minSize && largest <= maxSize) {
      const clusters = [];
      for (let i = 0; i < clusterCount; i++) {
        clusters.push(i < remainder ? baseSize + 1 : baseSize);
      }
      return clusters;
    }
  }

  // Fallback: one big cluster
  return [nodeCount];
}
function calculateVmSizing(vmCount, vcpusPerVm, vcpuCoreRatio, ramPerVmGB, storagePerVmGB) {
  return {
    totalCores: (vmCount * vcpusPerVm) / vcpuCoreRatio,
    totalRamGB: vmCount * ramPerVmGB,
    totalStorageGB: vmCount * storagePerVmGB
  };
}

function applyGrowthFactor(value, growthPercent) {
  return value * (1 + growthPercent / 100);
}

function getSizingPayloadFromHTML() {
 const activePill = document.querySelector("#sizingModePills .nav-link.active");
const mode = activePill?.getAttribute("data-mode") || "vm";
  const haLevel = document.getElementById("haLevel")?.value || "n+1";
  const growthPctRaw = parseFloat(document.getElementById("growthFactor")?.value || "0");
  const growthPct = growthPctRaw / 100;
    // Determine chassis model from main UI selection only
    const nodeTypeMainRadio = document.querySelector('input[name="nodeType"]:checked');
  const chassisModel = nodeTypeMainRadio?.value || "AX 770";

  if (mode === "vm") {
    // === Existing VM mode ===
    const vmCount = parseInt(document.getElementById("vmCount")?.value || "0", 10);
    const vCPU = parseInt(document.getElementById("vCPU")?.value || "0", 10);
    const vcpuRatio = parseFloat(document.getElementById("vcpuRatio")?.value || "1");
    const ramPerVM = parseInt(document.getElementById("ramPerVM")?.value || "0", 10);
    const storagePerVM = parseFloat(document.getElementById("storagePerVM")?.value || "0");

    const vmSizing = calculateVmSizing(vmCount, vCPU, vcpuRatio, ramPerVM, storagePerVM);

    return {
      totalCPU: Math.ceil(applyGrowthFactor(vmSizing.totalCores, growthPctRaw)),
      totalRAM: Math.ceil(applyGrowthFactor(vmSizing.totalRamGB, growthPctRaw)),
      totalStorage: applyGrowthFactor(vmSizing.totalStorageGB, growthPctRaw) / 1024,
      growthPct,
      haLevel,
      chassisModel
    };

  } else if (mode === "workload") {
  // === New Workload mode ===
  let totalCores = 0;
  let totalRAM = 0;
  let totalStorage = 0;
  const workloadSummaries = [];

  const rows = document.querySelectorAll(".workload-row");
  rows.forEach((row, idx) => {
    const name = row.querySelector(".workload-name")?.value || `Workload ${idx+1}`;
    const users = parseInt(row.querySelector(".workload-users")?.value, 10) || 0;
    const concurrency = parseInt(row.querySelector(".workload-concurrency")?.value, 10) || 100;
    const effectiveUsers = Math.ceil(users * (concurrency / 100));
    const sessionType = row.querySelector(".workload-session")?.value;
    const workloadType = row.querySelector(".workload-type")?.value;
    const addProfileShare = row.querySelector(".workload-profile")?.checked;
    const profileSize = addProfileShare
      ? parseInt(row.querySelector(".workload-profile-size")?.value, 10) || 0
      : 0;

    let vmSpec = {};
    let vmsNeeded = 0;

    if (sessionType === "multi") {
      if (["light", "medium", "heavy"].includes(workloadType)) {
        vmSpec = { vcpu: 8, cores: 4, memory: 16, disk: 32 };
        const usersPerVcpu = workloadType === "light" ? 6 : workloadType === "medium" ? 4 : 2;
        const usersPerVM = vmSpec.vcpu * usersPerVcpu;
        vmsNeeded = Math.ceil(effectiveUsers / usersPerVM);
      } else if (workloadType === "power") {
        vmSpec = { vcpu: 6, cores: 3, memory: 56, disk: 340 };
        const usersPerVM = vmSpec.vcpu * 1;
        vmsNeeded = Math.ceil(effectiveUsers / usersPerVM);
      }
    } else if (sessionType === "single") {
      if (workloadType === "light") {
        vmSpec = { vcpu: 2, cores: 1, memory: 8, disk: 32 };
      } else if (workloadType === "medium") {
        vmSpec = { vcpu: 4, cores: 2, memory: 16, disk: 32 };
      } else if (workloadType === "heavy") {
        vmSpec = { vcpu: 8, cores: 4, memory: 32, disk: 32 };
      }
      vmsNeeded = effectiveUsers; // 1 user per VM
    }

    const workloadDisk = (vmSpec.disk * vmsNeeded) + (addProfileShare ? effectiveUsers * profileSize : 0);

    // Accumulate totals
    totalCores += vmSpec.cores * vmsNeeded;
    totalRAM += vmSpec.memory * vmsNeeded;
    totalStorage += workloadDisk;

    // Push per-workload breakdown
   workloadSummaries.push({
  name,
 type: `${sessionType}-session, ${workloadType}`,
  vmsNeeded,
  vcpuPerVM: vmSpec.vcpu,
  vmDensity: vmsNeeded > 0 ? Math.ceil(effectiveUsers / vmsNeeded) : 0,
  memoryPerVM: vmSpec.memory,
  storagePerVM: vmSpec.disk,
  totalVcpu: vmSpec.vcpu * vmsNeeded,
  totalCores: vmSpec.cores * vmsNeeded,
  totalMemory: vmSpec.memory * vmsNeeded,
  totalDisk: workloadDisk
});

  });

  return {
    totalCPU: Math.ceil(applyGrowthFactor(totalCores, growthPctRaw)),
    totalRAM: Math.ceil(applyGrowthFactor(totalRAM, growthPctRaw)),
    totalStorage: applyGrowthFactor(totalStorage, growthPctRaw) / 1024, // GB→TB
    growthPct,
    haLevel,
    chassisModel,
    raw: { totalCores, totalRAM, totalStorage },
    workloads: workloadSummaries
  };
} else {
  // === Existing "other" mode ===
  const cpuUnit = document.getElementById("cpuUnit")?.value || "cores";
  let totalCPU = 0;
  let totalGHz = 0;

  if (cpuUnit === "cores") {
    totalCPU = parseInt(document.getElementById("cpuRequirement")?.value || "0", 10);
  } else if (cpuUnit === "ghz") {
    totalGHz = parseFloat(document.getElementById("ghzRequirement")?.value || "0");
  }

  const totalRAM = parseInt(document.getElementById("totalRAM")?.value || "0", 10);
  const totalStorage = parseFloat(document.getElementById("totalStorage")?.value || "0");
  const switchMode = document.querySelector('input[name="switchMode"]:checked')?.value || "separate";

  return {
    totalCPU: Math.ceil(applyGrowthFactor(totalCPU, growthPctRaw)),
    totalGHz: totalGHz, // optional: include if relevant
    totalRAM: Math.ceil(applyGrowthFactor(totalRAM, growthPctRaw)),
    totalStorage: applyGrowthFactor(totalStorage, growthPctRaw), // GB→TB
    growthPct,
    haLevel,
    chassisModel,
    raw: { totalCPU, totalRAM, totalStorage },
    workloads: [] // empty array for consistency
  };
}
}

// 🏗️ Main Sizing Function

function sizeCluster(req) {
  const {
    totalCPU,
    totalGHz,
    totalRAM,
    totalStorage,
    growthPct = 0,
    haLevel = "n+1",
    chassisModel = "AX 770",
    switchMode = "separate",
    maxCPUUtilization = 0.60,
    maxMemoryUtilization = 0.60
  } = req;

  // Adjust memory requirement to account for max memory utilization constraint
  // If maxMemoryUtilization is 60%, we need to provision for totalRAM / 0.60
  const adjustedTotalRAM = totalRAM / maxMemoryUtilization;

  

let storageResiliency;
let storageConfig;
let postFailureCapabilities = null;
 
 
  // Step 1: Get candidate CPU lists and prepare for parallel constraint calculation
  const correctCpuList = getCpuListForChassis(chassisModel);
  const filteredCpuList = req.cpuModel
    ? correctCpuList.filter(cpu => cpu.model === req.cpuModel)
    : correctCpuList;

  // Start with a base CPU selection to understand core/GHz requirements
  let baseCpuSelection;
  let primaryConstraint;
  
  try {
    if (totalGHz > 0) {
      primaryConstraint = "GHz";
      baseCpuSelection = selectOptimalCpuForGHz(totalGHz, adjustedTotalRAM, totalStorage, haLevel, filteredCpuList);
    } else if (totalCPU > 0) {
      primaryConstraint = "Cores";
      baseCpuSelection = selectOptimalCpuForCores(totalCPU, adjustedTotalRAM, totalStorage, haLevel, null, filteredCpuList, maxCPUUtilization, maxMemoryUtilization);
    } else {
      throw new Error("Must specify either totalCPU (cores) or totalGHz requirement");
    }
  } catch (err) {
    console.warn(`⚠️ Primary CPU selection failed: ${err.message}`);
    console.warn("🔁 Falling back to 8-core sizing attempt…");
    try {
      baseCpuSelection = selectOptimalCpuForCores(8, adjustedTotalRAM, totalStorage, haLevel, null, filteredCpuList, maxCPUUtilization, maxMemoryUtilization);
      primaryConstraint = "Fallback (8 cores)";
    } catch (fallbackErr) {
      throw new Error(`❌ Fallback sizing also failed: ${fallbackErr.message}`);
    }
  }

  if (!baseCpuSelection || !baseCpuSelection.cpu) {
    throw new Error("❌ CPU selection failed — no viable candidate returned");
  }

  // PARALLEL CONSTRAINT CALCULATION
  // Calculate independent node requirements for each constraint
  const baseCpu = baseCpuSelection.cpu;
  const baseCoresPerNode = baseCpu.cores * 2;
  
  // 1. CPU constraint: nodes needed to meet CPU requirement
  const cpuNodesNeeded = baseCpuSelection.nodesNeeded || 
    Math.ceil((totalCPU + SYS_CPU) / baseCoresPerNode);

  // 2. Memory constraint: nodes needed to meet memory requirement with utilization limit
  // Memory requirement already adjusted upfront, so calculate nodes for adjusted amount
  // Find optimal memory config for the adjusted RAM requirement
  let tempMemoryConfig = selectOptimalMemoryConfig(adjustedTotalRAM, 3, haLevel);
  const usableMemoryPerNode = tempMemoryConfig.usableMemoryPerNode;
  
  // Calculate nodes needed for the adjusted memory amount
  let memoryNodesNeeded = haLevel === "n+1"
    ? Math.ceil(adjustedTotalRAM / usableMemoryPerNode) + 1
    : Math.ceil(adjustedTotalRAM / usableMemoryPerNode);

  // 3. Start with max of CPU and memory; storage will be calculated in the loop
  let nodeCount = Math.max(cpuNodesNeeded, memoryNodesNeeded);

  // Ensure minimum cluster size
  const minNodes = sizingConstraints.minClusterSize || 3;
  if (nodeCount < minNodes) {
    nodeCount = minNodes;
  }

  let selectedCpu = baseCpu;
  const physicalCoresPerNode = selectedCpu.cores * 2;
  const usableCoresPerNode = physicalCoresPerNode;
  
  // Use memory config appropriate for the final node count
  let memoryConfig = selectOptimalMemoryConfig(adjustedTotalRAM, nodeCount, haLevel);

  // Step 2: Storage loop - find minimum nodes needed for storage constraint
  // This may increase nodeCount beyond CPU/Memory requirements
  const maxNodes = 512;
  let finalClusterSummaries = null;
  let finalClusters = null;
  let finalTotalUsableTiB = 0;
  let diskConfig = null;
  let storageNodesNeeded = nodeCount;

  while (nodeCount <= maxNodes) {
    try {
      storageResiliency = nodeCount >= 3 ? "3-way" : "2-way";
      diskConfig = selectDiskConfig(totalStorage, nodeCount, chassisModel);

      const clusters = splitClusters(nodeCount);

      const clusterSummaries = clusters.map((size, index) => {
        const reservedNodes = Math.min(size, 4);
        const reservedDrives = reservedNodes * 1;
        const fullNodes = size - reservedNodes;
        const reservedDiskCount = diskConfig.disksPerNode - 1;
        const totalDrives = size * diskConfig.disksPerNode;
        const dataDrives = totalDrives - reservedDrives;
        const fullDiskCount = diskConfig.disksPerNode;
        const diskSizeTB = diskConfig.diskSizeTB;
        const usableRatio = 1 / 1.1024;
        const reservedTiB = reservedNodes * reservedDiskCount * diskSizeTB * usableRatio;
        const fullTiB = fullNodes * fullDiskCount * diskSizeTB * usableRatio;
        const rawTiB = reservedTiB + fullTiB;
        const usableTiB = storageResiliency === "3-way"
          ? rawTiB / 3
          : storageResiliency === "2-way"
            ? rawTiB / 2
            : rawTiB;

        const postFailureNodes = Math.max(size - 1, 1);
        const postFailureCores = postFailureNodes * usableCoresPerNode - SYS_CPU;
        const postFailureGHz = postFailureCores * selectedCpu.base_clock_GHz;
        if (totalGHz > 0 && postFailureGHz > totalGHz * 1.5) return null;
        const postFailureRAM = postFailureNodes * memoryConfig.usableMemoryPerNode;

        return {
          name: `Instance ${String.fromCharCode(65 + index)}`,
          nodeCount: size,
          reservedNodes,
          usableCores: size * usableCoresPerNode - SYS_CPU,
          usableGHz: (size * usableCoresPerNode - SYS_CPU) * selectedCpu.base_clock_GHz,
          usableMemoryGB: size * memoryConfig.usableMemoryPerNode,
          usableTiB: parseFloat(usableTiB.toFixed(2)),
          resiliency: storageResiliency,
          switchMode,
          diskSizeTB,
          disksPerNode: diskConfig.disksPerNode,
          rawTiB: parseFloat(rawTiB.toFixed(2)),
          reserveTiB: parseFloat(reservedTiB.toFixed(2)),
          resiliencyTiB: parseFloat(diskConfig.resiliencyTiB.toFixed(2)),
          postFailure: {
            activeNodes: postFailureNodes,
            usableCores: postFailureCores,
            usableGHz: postFailureGHz,
            usableMemoryGB: postFailureRAM,
            meetsCoreRequirement: totalCPU > 0 ? postFailureCores >= totalCPU * (size / nodeCount) : true,
            meetsGHzRequirement: totalGHz > 0 ? postFailureGHz >= totalGHz * (size / nodeCount) : true,
            meetsRamRequirement: postFailureRAM >= adjustedTotalRAM * (size / nodeCount)
          }
        };
      }).filter(Boolean);

      const totalUsableTiB = clusterSummaries.reduce((sum, cluster) => sum + cluster.usableTiB, 0);
      if (totalUsableTiB >= totalStorage) {
        finalClusterSummaries = clusterSummaries;
        finalClusters = clusters;
        finalTotalUsableTiB = totalUsableTiB;
        storageNodesNeeded = nodeCount;
        break;
      }

      console.warn(`⚠️ Node count ${nodeCount} failed: usableTiB = ${totalUsableTiB.toFixed(2)} TiB`);
    } catch (err) {
      console.warn(`❌ Node count ${nodeCount} failed: ${err.message}`);
    }

    nodeCount++;
  }

  if (!finalClusterSummaries) {
    throw new Error(`❌ Final cluster usable storage did not meet required ${totalStorage} TiB even with ${nodeCount} nodes`);
  }

  // Step 3: Now we know the final node count (max of CPU, Memory, Storage constraints)
  // Recalculate CPU, Memory, and Storage configs optimally for this final node count
  const finalNodeCount = finalClusterSummaries.reduce((sum, cluster) => sum + cluster.nodeCount, 0);

  console.log(`📊 Node requirements - CPU: ${cpuNodesNeeded}, Memory: ${memoryNodesNeeded}, Storage: ${storageNodesNeeded}, Final: ${finalNodeCount}`);

  // Recalculate memory configuration for the final node count
  const finalMemoryConfig = selectOptimalMemoryConfig(adjustedTotalRAM, finalNodeCount, haLevel);

  // Recalculate CPU selection for the final node count
  // With more nodes available, we might be able to select a lower-core CPU while still meeting requirements
  let finalSelectedCpu = selectedCpu;
  try {
    // Use the full CPU selection algorithm to pick the optimal CPU for the final node count
    const recalcSelection = totalCPU > 0 
      ? selectOptimalCpuForCores(totalCPU, adjustedTotalRAM, totalStorage, haLevel, null, filteredCpuList, maxCPUUtilization, maxMemoryUtilization)
      : selectOptimalCpuForGHz(totalGHz, adjustedTotalRAM, totalStorage, haLevel, filteredCpuList);
    
    if (recalcSelection && recalcSelection.cpu) {
      finalSelectedCpu = recalcSelection.cpu;
      console.log(`🔄 CPU recalculated for final ${finalNodeCount} nodes: ${finalSelectedCpu.model} (${finalSelectedCpu.cores} cores, ${finalSelectedCpu.base_clock_GHz} GHz)`);
    }
  } catch (err) {
    console.warn("⚠️ CPU recalculation for final node count failed, keeping original CPU selection");
  }

  const finalPhysicalCoresPerNode = finalSelectedCpu.cores * 2;
  const finalUsableCoresPerNode = finalPhysicalCoresPerNode;
const totalUsableCores = finalNodeCount * finalUsableCoresPerNode - finalClusters.length * SYS_CPU;
const totalUsableGHz = totalUsableCores * finalSelectedCpu.base_clock_GHz;
const totalUsableMemory = finalNodeCount * finalMemoryConfig.usableMemoryPerNode;
const totalPostFailure = finalClusterSummaries.reduce((acc, cluster) => {
  acc.activeNodes += cluster.postFailure.activeNodes;
  acc.usableCores += cluster.postFailure.usableCores;
  acc.usableGHz += cluster.postFailure.usableGHz;
  acc.usableMemoryGB += cluster.postFailure.usableMemoryGB;
  return acc;
}, {
  activeNodes: 0,
  usableCores: 0,
  usableGHz: 0,
  usableMemoryGB: 0
});
const primaryStorageConfig = diskConfig; // Place this just before the result block
const clusterCount = finalClusterSummaries.length;
const totalReserveTiB = finalClusterSummaries
  .reduce((sum, cluster) => sum + cluster.reserveTiB, 0);
const result = {
  // Cluster Configuration
  nodeCount: finalNodeCount, clusterCount,
 clusterSizes: finalClusters,
clusterSummaries: finalClusterSummaries,
  chassisModel,

  // CPU Configuration
  cpuModel: finalSelectedCpu.model,
  cpuCoresPerSocket: finalSelectedCpu.cores,
  cpuClockGHz: finalSelectedCpu.base_clock_GHz,
  physicalCoresPerNode: finalPhysicalCoresPerNode,
  usableCoresPerNode: finalUsableCoresPerNode,
  totalUsableCores,
  totalUsableGHz: Math.round(totalUsableGHz),

  // Memory Configuration
  memorySizeGB: finalMemoryConfig.totalGB,
  memoryConfig: `${finalMemoryConfig.totalGB} GB (${finalMemoryConfig.dimmCount} × ${finalMemoryConfig.dimmSize} GB)`,
  usableMemoryPerNode: finalMemoryConfig.usableMemoryPerNode,
  totalUsableMemory,

  // Storage Configuration
  disksPerNode: diskConfig.disksPerNode,
diskSizeTB: diskConfig.diskSizeTB,
usableTiB: finalTotalUsableTiB,
reserveTiB: parseFloat(totalReserveTiB.toFixed(2)),   // ✅ FIXED
resiliencyTiB: diskConfig.resiliencyTiB,

  // High Availability
  resiliency: haLevel, storageResiliency,
  postFailureCapabilities,

  // Requirements Analysis
  requirements: {
    totalCPU: totalCPU || 0,
    totalGHz: totalGHz || 0,
    totalRAM,
    totalStorage
  },

  // Efficiency Metrics
  efficiency: {
    cpuUtilization: totalCPU > 0 ? (totalCPU / totalUsableCores * 100).toFixed(1) + "%" : "N/A",
    ghzUtilization: totalGHz > 0 ? (totalGHz / totalUsableGHz * 100).toFixed(1) + "%" : "N/A",
    memoryUtilization: (totalRAM / totalUsableMemory * 100).toFixed(1) + "%"
  }
};

result.clusterSummaries = finalClusterSummaries;
result.totalCores = result.physicalCoresPerNode * result.nodeCount;
result.totalMemoryGB = result.memorySizeGB * result.nodeCount;
result.totalClusterResources = {
  normal: {
    nodes: result.nodeCount,
    usableCores: result.totalUsableCores,
    usableGHz: result.totalUsableGHz,
    usableMemoryGB: result.totalUsableMemory
  },
  postFailure: totalPostFailure
};


 
 
return result;
}
export {
  getSizingPayloadFromHTML,
  calculateVmSizing,
  applyGrowthFactor,
  sizeCluster,
  splitClusters,
  selectOptimalCpuForCores,
  selectOptimalCpuForGHz,
  selectOptimalMemoryConfig,
  selectDiskConfig
};









