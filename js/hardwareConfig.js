// hardwareConfig.js

// 🧠 DIMM sizes in GB (default for standard systems)
const DEFAULT_DIMM_SIZES = [16, 32, 64, 96, 128, 256];

// 🧮 Valid DIMM population counts (default for standard systems)
const DEFAULT_DIMM_QUANTITIES = [8, 12, 16, 24, 32];

// 🧠 DIMM sizes for Ice Lake D (AX-4510c, AX-4520c) - 4 DIMM slots only
const ICE_LAKE_D_DIMM_SIZES = [16, 32, 64, 128];
const ICE_LAKE_D_DIMM_QUANTITIES = [4];

// 🧠 Chassis-specific DIMM configurations
export const chassisDimmConfig = {
  "AX 660": { sizes: DEFAULT_DIMM_SIZES, quantities: DEFAULT_DIMM_QUANTITIES },
  "AX 670": { sizes: DEFAULT_DIMM_SIZES, quantities: DEFAULT_DIMM_QUANTITIES },
  "AX 760": { sizes: DEFAULT_DIMM_SIZES, quantities: DEFAULT_DIMM_QUANTITIES },
  "AX 770": { sizes: DEFAULT_DIMM_SIZES, quantities: DEFAULT_DIMM_QUANTITIES },
  "AX-4510c": { sizes: ICE_LAKE_D_DIMM_SIZES, quantities: ICE_LAKE_D_DIMM_QUANTITIES },
  "AX-4520c": { sizes: ICE_LAKE_D_DIMM_SIZES, quantities: ICE_LAKE_D_DIMM_QUANTITIES }
};

// 🚫 Restrictions: DIMM sizes that cannot be used with certain quantities
export const dimmRestrictions = {
  96: [8] // 96GB DIMMs cannot be used in 8-slot configs (standard systems only)
};

// 🧠 Maximum memory per node by chassis model (in GB)
export const chassisMemoryLimits = {
  "AX 660": 4096, // 32 x 128GB DIMMs
  "AX 670": 4096, // 32 x 128GB DIMMs
  "AX 760": 4096, // 32 x 128GB DIMMs
  "AX 770": 4096, // 32 x 128GB DIMMs
  "AX-4510c": 512, // 4 x 128GB max (DDR5-3200)
  "AX-4520c": 512  // 4 x 128GB max (DDR5-3200)
};

// 🎯 CPU families compatible with each chassis model
export const chassisCpuCompatibility = {
  "AX 660": ["3rd Gen Xeon Scalable", "Xeon Platinum", "Xeon Gold"],
  "AX 670": ["3rd Gen Xeon Scalable", "Xeon Platinum", "Xeon Gold"],
  "AX 760": ["3rd Gen Xeon Scalable", "Xeon Platinum", "Xeon Gold"],
  "AX 770": ["3rd Gen Xeon Scalable", "Xeon Platinum", "Xeon Gold"],
  "AX-4510c": ["Xeon D"], // Ice Lake D only
  "AX-4520c": ["Xeon D"]  // Ice Lake D only
};

/**
 * Returns the maximum possible memory for a given chassis model.
 */
export function getMaxMemoryPerNode(chassisModel) {
  return chassisMemoryLimits[chassisModel] || 2048;
}

/**
 * Returns valid memory configurations based on DIMM size and quantity for a given chassis.
 */
export function getValidMemoryOptions(chassisModel = "AX 660") {
  const config = chassisDimmConfig[chassisModel] || chassisDimmConfig["AX 660"];
  const options = [];

  for (const size of config.sizes) {
    for (const qty of config.quantities) {
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

/**
 * Returns valid DIMM sizes for a given chassis model.
 */
export function getValidDimmSizes(chassisModel = "AX 660") {
  const config = chassisDimmConfig[chassisModel] || chassisDimmConfig["AX 660"];
  return config.sizes;
}

/**
 * Returns valid DIMM quantities for a given chassis model.
 */
export function getValidDimmQuantities(chassisModel = "AX 660") {
  const config = chassisDimmConfig[chassisModel] || chassisDimmConfig["AX 660"];
  return config.quantities;
}

// 💾 Disk sizes in TB
export const diskSizesTB = [0.96, 1.92, 3.84, 7.68, 15.36];

// 🚪 Chassis disk count limits by model
export const chassisDiskLimits = {
  "AX 660": [2, 10],
  "AX 670": [2, 16],
  "AX 760": [2, 24],
  "AX 770": [2, 16],
  "AX-4510c": [2, 4],
  "AX-4520c": [6, 12]
};

// 💾 Maximum drive size per chassis model (in TB)
export const driveSizeLimits = {
  "AX 660": 15.36,  // Standard max
  "AX 670": 15.36,  // Standard max
  "AX 760": 15.36,  // Standard max
  "AX 770": 15.36,  // Standard max
  "AX-4510c": 3.84, // 1U form factor limit
  "AX-4520c": 3.84  // 2U form factor limit
};

/**
 * Returns the maximum drive size for a given chassis model.
 */
export function getMaxDriveSize(chassisModel) {
  return driveSizeLimits[chassisModel] || 15.36;
}

/**
 * Returns valid disk counts for a given chassis model.
 */
export function getValidDiskCounts(chassisModel) {
  const [min, max] = chassisDiskLimits[chassisModel] || [2, 24];
  return Array.from({ length: max - min + 1 }, (_, i) => i + min);
}

/**
 * Returns valid disk sizes for a given chassis model.
 */
export function getValidDiskSizes(chassisModel) {
  const maxSize = getMaxDriveSize(chassisModel);
  return diskSizesTB.filter(size => size <= maxSize);
}

// 🧮 Cluster sizes (1–16 nodes)
export const clusterSizes = Array.from({ length: 16 }, (_, i) => i + 1);

// ⚙️ Sizing constraints
export const sizingConstraints = {
  maxClusterSize: 6, // clusters larger than this should be split
  minClusterSize: 1,
  // maxTotalNodes: 16 // optional UI or export constraint
};