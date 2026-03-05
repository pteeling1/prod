import { calculateUsableStorage } from './calculateUsableStorage.js';
import { cpuList } from './cpuData.js';
import {
  diskSizesTB,
  getValidDiskCounts,
  getValidMemoryOptions,
  sizingConstraints
} from './hardwareConfig.js';

// 🧠 Scoring Functions

function cpuPenalty(cpuModel) {
  return cpuModel.startsWith("Gold 6") ? 0 : 300;
}

function diskPenalty(diskSizeTB) {
  return (diskSizeTB === 3.84 || diskSizeTB === 7.68) ? 0 : 200;
}

function memoryPenalty(dimmCount) {
  return (dimmCount === 16 || dimmCount === 32) ? 0 : 500;
}

function nodePenalty(nodesNeeded) {
  return nodesNeeded < 3 ? 500 * (3 - nodesNeeded) : 0;
}

function sweetSpotNodePenalty(nodesNeeded) {
  if (nodesNeeded < 3) return (3 - nodesNeeded) * 500;
  if (nodesNeeded > 6) return (nodesNeeded - 6) * 300;
  return 0;
}

function cpuOvershootPenalty(actualCores, requiredCores) {
  const overshoot = actualCores - requiredCores;
  return overshoot > 0 ? overshoot * 4 : 0;
}

function memoryOvershootPenalty(actualRAM, requiredRAM) {
  const overshoot = actualRAM - requiredRAM;
  return overshoot > 0 ? overshoot * 0.5 : 0;
}

function storageOvershootPenalty(actualTiB, requiredTiB) {
  const overshoot = actualTiB - requiredTiB;
  return overshoot > 0 ? overshoot * 10 : 0;
}

// 🧮 Candidate Scoring

function scoreCandidate(candidate) {
  const {
    nodesNeeded,
    overshoot,
    cpuModel,
    diskSizeTB,
    dimmCount,
    actualCores,
    requiredCores,
    actualRAM,
    requiredRAM,
    actualTiB,
    requiredTiB
  } = candidate;

  const penalties = {
    nodePenalty: sweetSpotNodePenalty(nodesNeeded),
    cpuPenalty: cpuPenalty(cpuModel || ""),
    diskPenalty: diskPenalty(diskSizeTB || 0),
    memoryPenalty: memoryPenalty(dimmCount || 0),
    cpuOvershoot: cpuOvershootPenalty(actualCores || 0, requiredCores || 0),
    memoryOvershoot: memoryOvershootPenalty(actualRAM || 0, requiredRAM || 0),
    storageOvershoot: storageOvershootPenalty(actualTiB || 0, requiredTiB || 0),
    overshootRaw: overshoot
  };

  const totalScore = 
    nodesNeeded * 100 +
    penalties.overshootRaw +
    penalties.cpuPenalty +
    penalties.diskPenalty +
    penalties.memoryPenalty +
    penalties.nodePenalty +
    penalties.cpuOvershoot +
    penalties.memoryOvershoot +
    penalties.storageOvershoot;

  console.log(`📊 Candidate Score Breakdown for ${cpuModel || "Unknown CPU"}:`);
  console.table({
    Nodes: nodesNeeded,
    CPU: cpuModel,
    DIMMs: dimmCount,
    DiskSizeTB: diskSizeTB,
    TotalScore: totalScore,
    ...penalties
  });

  return totalScore;
}

/**
 * Parse inputs from the UI
 */
