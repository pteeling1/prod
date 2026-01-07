// hardwareConfig.js

// 🧠 DIMM sizes in GB
export const dimmSizesGB = [16, 32, 64, 96, 128, 256];

// 🧮 Valid DIMM population counts
export const dimmQuantities = [8, 12, 16, 24, 32];

// 🚫 Restrictions: DIMM sizes that cannot be used with certain quantities
export const dimmRestrictions = {
  96: [8] // 96GB DIMMs cannot be used in 8-slot configs
};

/**
 * Returns valid memory configurations based on DIMM size and quantity.
 */
export function getValidMemoryOptions() {
  const options = [];

  for (const size of dimmSizesGB) {
    for (const qty of dimmQuantities) {
      const restricted = dimmRestrictions[size];
      if (restricted && restricted.includes(qty)) continue;

      options.push({
        label: `${qty} × ${size}GB`,
        totalGB: qty * size,
        dimmSize: size,
        dimmCount: qty
      });
    }
  }

  return options;
}

// 💾 Disk sizes in TB
export const diskSizesTB = [0.96, 1.92, 3.84, 7.68, 15.36];

// 🚪 Chassis disk limits by model
export const chassisDiskLimits = {
  "AX 660": [2, 10],
  "AX 670": [2, 16],
  "AX 760": [2, 24],
  "AX 770": [2, 16]
};

/**
 * Returns valid disk counts for a given chassis model.
 */
export function getValidDiskCounts(chassisModel) {
  const [min, max] = chassisDiskLimits[chassisModel] || [2, 24];
  return Array.from({ length: max - min + 1 }, (_, i) => i + min);
}

// 🧮 Cluster sizes (1–16 nodes)
export const clusterSizes = Array.from({ length: 16 }, (_, i) => i + 1);

// ⚙️ Sizing constraints
export const sizingConstraints = {
  maxClusterSize: 7, // clusters larger than this should be split
  minClusterSize: 1,
  // maxTotalNodes: 16 // optional UI or export constraint
};