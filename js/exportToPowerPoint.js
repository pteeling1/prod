export function exportToPowerPoint(result, requirements, diagramImage) {
  const createdBy = prompt("Enter your name (required):");
  if (!createdBy?.trim()) return alert("Name is required to generate the presentation.");

  const projectName = prompt("Enter the project name:");
  if (!projectName?.trim()) return alert("Project name is required.");

  const exportTimestamp = new Date().toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
// ✅ Insert telemetry here — right after validation, before pptx generation
  window.appInsights.trackEvent({
    name: "PowerPointExport",
    properties: {
      userName: createdBy,
      projectName: projectName,
      exportTimestamp: exportTimestamp,
      chassisModel: result?.chassisModel,
      totalNodes: result?.nodeCount,
      location: requirements?.locationName,
      exportMode: "StakeholderView" // or whatever mode applies
    }
  });

  const pptx = new PptxGenJS();
    
  const headingStyle = { fontFace: "Arial", color: "FFFFFF", bold: true };
  const metaStyle = { fontFace: "Arial", color: "FFFFFF" };
  const tableStyle = {
    fontSize: 8, fontFace: "Arial", color: "FFFFFF",
    border: { pt: 0 }, colW: [1.5, 1.5]
  };

  const isManualMode = !requirements || Object.keys(requirements).length === 0;

  // ✅ Handle missing clusterSummaries
  if (!Array.isArray(result.clusterSummaries)) {
    console.warn("⚠️ clusterSummaries missing or invalid. Creating default summary.");
    result.clusterSummaries = [{
      name: "Instance A",
      nodeCount: result.nodeCount || 1,
      usableCores: result.totalUsableCores || result.totalCores || 0,
      usableGHz: result.totalGHz || 0,
      usableMemoryGB: result.totalUsableMemory || result.totalMemoryGB || 0,
      usableTiB: parseFloat(result.usableTiB) || 0,
      resiliency: result.storageResiliency || "3-way",
      switchMode: "Mixed",
      postFailure: {
        activeNodes: Math.max(0, (result.nodeCount || 1) - 1),
        usableCores: Math.max(0, (result.totalUsableCores || result.totalCores || 0) - Math.floor((result.totalUsableCores || result.totalCores || 0) / (result.nodeCount || 1))),
        usableGHz: Math.max(0, (result.totalGHz || 0) - Math.floor((result.totalGHz || 0) / (result.nodeCount || 1))),
        usableMemoryGB: Math.max(0, (result.totalUsableMemory || result.totalMemoryGB || 0) - Math.floor((result.totalUsableMemory || result.totalMemoryGB || 0) / (result.nodeCount || 1)))
      }
    }];
  }

  // ✅ Create safe totalClusterResources if missing
  if (!result.totalClusterResources) {
    console.warn("⚠️ totalClusterResources missing. Creating from available data.");
    result.totalClusterResources = {
      normal: {
        nodes: result.nodeCount || 1,
        usableCores: result.totalUsableCores || result.totalCores || 0,
        usableGHz: result.totalGHz || 0,
        usableMemoryGB: result.totalUsableMemory || result.totalMemoryGB || 0
      },
      postFailure: {
        activeNodes: Math.max(0, (result.nodeCount || 1) - 1),
        usableCores: Math.max(0, (result.totalUsableCores || result.totalCores || 0) - Math.floor((result.totalUsableCores || result.totalCores || 0) / (result.nodeCount || 1))),
        usableGHz: Math.max(0, (result.totalGHz || 0) - Math.floor((result.totalGHz || 0) / (result.nodeCount || 1))),
        usableMemoryGB: Math.max(0, (result.totalUsableMemory || result.totalMemoryGB || 0) - Math.floor((result.totalUsableMemory || result.totalMemoryGB || 0) / (result.nodeCount || 1)))
      }
    };
  }

  const allSummaries = [...result.clusterSummaries, {
    name: "Total Capacity (Aggregate)",
    nodeCount: result.totalClusterResources.normal.nodes,
    usableCores: result.totalClusterResources.normal.usableCores,
    usableGHz: result.totalClusterResources.normal.usableGHz,
    usableMemoryGB: result.totalClusterResources.normal.usableMemoryGB,
    usableTiB: result.usableTiB,
    resiliency: result.storageResiliency,
    switchMode: result.switchMode || "Mixed",
    postFailure: result.totalClusterResources.postFailure
  }];

  function addTimestampFooter(slide, timestamp) {
    slide.addText(`Exported: ${timestamp}`, {
      x: 6.5, y: 6.8, fontSize: 8, fontFace: "Arial", color: "FFFFFF", align: "right"
    });
  }

  function sanitizeTable(table) {
    return table.map(row =>
      row.map(cell => {
        if (typeof cell === "string") return { text: cell };
        if (typeof cell === "number") return { text: cell.toString() };
        if (cell && typeof cell === "object" && "text" in cell) return cell;
        return { text: "—" };
      })
    );
  }

  function buildRequirementsTable(req) {
    return [
      [{ text: "Requirement", options: { bold: true } }, " "],
      ["Resiliency", req.haLevel || "—"],
      ["Required Cores", `${(req.totalCPU || req.totalCores || 0).toLocaleString()}`],
      ["Required GHz", req.totalGHz ? `${parseFloat(req.totalGHz).toFixed(0)} GHz` : "—"],
      ["Required RAM", `${(req.totalRAM || req.totalMemoryGB || 0).toLocaleString()} GB`],
      ["Required Storage", `${parseFloat(req.totalStorage || req.usableTiB || 0).toFixed(2)} TiB`],
      ["Growth", `${((req.growthPct || 0) * 100).toFixed(1)}%`]
    ];
  }

  function buildPostFailureTable(res) {
    const pf = res.totalClusterResources?.postFailure;
    const usableGHz = pf?.usableGHz || 0;
    return [
      [{ text: "Post-Failure Capacity (N-1 Resiliency)", options: { bold: true } }, " "],
      ["Active Nodes", pf?.activeNodes || 0],
      ["Cores (available)", `${(pf?.usableCores || 0).toLocaleString()}`],
      ["GHz (available)", usableGHz ? `${parseFloat(usableGHz).toFixed(0)} GHz` : "—"],
      ["RAM (available)", `${(pf?.usableMemoryGB || 0).toLocaleString()} GB`]
    ];
  }

  function buildRecommendationsTable(res) {
    const usableGHz = res.totalClusterResources?.normal?.usableGHz || res.totalGHz || 0;
    return [
      [{ text: "Recommendation", options: { bold: true } }, " "],
      ["Clusters / Instances", `${res.clusterCount || 1}`],
      ["Nodes / Machines", `${res.nodeCount || 1}`],
      ["Total Cores (available)", `${(res.totalCores || 0).toLocaleString()} (${(res.totalUsableCores || res.totalCores || 0).toLocaleString()})`],
      ["Total GHz (available)", usableGHz ? `${parseFloat(usableGHz).toFixed(0)} GHz` : "—"],
      ["Total Memory (available)", `${(res.totalMemoryGB || 0).toLocaleString()} GB (${(res.totalUsableMemory || res.totalMemoryGB || 0).toLocaleString()} GB)`],
      ["Disks", `${res.disksPerNode || 0} × ${res.diskSizeTB || 0} TB`],
      ["Usable Storage", `${res.usableTiB || 0} TiB`]
    ];
  }

  function buildNodeTable(res) {
    return [
      [{ text: "Node Configuration", options: { bold: true } }, " "],
      ["Chassis", res.chassisModel || "—"],
      ["CPU", `2× ${res.cpuModel || "—"}`],
      ["Cores per CPU", res.cpuCoresPerSocket || "—"],
      ["Clockspeed", `${res.cpuClockGHz || "—"} GHz`],
      ["Memory", res.memoryConfig || `${res.memorySizeGB || 0} GB`],
      ["Disks", `${res.disksPerNode || 0} × ${res.diskSizeTB || 0} TB`]
    ];
  }

  function createTitleSlide() {
    const slide = pptx.addSlide();
    slide.background = { path: "/images/slidebackground1.png" };
    slide.addText(`AX Sizing Report ${projectName}`, { x: 0.5, y: 1.5, fontSize: 28, ...headingStyle });
    slide.addText(`Created By: ${createdBy}`, { x: 0.5, y: 2.2, fontSize: 16, ...metaStyle });
    slide.addText(`Date: ${exportTimestamp}`, { x: 0.5, y: 2.7, fontSize: 14, ...metaStyle });
  }

  function createSummarySlide() {
    const slide = pptx.addSlide();
    slide.background = { path: "/images/slidebackground1.png" };

    slide.addText(isManualMode ? "Manual Configuration Summary" : "Requirements vs Recommendations", {
      x: 0.5, y: 0.5, fontSize: 16, ...headingStyle
    });

    if (isManualMode) {
      slide.addText("Manual Mode: Input requirements not provided", {
        x: 0.5, y: 0.7, fontSize: 10, fontFace: "Arial", color: "888888", italic: true
      });
    }

    // Background rectangles
    slide.addText("", {
      shape: pptx.shapes.RECTANGLE,
      x: 0.5,
      y: 0.9,
      w: 2.2,
      h: 1.8,
      fill: { type: "solid", color: "000000", transparency: 50 },
      line: "none"
    });

    slide.addText("", {
      shape: pptx.shapes.RECTANGLE,
      x: 3,
      y: 0.9,
      w: 3.5,
      h: 1.8,
      fill: { type: "solid", color: "000000", transparency: 50 },
      line: "none"
    });

    slide.addText("", {
      shape: pptx.shapes.RECTANGLE,
      x: 6.8,
      y: 0.9,
      w: 3.0,
      h: 1.8,
      fill: { type: "solid", color: "000000", transparency: 50 },
      line: "none"
    });

    // Tables (no fill)
    if (!isManualMode && requirements) {
      slide.addTable(buildRequirementsTable(requirements), {
        x: 0.5, y: 0.9, w: 2.2,
        fontSize: 8,
        fontFace: "Arial",
        color: "FFFFFF",
        border: { pt: 0 },
        colW: [1.1, 1.1]
      });
    }

    slide.addTable(sanitizeTable(buildRecommendationsTable(result)), {
      x: 3, y: 0.9, w: 3.5,
      fontSize: 8,
      fontFace: "Arial",
      color: "FFFFFF",
      border: { pt: 0 },
      colW: [1.5, 2.0]
    });

    slide.addTable(sanitizeTable(buildNodeTable(result)), {
      x: 6.8, y: 0.9, w: 3.0,
      fontSize: 8,
      fontFace: "Arial",
      color: "FFFFFF",
      border: { pt: 0 },
      colW: [1.3, 1.7]
    });

    // Post-failure capacity section
    slide.addText("", {
      shape: pptx.shapes.RECTANGLE,
      x: 0.5,
      y: 2.8,
      w: 9.3,
      h: 1.6,
      fill: { type: "solid", color: "000000", transparency: 50 },
      line: "none"
    });

    slide.addTable(sanitizeTable(buildPostFailureTable(result)), {
      x: 0.5, y: 2.8, w: 9.3,
      fontSize: 8,
      fontFace: "Arial",
      color: "FFFFFF",
      border: { pt: 0 },
      colW: [3.5, 2.0, 1.8, 1.5, 0.5]
    });

    addTimestampFooter(slide, exportTimestamp);
  }

  function createInstanceSummarySlides() {
    const chunkSize = 4;
    for (let i = 0; i < allSummaries.length; i += chunkSize) {
      const group = allSummaries.slice(i, i + chunkSize);
      const slide = pptx.addSlide();
      slide.background = { path: "/images/slidebackground1.png" };
      slide.addText(`Instance Summaries — Page ${Math.floor(i / chunkSize) + 1}`, {
        x: 0.5, y: 0.3, fontSize: 16, ...headingStyle
      });

      group.forEach((summary, j) => {
        const x = 0.5 + (j % 2) * 4.5;
        const yHeader = j < 2 ? 0.71 : 3.25;
        const yTable = j < 2 ? 0.93 : 3.46;

        // Background rectangle
        slide.addText("", {
          shape: pptx.shapes.RECTANGLE,
          x,
          y: yTable - 0.03,
          w: 4.2,
          h: 2.2,
          fill: { type: "solid", color: "000000", transparency: 50 },
          line: "none"
        });

        // Header
        slide.addText(summary.name, {
          x, y: yHeader, fontSize: 14, bold: true, fontFace: "Arial", color: "FFFFFF"
        });

        // Table (no fill)
        slide.addTable(sanitizeTable([
          ["Nodes", summary.nodeCount || 0],
          ["CPU", `${summary.usableCores || 0} cores / ${parseFloat(summary.usableGHz || 0).toFixed(1)} GHz`],
          ["RAM", `${(summary.usableMemoryGB || 0).toLocaleString()} GB`],
          ["Storage", `${parseFloat(summary.usableTiB || 0).toFixed(2)} TiB usable`],
          ["Resiliency", summary.resiliency || "—"],
          ["Switch Mode", summary.switchMode || "—"],
          ["Post-Failure Nodes", summary.postFailure?.activeNodes || 0],
          ["Post-Failure CPU", `${summary.postFailure?.usableCores || 0} cores / ${parseFloat(summary.postFailure?.usableGHz || 0).toFixed(1)} GHz`],
          ["Post-Failure RAM", `${(summary.postFailure?.usableMemoryGB || 0).toLocaleString()} GB`]
        ]), {
          x, y: yTable, w: 4.2,
          fontSize: 8,
          fontFace: "Arial",
          color: "FFFFFF",
          border: { pt: 0 },
          colW: [1.5, 2.7]
        });
      });

      addTimestampFooter(slide, exportTimestamp);
    }
  }

function createDiagramSlide(pptx, imageDataUrl, timestamp) {
  return new Promise((resolve) => {
    const slide = pptx.addSlide();
    slide.background = { path: "/images/slidebackground1.png" };
    slide.addText("Topology Layout", {
      x: 0.5,
      y: 0.5,
      fontSize: 16,
      fontFace: "Arial",
      color: "FFFFFF",
      bold: true
    });

    const DPI = 96;
    const MAX_WIDTH_IN = 9;
    const MAX_HEIGHT_IN = 4.8;

    const img = new Image();
    img.src = imageDataUrl;

    img.onload = () => {
      const imageWidthIn = img.width / DPI;
      const imageHeightIn = img.height / DPI;

      const widthRatio = MAX_WIDTH_IN / imageWidthIn;
      const heightRatio = MAX_HEIGHT_IN / imageHeightIn;
      const scale = Math.min(widthRatio, heightRatio);

      const finalWidth = imageWidthIn * scale;
      const finalHeight = imageHeightIn * scale;

      slide.addImage({
        data: imageDataUrl,
        x: 0.5,
        y: 1.0,
        w: finalWidth,
        h: finalHeight
      });

      // Add timestamp footer
      addTimestampFooter(slide, timestamp);

      // Add disclaimer at bottom of slide
      slide.addText(
        "Visuals are for reference only. Images do not represent actual solution or bill of materials.",
        {
          x: 0.5,
          y: 5.25,
          fontSize: 10,
          fontFace: "Arial",
          color: "FFFFFF",
          italic: true,
          w: 9,
          h: 0.3
        }
      );

      resolve();
    };
  });
}
createTitleSlide();
createSummarySlide();
createInstanceSummarySlides();

if (diagramImage) {
  createDiagramSlide(pptx, diagramImage, exportTimestamp).then(() => {
  pptx.writeFile({ fileName: `${projectName}_Sizing.pptx` });
});
} else {
  pptx.writeFile({ fileName: `${projectName}_Sizing.pptx` });
}}