// === Topology Visualization Functions ===

function generatePeerLinks(nodeCards, switchMode) {
  const cables = [];
  let pairCount = 0; // track how many links have been added

  for (let i = 0; i < nodeCards.length; i++) {
    for (let j = i + 1; j < nodeCards.length; j++) {
      const offset = 30 + pairCount * 10; // consistent 10px increase for every link

      const side = (i + j) % 2 === 0 ? "left" : "right";
      const yOffset = (i + j) * 120;

      const xOffsetStart = ((i + j) % 6) * 12;
      const xOffsetEnd = ((i * 3 + j * 2) % 6) * 12;

      // Primary peer link
      cables.push({
        fromNode: nodeCards[i],
        toNode: nodeCards[j],
        side,
        offset,
        yOffset,
        xOffsetStart,
        xOffsetEnd,
        color: "#FF4136",
        type: "Peer Link"
      });

      pairCount++; // increment before adding secondary (if any)

      // Secondary peer link in 'separate' mode
      if (switchMode === "separate") {
        cables.push({
          fromNode: nodeCards[i],
          toNode: nodeCards[j],
          side: side === "left" ? "right" : "left",
          offset: offset + 30,
          yOffset: yOffset + 10,
          xOffsetStart: xOffsetStart + 6,
          xOffsetEnd: xOffsetEnd + 6,
          color: "#36ff8aff",
          type: "Peer Link (Secondary)"
        });

        pairCount++; // increment again for secondary
      }
    }
  }

  return cables;
}

function generateCables(nodeCards, switchCards) {
  const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value;
  const switchMode = document.querySelector('input[name="switchMode"]:checked')?.value;
  const isConverged = clusterType === "Converged";
  const isSeparate = switchMode === "separate";
  const isShared = !isConverged && !isSeparate;
  const isSwitchless = clusterType === "Switchless";

  const cables = [];

  if (isSwitchless) {
  cables.push(...generatePeerLinks(nodeCards, switchMode));

  nodeCards.forEach((nodeCard) => {
    const uplinkA = switchCards[0]; // Left switch
    const uplinkB = switchCards[1]; // Right switch

    if (uplinkA) {
      cables.push({
        fromNode: nodeCard,
        toSwitch: uplinkA,
        side: "left",
        color: "#0078D4",
        type: "VM/Management",
        offset: -10,         // consistent elbow shift
        xOffsetStart: -30,   // exit point from node center (left)
        xOffsetEnd: -30,     // target point in switch (left)
        yOffset: 0
      });
    }

    if (uplinkB) {
      cables.push({
        fromNode: nodeCard,
        toSwitch: uplinkB,
        side: "right",
        color: "#0078D4",
        type: "VM/Management",
        offset: 40,          // consistent elbow shift
        xOffsetStart: 40,    // exit point from node center (right)
        xOffsetEnd: 40,      // target point in switch (right)
        yOffset: 0
      });
    }
  });

  return cables;
}

  const cableDefs = isConverged
    ? [
        { side: "left", offset: -230, color: "#28A745", type: "All Traffic" },
        { side: "right", offset: 250, color: "#28A745", type: "All Traffic" }
      ]
    : [
        { side: "left", offset: -210, color: "#0078D4", type: "VM/Management" },
        { side: "left", offset: -230, color: "#FF4136", type: "Storage" },
        { side: "right", offset: 230, color: "#0078D4", type: "VM/Management" },
        { side: "right", offset: 250, color: "#FF4136", type: "Storage" }
      ];

  nodeCards.forEach((nodeCard, index) => {
    cableDefs.forEach((def) => {
      let switchCard;
      let yOffset = 0;

      if (isConverged) {
        switchCard = def.side === "left" ? switchCards[0] : switchCards[1];
      } else if (isSeparate) {
        const vmSwitches = [switchCards[0], switchCards[1]];
        const storageSwitches = [switchCards[2], switchCards[3]];
        switchCard = def.type === "VM/Management"
          ? def.side === "left" ? vmSwitches[0] : vmSwitches[1]
          : def.side === "left" ? storageSwitches[0] : storageSwitches[1];

        yOffset = def.type === "Storage" ? 8 : 0;
      } else if (isShared) {
        switchCard = def.side === "left" ? switchCards[0] : switchCards[1];
        yOffset = def.type === "Storage" ? 8 : 0;
      }

      cables.push({
        ...def,
        fromNode: nodeCard,
        toSwitch: switchCard,
        yOffset
      });
    });
  });

  return cables;
}

