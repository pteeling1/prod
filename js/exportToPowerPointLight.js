/**
 * Light Editorial Theme PowerPoint Exporter
 * Clean, minimal design with muted accents and generous spacing
 */

// ===== LIGHT EDITORIAL THEME CONSTANTS =====
export const LIGHT_THEME = {
  background: { color: 'FFFFFF' },
  textColor: '333333',
  fontFace: 'Segoe UI',
  accent1: '0066CC',      // vibrant modern blue
  accent2: '6B4CE6',      // modern purple
  accentSoft: '4A90E2',   // light blue
  borderLight: 'E8E8E8',
  borderMedium: 'D0D0D0',
  borderDark: '666666',
  softGray1: 'F8F9FA',
  softGray2: 'F0F2F5',
  mediumGray: '666666'
};

export function exportToPowerPointLight(result, requirements, diagramImage) {
  const createdBy = prompt("Enter your name (required):");
  if (!createdBy?.trim()) return alert("Name is required to generate the presentation.");

  const projectName = prompt("Enter the project name:");
  if (!projectName?.trim()) return alert("Project name is required.");

  const exportTimestamp = new Date().toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });

  // ✅ Telemetry tracking
  if (window.appInsights) {
    window.appInsights.trackEvent({
      name: "PowerPointExportLight",
      properties: {
        userName: createdBy,
        projectName: projectName,
        exportTimestamp: exportTimestamp,
        chassisModel: result?.chassisModel,
        totalNodes: result?.nodeCount,
        location: requirements?.locationName,
        exportMode: "LightEditorial"
      }
    });
  }

  const pptx = new PptxGenJS();

  // ===== HELPER FUNCTIONS =====

  function addSectionHeader(slide, title, y = 0.5, accentColor = LIGHT_THEME.accent2) {
    // Thin colored line above title
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: y - 0.12,
      w: 9.0,
      h: 0.04,
      fill: { color: accentColor },
      line: { type: "none" }
    });

    // Title with muted color
    slide.addText(title, {
      x: 0.5,
      y: y,
      w: 9.0,
      h: 0.28,
      fontSize: 16,
      bold: true,
      fontFace: LIGHT_THEME.fontFace,
      color: LIGHT_THEME.textColor,
      align: "left"
    });

    return y + 0.35; // Return next Y position
  }

  function addDivider(slide, y, width = 9.0, xOffset = 0.5, color = LIGHT_THEME.borderLight) {
    slide.addShape(pptx.ShapeType.rect, {
      x: xOffset,
      y: y,
      w: width,
      h: 0.02,
      fill: { color: color },
      line: { type: "none" }
    });
  }

  function addLightTable(slide, data, options = {}) {
    const {
      x = 0.5,
      y = 1.0,
      w = 9.0,
      headerColor = LIGHT_THEME.accent2,
      headerTextColor = LIGHT_THEME.background.color,
      rowBgColor = LIGHT_THEME.softGray1,
      altRowBgColor = LIGHT_THEME.background.color,
      borderColor = LIGHT_THEME.borderLight,
      fontSize = 9,
      headerFontSize = 10,
      colW = []
    } = options;

    const sanitizedData = data.map(row =>
      row.map(cell => {
        if (typeof cell === "string") return { text: cell };
        if (typeof cell === "number") return { text: cell.toString() };
        if (cell && typeof cell === "object" && "text" in cell) return cell;
        return { text: "—" };
      })
    );

    // Build styled rows
    const styledData = sanitizedData.map((row, idx) => {
      if (idx === 0) {
        // Header row
        return row.map(cell => ({
          ...cell,
          options: {
            bold: true,
            fontSize: headerFontSize,
            fontFace: "Segoe UI",
            color: headerTextColor,
            fill: { color: headerColor }
          }
        }));
      } else {
        // Data rows with alternating backgrounds
        const bgColor = idx % 2 === 0 ? rowBgColor : altRowBgColor;
        return row.map(cell => ({
          ...cell,
          options: {
            fontSize: fontSize,
            fontFace: LIGHT_THEME.fontFace,
            color: LIGHT_THEME.textColor,
            fill: { color: bgColor }
          }
        }));
      }
    });

    slide.addTable(styledData, {
      x: x,
      y: y,
      w: w,
      border: { pt: 0.5, color: borderColor },
      colW: colW.length > 0 ? colW : undefined,
      align: "left",
      fontFace: LIGHT_THEME.fontFace
    });
  }

  function buildRequirementsTable(req) {
    return [
      [{ text: "Requirement" }, { text: "Value" }],
      ["Resiliency", req.haLevel || "—"],
      ["Required Cores", `${(req.totalCPU || req.totalCores || 0).toLocaleString()}`],
      ["Required RAM", `${(req.totalRAM || req.totalMemoryGB || 0).toLocaleString()} GB`],
      ["Required Storage", `${parseFloat(req.totalStorage || req.usableTiB || 0).toFixed(2)} TiB`],
      ["Growth", `${((req.growthPct || 0) * 100).toFixed(1)}%`]
    ];
  }

  function buildRecommendationsTable(res) {
    return [
      [{ text: "Metric" }, { text: "Value" }],
      ["Clusters / Instances", `${res.clusterCount || 1}`],
      ["Nodes / Machines", `${res.nodeCount || 1}`],
      [
        "Total Cores",
        `${(res.totalCores || 0).toLocaleString()} (${(res.totalUsableCores || res.totalCores || 0).toLocaleString()} usable)`
      ],
      [
        "Total Memory",
        `${(res.totalMemoryGB || 0).toLocaleString()} GB (${(res.totalUsableMemory || res.totalMemoryGB || 0).toLocaleString()} GB usable)`
      ],
      ["Disks", `${res.disksPerNode || 0} × ${res.diskSizeTB || 0} TB`],
      ["Usable Storage", `${res.usableTiB || 0} TiB`]
    ];
  }

  function buildNodeTable(res) {
    return [
      [{ text: "Component" }, { text: "Specification" }],
      ["Chassis", res.chassisModel || "—"],
      ["CPU", `2× ${res.cpuModel || "—"}`],
      ["Cores per CPU", res.cpuCoresPerSocket || "—"],
      ["Clockspeed", `${res.cpuClockGHz || "—"} GHz`],
      ["Memory", res.memoryConfig || `${res.memorySizeGB || 0} GB`],
      ["Disks", `${res.disksPerNode || 0} × ${res.diskSizeTB || 0} TB`]
    ];
  }

  // ===== SLIDE CREATION FUNCTIONS =====

  function createTitleSlide() {
    const slide = pptx.addSlide();
    slide.background = { color: LIGHT_THEME.background.color };

    // Left accent
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.08,
      h: 7.5,
      fill: { color: LIGHT_THEME.accent2 },
      line: { type: "none" }
    });

    // Main title
    slide.addText(`AX Sizing Report`, {
      x: 0.5,
      y: 1.5,
      w: 8.5,
      h: 0.5,
      fontSize: 44,
      bold: true,
      fontFace: LIGHT_THEME.fontFace,
      color: LIGHT_THEME.textColor,
      align: "left"
    });

    // Project name
    slide.addText(projectName, {
      x: 0.5,
      y: 2.1,
      w: 8.5,
      h: 0.3,
      fontSize: 24,
      fontFace: LIGHT_THEME.fontFace,
      color: LIGHT_THEME.accent2
    });

    // Divider
    addDivider(slide, 2.5);

    // Metadata
    slide.addText(`Created by ${createdBy}`, {
      x: 0.5,
      y: 2.8,
      w: 8.5,
      h: 0.25,
      fontSize: 12,
      fontFace: LIGHT_THEME.fontFace,
      color: LIGHT_THEME.mediumGray
    });

    slide.addText(`Exported ${exportTimestamp}`, {
      x: 0.5,
      y: 3.1,
      w: 8.5,
      h: 0.25,
      fontSize: 12,
      fontFace: LIGHT_THEME.fontFace,
      color: LIGHT_THEME.mediumGray
    });
  }

  function createSummarySlide() {
    const slide = pptx.addSlide();
    slide.background = { color: LIGHT_THEME.background.color };

    const titleY = addSectionHeader(
      slide,
      isManualMode ? "Manual Configuration Summary" : "Requirements vs. Recommendations",
      0.5,
      LIGHT_THEME.accent1
    );

    const contentY = titleY + 0.25;
    const colWidth = 2.9;
    const colGap = 0.1;

    // Left column: Requirements (if not manual mode)
    let leftX = 0.5;
    if (!isManualMode && requirements) {
      slide.addText("Input Requirements", {
        x: leftX,
        y: contentY,
        w: colWidth,
        h: 0.15,
        fontSize: 8,
        bold: true,
        fontFace: LIGHT_THEME.fontFace,
        color: LIGHT_THEME.accent2
      });

      addLightTable(slide, buildRequirementsTable(requirements), {
        x: leftX,
        y: contentY + 0.15,
        w: colWidth,
        headerColor: LIGHT_THEME.accent2,
        colW: [colWidth * 0.5 - 0.05, colWidth * 0.5 - 0.05],
        fontSize: 6.5,
        headerFontSize: 7
      });
    }

    // Middle column: Recommendations
    let middleX = leftX + colWidth + colGap;
    slide.addText("Recommended Solution", {
      x: middleX,
      y: contentY,
      w: colWidth,
      h: 0.15,
      fontSize: 8,
      bold: true,
      fontFace: LIGHT_THEME.fontFace,
      color: LIGHT_THEME.accent1
    });

    addLightTable(slide, buildRecommendationsTable(result), {
      x: middleX,
      y: contentY + 0.15,
      w: colWidth,
      headerColor: LIGHT_THEME.accent1,
      colW: [colWidth * 0.5 - 0.05, colWidth * 0.5 - 0.05],
      fontSize: 6.5,
      headerFontSize: 7
    });

    // Right column: Node Configuration
    let rightX = middleX + colWidth + colGap;
    slide.addText("Node Configuration", {
      x: rightX,
      y: contentY,
      w: colWidth,
      h: 0.15,
      fontSize: 8,
      bold: true,
      fontFace: LIGHT_THEME.fontFace,
      color: LIGHT_THEME.accentSoft
    });

    addLightTable(slide, buildNodeTable(result), {
      x: rightX,
      y: contentY + 0.15,
      w: colWidth,
      headerColor: LIGHT_THEME.accentSoft,
      colW: [colWidth * 0.5 - 0.05, colWidth * 0.5 - 0.05],
      fontSize: 6.5,
      headerFontSize: 7
    });

    // Footer
    slide.addText(`Exported: ${exportTimestamp}`, {
      x: 0.5,
      y: 6.9,
      w: 9.0,
      h: 0.25,
      fontSize: 9,
      fontFace: LIGHT_THEME.fontFace,
      color: LIGHT_THEME.softGray2,
      align: "right"
    });
  }

  function createInstanceSummarySlides() {
    // ✅ Handle missing clusterSummaries
    if (!Array.isArray(result.clusterSummaries)) {
      console.warn("⚠️ clusterSummaries missing or invalid.");
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

    if (!result.totalClusterResources) {
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

    const chunkSize = 1;
    for (let i = 0; i < allSummaries.length; i += chunkSize) {
      const group = allSummaries.slice(i, i + chunkSize);
      const slide = pptx.addSlide();
      slide.background = { color: LIGHT_THEME.background.color };

      const pageNum = Math.floor(i / chunkSize) + 1;
      const totalPages = Math.ceil(allSummaries.length / chunkSize);

      const titleY = addSectionHeader(
        slide,
        `Instance Summaries (${pageNum}/${totalPages})`,
        0.5,
        LIGHT_THEME.accent1
      );

      let currentY = titleY + 0.1;

      group.forEach((summary, idx) => {
        // Instance header
        slide.addText(summary.name, {
          x: 0.5,
          y: currentY,
          w: 9.0,
          h: 0.2,
          fontSize: 9,
          bold: true,
          fontFace: LIGHT_THEME.fontFace,
          color: LIGHT_THEME.textColor
        });

        currentY += 0.2;

        // Instance details table
        const instanceTable = [
          [{ text: "Metric" }, { text: "Value" }],
          ["Active Nodes", summary.nodeCount || 0],
          ["CPU", `${summary.usableCores || 0} cores / ${parseFloat(summary.usableGHz || 0).toFixed(1)} GHz`],
          ["RAM", `${(summary.usableMemoryGB || 0).toLocaleString()} GB`],
          ["Storage", `${parseFloat(summary.usableTiB || 0).toFixed(2)} TiB usable`],
          ["Resiliency", summary.resiliency || "—"],
          ["Switch Mode", summary.switchMode || "—"]
        ];

        if (summary.postFailure) {
          instanceTable.push(
            ["Post-Failure Nodes", summary.postFailure.activeNodes || 0],
            ["Post-Failure CPU", `${summary.postFailure.usableCores || 0} cores / ${parseFloat(summary.postFailure.usableGHz || 0).toFixed(1)} GHz`],
            ["Post-Failure RAM", `${(summary.postFailure.usableMemoryGB || 0).toLocaleString()} GB`]
          );
        }

        addLightTable(slide, instanceTable, {
          x: 0.5,
          y: currentY,
          w: 9.0,
          headerColor: LIGHT_THEME.accent2,
          colW: [3.5, 5.5],
          fontSize: 7.5,
          headerFontSize: 8.5
        });

        // Estimate table height: header (0.22) + rows (instanceTable.length - 1) * 0.2
        const rowCount = instanceTable.length;
        const estimatedTableHeight = 0.22 + (rowCount - 1) * 0.2;
        currentY += estimatedTableHeight + 0.08;

        // Divider between instances
        if (idx < group.length - 1) {
          addDivider(slide, currentY);
          currentY += 0.12;
        }
      });

      // Footer
      slide.addText(`Exported: ${exportTimestamp}`, {
        x: 0.5,
        y: 6.75,
        w: 9.0,
        h: 0.2,
        fontSize: 8,
        fontFace: LIGHT_THEME.fontFace,
        color: LIGHT_THEME.softGray2,
        align: "right"
      });
    }
  }

  function createDiagramSlide(imageDataUrl) {
    return new Promise((resolve) => {
      const slide = pptx.addSlide();
      slide.background = { color: LIGHT_THEME.background.color };

      addSectionHeader(slide, "Topology Layout", 0.5, LIGHT_THEME.accentSoft);

      const DPI = 96;
      const MAX_WIDTH_IN = 8.5;
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
        const xOffset = (9.0 - finalWidth) / 2 + 0.5;

        slide.addImage({
          data: imageDataUrl,
          x: xOffset,
          y: 1.0,
          w: finalWidth,
          h: finalHeight
        });

        // Disclaimer
        slide.addText(
          "Visuals are for reference only. Images do not represent actual solution or bill of materials.",
          {
            x: 0.5,
            y: 6.2,
            w: 9.0,
            h: 0.4,
            fontSize: 9,
            fontFace: LIGHT_THEME.fontFace,
            color: LIGHT_THEME.mediumGray,
            italic: true,
            align: "center"
          }
        );

        // Footer
        slide.addText(`Exported: ${exportTimestamp}`, {
          x: 0.5,
          y: 6.9,
          w: 9.0,
          h: 0.25,
          fontSize: 9,
          fontFace: LIGHT_THEME.fontFace,
          color: LIGHT_THEME.softGray2,
          align: "right"
        });

        resolve();
      };

      img.onerror = () => {
        console.warn("⚠️ Failed to load diagram image");
        resolve();
      };
    });
  }

  // ===== BUILD AND EXPORT PRESENTATION =====

  const isManualMode = !requirements || Object.keys(requirements).length === 0;

  createTitleSlide();
  createSummarySlide();
  createInstanceSummarySlides();

  if (diagramImage) {
    createDiagramSlide(diagramImage).then(() => {
      pptx.writeFile({ fileName: `${projectName}_Sizing_Light.pptx` });
    });
  } else {
    pptx.writeFile({ fileName: `${projectName}_Sizing_Light.pptx` });
  }
}
