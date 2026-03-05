// === Topology Visualization Functions ===

function generateCables(nodeCards, switchCards) {
  const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value;
  const switchMode = document.querySelector('input[name="switchMode"]:checked')?.value;
  const isConverged = clusterType === "Converged";
  const isSeparate = switchMode === "separate";

  const cableDefs = isConverged
    ? [
        { side: "left", offset: -180, yOffset: 0, color: "#28A745", type: "All Traffic" },
        { side: "right", offset: 180, yOffset: 0, color: "#28A745", type: "All Traffic" }
      ]
    : [
        { side: "left", offset: -200, yOffset: -8, color: "#0078D4", type: "VM/Management" },
        { side: "left", offset: -150, yOffset: 8,  color: "#FF4136", type: "Storage" },
        { side: "right", offset: 150,  yOffset: -8, color: "#0078D4", type: "VM/Management" },
        { side: "right", offset: 200,  yOffset: 8,  color: "#FF4136", type: "Storage" }
      ];

  const cables = [];

  nodeCards.forEach((nodeCard) => {
    cableDefs.forEach((def) => {
      let switchCard;

      if (isConverged) {
        switchCard = def.side === "left" ? switchCards[0] : switchCards[1];
      } else if (isSeparate) {
        const vmSwitches = [switchCards[0], switchCards[1]];
        const storageSwitches = [switchCards[2], switchCards[3]];
        switchCard = def.type === "VM/Management"
          ? def.side === "left" ? vmSwitches[0] : vmSwitches[1]
          : def.side === "left" ? storageSwitches[0] : storageSwitches[1];
      } else {
        switchCard = def.side === "left" ? switchCards[0] : switchCards[1];
      }

      cables.push({ ...def, fromNode: nodeCard, toSwitch: switchCard });
    });
  });

  return cables;
}

function drawConnections() {
  requestAnimationFrame(() => {
    const svg = document.getElementById("connectionLines");
    const grid = document.getElementById("nodeGrid");
    if (!svg || !grid) return;

    const gridRect = grid.getBoundingClientRect();
    svg.setAttribute("width", Math.round(gridRect.width));
    svg.setAttribute("height", grid.scrollHeight);
    svg.innerHTML = "";

    const nodeCards = [...document.querySelectorAll(".node-row .node-card")];
    const switchCards = [
      ...document.querySelectorAll("#switchRowTop .node-card"),
      ...document.querySelectorAll("#switchRowBottom .node-card")
    ];
    if (nodeCards.length === 0 || switchCards.length < 1) return;

    const cables = generateCables(nodeCards, switchCards);
    const elbowShift = 30;

    cables.forEach(({ fromNode, toSwitch, side, offset, yOffset, color }) => {
      const svgRect = svg.getBoundingClientRect();
      const nodeRect = fromNode.getBoundingClientRect();
      const switchRect = toSwitch.getBoundingClientRect();

      const xNode = Math.round(nodeRect.left + nodeRect.width / 2 - svgRect.left);
      const yStart = Math.round(nodeRect.top + nodeRect.height / 2 - svgRect.top + yOffset);

      const xElbow = xNode + offset + (side === "left" ? -elbowShift : elbowShift);
      const xTarget = Math.round(switchRect.left + switchRect.width / 2 - svgRect.left);
      const yTarget = Math.round(switchRect.top + switchRect.height / 2 - svgRect.top + yOffset);

      [[xNode, yStart, xElbow, yStart],
       [xElbow, yStart, xElbow, yTarget],
       [xElbow, yTarget, xTarget, yTarget]
      ].forEach(([x1, y1, x2, y2]) => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("x2", x2);
        line.setAttribute("y2", y2);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "2");
        svg.appendChild(line);
      });
    });

    updateLegend();
  });
}