function drawConnections() {
  requestAnimationFrame(() => {
    const svg = document.getElementById("connectionLines");
    const grid = document.getElementById("nodeGrid");
    if (!svg || !grid) return;

   const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value;
const isSwitchless = clusterType === "Switchless";

const gridRect = grid.getBoundingClientRect();
svg.setAttribute("width", gridRect.width);

// Use fixed height for Switchless, dynamic otherwise
if (isSwitchless) {
  const layoutPanel = document.querySelector(".diagram-panel");
const nodeRow = document.getElementById("nodeRow");
const grid = document.getElementById("nodeGrid");

if (nodeRow && grid) {
  const nodeRect = nodeRow.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();

  const dynamicHeight = nodeRect.bottom - gridRect.top + 300; // ← increased buffer

  console.log("🟦 Switchless mode active");
  console.log("📦 gridRect.top:", gridRect.top);
  console.log("📦 nodeRect.bottom:", nodeRect.bottom);
  console.log("📏 dynamicHeight:", dynamicHeight);

  svg.setAttribute("height", dynamicHeight);
  svg.style.height = `${dynamicHeight}px`;
} else {
    console.warn("⚠️ .diagram-panel not found — falling back to fixed height");
    svg.setAttribute("height", 900);
  }
} else {
  svg.setAttribute("height", gridRect.height + 150);
}

svg.innerHTML = "";

    const nodeCards = [...document.querySelectorAll(".node-row .node-card")];
    const switchCards = [
      ...document.querySelectorAll("#switchRowTop .node-card"),
      ...document.querySelectorAll("#switchRowBottom .node-card")
    ];
    if (nodeCards.length === 0 || switchCards.length === 0) return;

    const cables = generateCables(nodeCards, switchCards);
    const elbowShift = 30;
    const verticalSpread = 0;

    cables.forEach(({ fromNode, toSwitch, toNode, side = "right", offset = 0, yOffset = 0, xOffsetStart = 0, xOffsetEnd = 0, color, type }) => {
      const toTarget = toNode || toSwitch;
      if (!fromNode || !toTarget) {
        console.warn("Missing cable endpoint:", { fromNode, toTarget });
        return;
      }

      const fromRect = fromNode.getBoundingClientRect();
      const toRect = toTarget.getBoundingClientRect();

      const isPeerLink = type?.includes("Peer");
      const isConverged = type === "All Traffic";

      // 🎯 Apply yOffset to cable start point for non-peer links only
      const y1 = isPeerLink
  ? Math.round(fromRect.top + fromRect.height / 2 - gridRect.top)
  : Math.round(fromRect.top + fromRect.height / 2 - gridRect.top + yOffset);
      const x1 = Math.round(fromRect.left + fromRect.width / 2 - gridRect.left + (isPeerLink ? xOffsetStart : 0));

      let x2 = Math.round(toRect.left + toRect.width / 2 - gridRect.left);
      if (isPeerLink) {
        x2 += xOffsetEnd;
      } else if (isConverged) {
        x2 = Math.round(
          toRect.left +
            toRect.width * (side === "left" ? 0.35 : 0.65) -
            gridRect.left
        );
      }

      const y2 = Math.round(toRect.top + toRect.height / 2 - gridRect.top);

      const xElbow = x1 + offset + (side === "left" ? -elbowShift : elbowShift);
      const yElbow = isPeerLink
        ? y1 + offset                         // Peer elbow only uses offset
        : Math.round((y1 + y2) / 2) + verticalSpread; // Switched cables elbow in middle

      const segments = isPeerLink
        ? [
            [x1, y1, x1, yElbow],
            [x1, yElbow, x2, yElbow],
            [x2, yElbow, x2, y2]
          ]
        : [
            [x1, y1, xElbow, y1],
            [xElbow, y1, xElbow, y2],
            [xElbow, y2, x2, y2]
          ];

      segments.forEach(([xStart, yStart, xEnd, yEnd]) => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", xStart);
        line.setAttribute("y1", yStart);
        line.setAttribute("x2", xEnd);
        line.setAttribute("y2", yEnd);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "2");
        svg.appendChild(line);
      });
    });

    updateLegend();
  });
}

function updateNodeStack()
 {

  const nodeRow = document.getElementById("nodeRow");
  const slider = document.getElementById("nodeSlider");
  const countDisplay = document.getElementById("nodeValue");
  if (!nodeRow || !slider || !countDisplay) return;

  const count = parseInt(slider.value, 10) || 1;
  

  countDisplay.textContent = count;
  nodeRow.innerHTML = "";

  const nodeType = document.querySelector('input[name="nodeType"]:checked')?.value || "AX 760";
  const imageMap = {
    "AX 760": "760.png",
    "AX 660": "660.png",
    "AX 670": "670.png",
    "AX 770": "770.png"
  };
  const imagePath = imageMap[nodeType] ? `./images/${imageMap[nodeType]}` : null;

 for (let i = 1; i <= count; i++) {
  const node = document.createElement("div");
  node.className = "node-card";
  node.dataset.label = `Node ${i}`; // ✅ Adds readable label for cables & logs

  if (imagePath) {
    const img = document.createElement("img");
    img.src = imagePath;
    img.alt = `Node ${i} (${nodeType})`;
    img.className = "node-image";
    node.appendChild(img);
  }

  nodeRow.appendChild(node);
}
const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value;
const layoutPanel = document.querySelector(".diagram-panel");
if (layoutPanel) {
  layoutPanel.classList.toggle("switchless-layout", clusterType === "Switchless");
}
  updateSwitchRow();
  requestAnimationFrame(drawConnections);
}