function getSizingPayloadFromHTML() {
  const mode = document.getElementById("sizingMode")?.value || "vm";
  const haLevel = document.getElementById("haLevel")?.value || "n+1";
  const growthPct = parseFloat(document.getElementById("growthFactor")?.value || "0");
  const chassisModel = "AX 760";

  if (mode === "vm") {
    const vmCount = parseInt(document.getElementById("vmCount")?.value || "0", 10);
    const vCPU = parseInt(document.getElementById("vCPU")?.value || "0", 10);
    const vcpuRatio = parseFloat(document.getElementById("vcpuRatio")?.value || "1");
    const ramPerVM = parseInt(document.getElementById("ramPerVM")?.value || "0", 10);
    const storagePerVM = parseFloat(document.getElementById("storagePerVM")?.value || "0");

    const vmSizing = calculateVmSizing(vmCount, vCPU, vcpuRatio, ramPerVM, storagePerVM);

    return {
      totalCPU: Math.ceil(applyGrowthFactor(vmSizing.totalCores, growthPct)),
      totalRAM: Math.ceil(applyGrowthFactor(vmSizing.totalRamGB, growthPct)),
      totalStorage: applyGrowthFactor(vmSizing.totalStorageGB, growthPct) / 1024,
      growthPct: growthPct / 100,
      haLevel,
      chassisModel
    };
  } else {
    const cpuUnit = document.getElementById("cpuUnit")?.value || "cores";
    const growthPctRaw = parseFloat(document.getElementById("growthFactor")?.value || "0");
    const growthPct = growthPctRaw / 100;

    let totalCPU = 0;
    let totalGHz = 0;

    if (cpuUnit === "cores") {
      totalCPU = parseInt(document.getElementById("cpuRequirement")?.value || "0", 10);
    } else if (cpuUnit === "ghz") {
      totalGHz = parseFloat(document.getElementById("ghzRequirement")?.value || "0");
    }

    const totalRAM = parseInt(document.getElementById("totalRAM")?.value || "0", 10);
    const totalStorage = parseFloat(document.getElementById("totalStorage")?.value || "0");

    return {
      totalCPU: Math.ceil(applyGrowthFactor(totalCPU, growthPct)),
      totalGHz: applyGrowthFactor(totalGHz, growthPct),
      totalRAM: Math.ceil(applyGrowthFactor(totalRAM, growthPct)),
      totalStorage: applyGrowthFactor(totalStorage, growthPct),
      growthPct,
      haLevel,
      chassisModel
    };
  }
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

function splitClusters(nodeCount) {
  const maxSize = sizingConstraints.maxClusterSize;
  const minSize = sizingConstraints.minClusterSize;
  const clusters = [];

  while (nodeCount > 0) {
    const remaining = nodeCount;
    const ideal = Math.min(maxSize, remaining);
    const next = remaining - ideal;

    if (next > 0 && next < minSize) {
      const adjusted = ideal - (minSize - next);
      clusters.push(adjusted);
      nodeCount -= adjusted;
    } else {
      clusters.push(ideal);
      nodeCount -= ideal;
    }
  }

  return clusters;
}
function selectBestCpuForTotalCPU(totalCPU, totalRAM, totalStorageTiB) {
  const SYS_CPU = 4;

  const candidates = cpuList.map(cpu => {
    const usableCores = cpu.cores * 2 - SYS_CPU;
    const nodesNeeded = Math.ceil(totalCPU / usableCores);

    // Assume max memory config (1024 GB, 32 DIMMs)
    const actualRAM = nodesNeeded * 1024;
    const requiredRAM = totalRAM;

    // Assume disk config (e.g. 10 × 3.84 TB)
    const diskSizeTB = 3.84;
    const disksPerNode = 10;
    const actualTiB = nodesNeeded * disksPerNode * diskSizeTB * 0.33; // 3-way usable
    const requiredTiB = totalStorageTiB;

   const clusterCount = splitClusters(nodesNeeded).length;
const actualCores = nodesNeeded * cpu.cores * 2 - clusterCount * SYS_CPU;
    const requiredCores = totalCPU;

    const candidate = {
      nodesNeeded,
      overshoot: 0, // optional if you're already calculating overshoot elsewhere
      cpuModel: cpu.model,
      diskSizeTB,
      dimmCount: 32,
      actualCores,
      requiredCores,
      actualRAM,
      requiredRAM,
      actualTiB,
      requiredTiB
    };

    const score = scoreCandidate(candidate);

    console.groupCollapsed(`🧠 CPU Candidate: ${cpu.model}`);
    console.table({
      CoresPerSocket: cpu.cores,
      UsableCoresPerNode: usableCores,
      NodesNeeded: nodesNeeded,
      ActualCores: actualCores,
      Score: score
    });
    console.groupEnd();

    return { ...cpu, usableCores, nodesNeeded, score };
  });

  const best = candidates.sort((a, b) => a.score - b.score)[0];
  console.log(`✅ Selected CPU (Scored): ${best.model} — ${best.nodesNeeded} nodes, Score: ${best.score}`);
  return best;
}

function selectBestCpuForTotalGHz(requiredGHz) {
  const maxNodes = sizingConstraints.maxTotalNodes;

  const candidates = cpuList
    .map(cpu => {
      const usableCores = cpu.cores * 2 - 4; // SYS_CPU
      const usableGHzPerNode = usableCores * cpu.base_clock_GHz;
      const nodesNeeded = Math.ceil(requiredGHz / usableGHzPerNode);
      const totalGHzDelivered = nodesNeeded * usableGHzPerNode;
      const overshoot = totalGHzDelivered - requiredGHz;
      const score = overshoot * 10 + nodesNeeded * 100 - cpu.base_clock_GHz;

      console.groupCollapsed(`📊 Candidate Score: ${cpuModel || "—"} | Nodes: ${nodesNeeded}`);
console.log("🔍 Inputs:");
console.table({
  CPU_Model: cpuModel || "—",
  DIMM_Count: dimmCount ?? "—",
  Disk_Size_TB: diskSizeTB ?? "—",
  Nodes_Needed: nodesNeeded,
  Actual_Cores: actualCores ?? "—",
  Required_Cores: requiredCores ?? "—",
  Actual_RAM_GB: actualRAM ?? "—",
  Required_RAM_GB: requiredRAM ?? "—",
  Actual_Storage_TiB: actualTiB ?? "—",
  Required_Storage_TiB: requiredTiB ?? "—"
});

console.log("⚖️ Penalties:");
console.table({
  Node_Penalty: sweetSpotNodePenalty(nodesNeeded),
  CPU_Penalty: cpuPenalty(cpuModel || ""),
  Disk_Penalty: diskPenalty(diskSizeTB || 0),
  Memory_Penalty: memoryPenalty(dimmCount || 0),
  CPU_Overshoot: cpuOvershootPenalty(actualCores || 0, requiredCores || 0),
  Memory_Overshoot: memoryOvershootPenalty(actualRAM || 0, requiredRAM || 0),
  Storage_Overshoot: storageOvershootPenalty(actualTiB || 0, requiredTiB || 0),
  Raw_Overshoot: overshoot
});

console.log(`🧮 Total Score: ${totalScore}`);
console.groupEnd();


      return {
        ...cpu,
        usableCores,
        usableGHzPerNode,
        nodesNeeded,
        overshoot,
        score
      };
    })
    .sort((a, b) => a.score - b.score);

  const selected = candidates.find(cpu => cpu.nodesNeeded <= maxNodes) || candidates[0];
  console.log(`✅ Selected CPU (GHz): ${selected.model} — ${selected.nodesNeeded} nodes`);
  return selected;
}
function selectBestCpu(requiredCoresPerNode) {
  const candidates = cpuList
    .map(cpu => {
      const logicalCores = cpu.cores * 2;
      const coreFitScore = logicalCores >= requiredCoresPerNode
        ? logicalCores - requiredCoresPerNode
        : Infinity;

      const isGold6 = /Gold\s6\d{3}/.test(cpu.model) ? 0 : 1;
      const clockPenalty = -cpu.base_clock_GHz;

      const score = coreFitScore * 10 + isGold6 * 100 + clockPenalty;

      return { ...cpu, logicalCores, score };
    })
    .filter(cpu => cpu.score < Infinity)
    .sort((a, b) => a.score - b.score);

  if (!candidates.length) {
    throw new Error(`No CPU meets required ${requiredCoresPerNode} logical cores per node`);
  }

  return candidates[0];
}

function selectBestCpuByGHz(requiredGHz) {
  const maxNodes = sizingConstraints.maxTotalNodes;

  const candidates = cpuList
    .map(cpu => {
      const totalGHzPerNode = cpu.cores * cpu.base_clock_GHz;
      const totalGHzAcrossMaxNodes = totalGHzPerNode * maxNodes;

      if (totalGHzAcrossMaxNodes < requiredGHz) return null;

      return {
        ...cpu,
        totalGHzPerNode,
        score: cpu.cores * 100 - cpu.base_clock_GHz
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);

  if (!candidates.length) {
    throw new Error(`No CPU can meet ${requiredGHz} GHz across ${maxNodes} nodes`);
  }

  return candidates[0];
}

function selectDiskConfig(chassis, totalStorageTiB, resiliency, nodeCount) {
  const counts = getValidDiskCounts(chassis);
  const required = totalStorageTiB;

  let best = null;

  for (const size of diskSizesTB) {
    for (const count of counts) {
      const { usableTiB } = calculateUsableStorage(nodeCount, count, size, resiliency);

      if (usableTiB >= required) {
        const overshoot = usableTiB - required;

        const candidate = {
          nodesNeeded: nodeCount,
          overshoot,
          cpuModel: null,
          diskSizeTB: size,
          dimmCount: null
        };

        const score = scoreCandidate(candidate);

        if (!best || score < best.score) {
          best = {
            diskSizeTB: size,
            disksPerNode: count,
            usableTiB,
            overshoot,
            score
          };
        }
      }
    }
  }

  if (!best) {
    const fallbackSize = diskSizesTB[diskSizesTB.length - 1];
    const fallbackCount = counts[counts.length - 1];
    const { usableTiB } = calculateUsableStorage(nodeCount, fallbackCount, fallbackSize, resiliency);

    best = {
      diskSizeTB: fallbackSize,
      disksPerNode: fallbackCount,
      usableTiB,
      overshoot: usableTiB - required,
      score: Infinity
    };
  }

  return best;
}







/**
 * Main sizing function
 */
function sizeCluster(req) {
  const {
    totalCPU,
    totalGHz,
    totalRAM,
    totalStorage,
    growthPct = 0,
    haLevel,
    chassisModel
  } = req;

  const SYS_CPU = 4;
  const SYS_MEM_RATIO = 0.04;

  let cpu;
  let usableCoresPerNode;
  let usableGHzPerNode;

  if (typeof totalGHz === "number" && totalGHz > 0) {
    cpu = selectBestCpuForTotalGHz(totalGHz);
    usableCoresPerNode = cpu.cores * 2;
    usableGHzPerNode = usableCoresPerNode * cpu.base_clock_GHz;
  } else if (typeof totalCPU === "number" && totalCPU > 0) {
    cpu = selectBestCpuForTotalCPU(totalCPU);
    usableCoresPerNode = cpu.cores * 2;
    usableGHzPerNode = usableCoresPerNode * cpu.base_clock_GHz;
  } else {
    throw new Error("Missing valid totalCPU or totalGHz input");
  }

  const baseClock = cpu.base_clock_GHz;

  const memOpts = getValidMemoryOptions(chassisModel)
    .map(opt => {
      const usable = Math.floor(opt.totalGB * (1 - SYS_MEM_RATIO));
      const nodesNeeded = Math.ceil(totalRAM / usable);
      const overshoot = nodesNeeded * usable - totalRAM;

      const candidate = {
        dimmCount: opt.dimmCount,
        nodesNeeded,
        overshoot,
        cpuModel: cpu.model,
        diskSizeTB: null
      };

      const score = scoreCandidate(candidate);

      return { ...opt, usablePerNode: usable, nodesNeeded, score };
    })
    .filter(opt => opt.nodesNeeded > 0)
    .sort((a, b) => a.score - b.score);

  if (!memOpts.length) throw new Error("No valid memory option found");
  const memOpt = memOpts[0];

  const rawMem = memOpt.totalGB;
  const usableMem = memOpt.usablePerNode;
  const memoryConfig = `${rawMem} GB (${memOpt.dimmCount} × ${memOpt.dimmSize} GB)`;

  let nodes = Math.ceil(Math.max(
    totalGHz > 0 ? totalGHz / usableGHzPerNode : totalCPU / usableCoresPerNode,
    totalRAM / usableMem
  ));

  if (haLevel === "n+1") {
    nodes += 1;
    while (
      (nodes - 1) * usableCoresPerNode < totalCPU ||
      (nodes - 1) * usableMem < totalRAM ||
      (nodes - 1) * usableGHzPerNode < totalGHz
    ) {
      nodes += 1;
    }
  }

  const storRes = nodes >= 3 ? "3-way" : "2-way";
  const diskCfg = selectDiskConfig(chassisModel, totalStorage, storRes, nodes);
  const storage = calculateUsableStorage(nodes, diskCfg.disksPerNode, diskCfg.diskSizeTB, storRes);

  const clusters = splitClusters(nodes);
  const totalOverheadCores = clusters.length * SYS_CPU;
  const totalUsableCores = nodes * usableCoresPerNode - totalOverheadCores;

  const deliveredGHz = +(nodes * usableGHzPerNode).toFixed(2);
  if (totalGHz > 0 && deliveredGHz < totalGHz) {
    console.warn(`⚠️ Delivered ${deliveredGHz} GHz, but ${totalGHz} GHz was requested.`);
  }

  const activeNodes = nodes - 1;
  const postFailureCores = activeNodes * usableCoresPerNode - totalOverheadCores;
  const postFailureRAM = activeNodes * usableMem;

  const postFailureSummary = {
    activeNodes,
    ...(totalCPU > 0 && {
      totalCores: postFailureCores,
      meetsCoreRequirement: postFailureCores >= totalCPU
    }),
    ...(totalGHz > 0 && {
      totalGHz: +(activeNodes * usableGHzPerNode).toFixed(2),
      meetsCpuRequirement: activeNodes * usableGHzPerNode >= totalGHz
    }),
    totalRAM: postFailureRAM,
    meetsRamRequirement: postFailureRAM >= totalRAM
  };

  return {
    nodeCount: nodes,
    clusterCount: clusters.length,
    clusterSizes: clusters,
    chassisModel,
    cpuModel: cpu.model,
    cpuCoresPerSocket: cpu.cores,
    cpuClockGHz: baseClock,
    totalCores: totalUsableCores,
    totalGHz: deliveredGHz,
    memorySizeGB: rawMem,
    totalMemoryGB: nodes * usableMem,
    memoryConfig,
    disksPerNode: diskCfg.disksPerNode,
    diskSizeTB: diskCfg.diskSizeTB,
    resiliency: haLevel,
    storageResiliency: storRes,
    usableTiB: storage.usableTiB,
    reserveTiB: storage.reserveTiB,
    resiliencyTiB: storage.resiliencyTiB,
    postFailureSummary
  };
}

export {
  getSizingPayloadFromHTML,
  calculateVmSizing,
  applyGrowthFactor,
  sizeCluster,
  splitClusters
};