function updateNodeStack() {
  const nodeRow = document.getElementById("nodeRow");
  const slider = document.getElementById("nodeSlider");
  const countDisplay = document.getElementById("nodeCountDisplay");
  if (!nodeRow || !slider || !countDisplay) return;

  const imageMode = document.querySelector('input[name="imageMode"]:checked')?.value || "AX760";
  const count = parseInt(slider.value, 10) || 1;

  countDisplay.textContent = count;
  nodeRow.innerHTML = "";

  const imageMap = {
    "AX-4510c": "45x0.png",
    "AX-4520c": "45x0.png",
    AX760: "760.png",
    AX660: "660.png"
  };
  const imgSrc = imageMap[imageMode] || "760.png";

  for (let i = 1; i <= count; i++) {
    const node = document.createElement("div");
    node.className = "node-card";

    const img = document.createElement("img");
    img.src = `images/${imgSrc}`;
    img.alt = `Node ${i} (${imageMode})`;
    img.className = "node-image";

    node.appendChild(img);
    nodeRow.appendChild(node);
  }

  updateSwitchRow();
  setTimeout(drawConnections, 10);
}

function updateSwitchRow() {
  const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value;
  const switchMode = document.querySelector('input[name="switchMode"]:checked')?.value;
  const topRow = document.getElementById("switchRowTop");
  const bottomRow = document.getElementById("switchRowBottom");
  if (!topRow || !bottomRow) return;

  topRow.innerHTML = "";
  bottomRow.innerHTML = "";

  const createSwitchCard = (label) => {
    const card = document.createElement("div");
    card.className = "node-card";

    const img = document.createElement("img");
    img.src = "images/s5248f.png";
    img.alt = `Switch ${label}`;
    img.className = "node-image";

    card.appendChild(img);
    return card;
  };

  if (clusterType === "Non-Converged" && switchMode === "separate") {
    ["A", "B"].forEach(label => topRow.appendChild(createSwitchCard(label)));
    ["C", "D"].forEach(label => bottomRow.appendChild(createSwitchCard(label)));
  } else {
    ["A", "B"].forEach(label => topRow.appendChild(createSwitchCard(label)));
  }
}

function updateLegend() {
  const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value;
  const legendPanel = document.getElementById("legendPanel");
  if (!legendPanel) return;

  legendPanel.innerHTML = "<h3>Connection Types</h3>";

  const items = clusterType === "Converged"
    ? [{ label: "All Traffic", color: "#28A745" }]
    : [
        { label: "VM / Management", color: "#0078D4" },
        { label: "Storage", color: "#FF4136" }
      ];

  items.forEach(({ label, color }) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-color" style="background-color: ${color};"></span>${label}`;
    legendPanel.appendChild(item);
  });
}

function updateSwitchModeVisibility() {
  const clusterType = document.querySelector('input[name="clusterType"]:checked')?.value;
  const panel = document.getElementById("switchModePanel");
  if (!panel) return;

  clusterType === "Non-Converged"
    ? panel.classList.remove("hidden")
    : panel.classList.add("hidden");
}

function initializeVisuals() {
  window.addEventListener("DOMContentLoaded", () => {
    updateSwitchModeVisibility();
    updateNodeStack();

    window.addEventListener("resize", drawConnections);

    document.getElementById("nodeSlider")?.addEventListener("input", updateNodeStack);

    document.querySelectorAll('input[name="clusterType"]').forEach(radio =>
      radio.addEventListener("change", () => {
        updateSwitchModeVisibility();
        updateNodeStack();
      })
    );

    document.querySelectorAll('input[name="switchMode"]').forEach(radio =>
      radio.addEventListener("change", updateNodeStack)
    );

    document.querySelectorAll('input[name="imageMode"]').forEach(radio =>
      radio.addEventListener("change", updateNodeStack)
    );
  });
}

// === Module Exports ===
export {
  updateNodeStack,
  updateSwitchRow,
  drawConnections,
  updateLegend,
  updateSwitchModeVisibility,
  generateCables,
  initializeVisuals
};