function updateLegend() {
  const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value;
  const legendPanel = document.getElementById("legendPanel");
  if (!legendPanel) return;

  legendPanel.innerHTML = "<h3>Connection Types</h3>";

  const trafficItems = clusterType === "Converged"
    ? [{ label: "All Traffic", color: "#28A745" }]
    : [
        { label: "VM / Management", color: "#0078D4" },
        { label: "Storage", color: "#FF4136" }
      ];

  trafficItems.forEach(({ label, color }) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-color" style="background-color: ${color};"></span>${label}`;
    legendPanel.appendChild(item);
  });

  const cableText = window.cableSummaryText || "Cable summary unavailable.";
const connectionType = window.cableLabel || "Twinax";

const cableColor = connectionType === "SFP" ? "#C00000" : "#333333"; // Dark red for SFP, dark grey for Twinax

const cableItem = document.createElement("div");
cableItem.className = "legend-item mt-3";
cableItem.textContent = cableText;
legendPanel.appendChild(cableItem);
}

export {
  updateLegend
};

function updateSwitchModeVisibility() {
  const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value;
  const panel = document.getElementById("switchModePanel");

  if (!panel) return;

  if (clusterType === "Converged") {
    panel.classList.add("d-none");
  } else {
    panel.classList.remove("d-none");
  }
}

function updateSwitchRow() {
  const switchRowTop = document.getElementById("switchRowTop");
  const switchRowBottom = document.getElementById("switchRowBottom");
  if (!switchRowTop || !switchRowBottom) return;

  const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value;
  const switchMode = document.querySelector('input[name="switchMode"]:checked')?.value;

  const isConverged = clusterType === "Converged";
  const isSeparate = switchMode === "separate";
  const isSwitchless = clusterType === "Switchless";

  switchRowTop.innerHTML = "";
  switchRowBottom.innerHTML = "";

  let switches = [];

  if (isSwitchless) {
    switches = [
      { label: "VM Switch A", img: "s5248f.png" },
      { label: "VM Switch B", img: "s5248f.png" }
    ];
  } else if (isConverged) {
    switches = [
      { label: "Switch A", img: "s5248f.png" },
      { label: "Switch B", img: "s5248f.png" }
    ];
  } else if (isSeparate) {
    switches = [
      { label: "VM Switch A", img: "s5248f.png" },
      { label: "VM Switch B", img: "s5248f.png" },
      { label: "Storage Switch A", img: "s5248f.png" },
      { label: "Storage Switch B", img: "s5248f.png" }
    ];
  } else {
    switches = [
      { label: "Switch A", img: "s5248f.png" },
      { label: "Switch B", img: "s5248f.png" }
    ];
  }

  switches.forEach((s, i) => {
    const card = document.createElement("div");
    card.className = "node-card text-center";

    const img = document.createElement("img");
    img.src = `images/${s.img}`;
    img.alt = s.label;
    img.className = "node-image";

    const caption = document.createElement("div");
    caption.textContent = s.label;
    caption.className = "small mt-1";

    card.appendChild(img);
    card.appendChild(caption);

    // 🔁 Render logic
    if (isSwitchless || isConverged || (!isSeparate && switches.length <= 2)) {
      switchRowTop.appendChild(card);
    } else {
      i < 2 ? switchRowTop.appendChild(card) : switchRowBottom.appendChild(card);
    }
  });

  // 🔁 Visibility toggles
  switchRowBottom.style.display = isSwitchless ? "none" : "flex";
}
function refreshTopology() {
  // 1. Update node visuals based on current inputs
  updateNodeStack();

  // 2. Redraw cables using animation frame for better sync
  requestAnimationFrame(drawConnections);

  // 3. Optional: ResizeObserver fallback for layout shifts
  const grid = document.getElementById("nodeGrid");
  if (grid && !grid.__resizeObserverAttached) {
    const observer = new ResizeObserver(() => drawConnections());
    observer.observe(grid);
    grid.__resizeObserverAttached = true; // Prevent duplicate observers
  }
}
function initializeVisuals() {
  updateSwitchModeVisibility();
  updateNodeStack();
  drawConnections(); // run once on load

  window.addEventListener("resize", drawConnections);

  document.getElementById("nodeSlider")?.addEventListener("input", updateNodeStack);

  document.querySelectorAll('input[name="clusterType"]').forEach(radio =>
    radio.addEventListener("change", () => {
      updateSwitchModeVisibility();
      updateNodeStack();
      drawConnections();
    })
  );

  document.querySelectorAll('input[name="switchMode"]').forEach(radio =>
    radio.addEventListener("change", () => {
      console.log("Switch mode changed:", radio.value);
      updateSwitchModeVisibility();
      updateNodeStack();
      drawConnections();
    })
  );

  document.querySelectorAll('input[name="imageMode"]').forEach(radio =>
    radio.addEventListener("change", updateNodeStack)
  );
}
 
// ✅ Final Export
export {
  updateNodeStack,
  drawConnections,
  generateCables,
  updateSwitchRow,
  updateSwitchModeVisibility,
  initializeVisuals
};