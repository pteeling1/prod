// visuals.js

export function updateGrid(nodeCount, nodeType, clusterType, switchConfig) {
  const grid = document.getElementById("nodeGrid");
  grid.innerHTML = ""; // Clear grid contents

  // Create switch and node row containers
  const switchRow = document.createElement("div");
  switchRow.className = "switch-row";

  const nodeRow = document.createElement("div");
  nodeRow.className = "node-row";

  // --- Add switches ---
  const switchImg = "images/1uswitch.png";
  let switchCount = clusterType === "Non-Converged" && switchConfig === "Separate" ? 2 : 1;
  if (switchCount < 2) switchCount = 2; // Ensure at least 2 switches

  for (let i = 0; i < switchCount; i++) {
    const switchCard = document.createElement("div");
    switchCard.className = "node-card switch";

    const img = document.createElement("img");
    img.src = switchImg;
    img.alt = "Switch";
    img.className = "node-img";

    switchCard.appendChild(img);
    switchRow.appendChild(switchCard);
  }

  // --- Add nodes ---
  const nodeImg = nodeType === "AX 660" ? "images/1userver.png" : "images/2userver.png";

  for (let i = 0; i < nodeCount; i++) {
    const nodeCard = document.createElement("div");
    nodeCard.className = "node-card node";

    const img = document.createElement("img");
    img.src = nodeImg;
    img.alt = `Node ${i + 1}`;
    img.className = "node-img";

    nodeCard.appendChild(img);
    nodeRow.appendChild(nodeCard);
  }

  // Append to grid
  grid.appendChild(switchRow);
  grid.appendChild(nodeRow);

  // Draw SVG connection lines
  setTimeout(drawConnections, 0);
}

export function setupVisualListeners() {
  const clusterInputs = document.querySelectorAll('input[name="clusterType"]');
  const switchInputs = document.querySelectorAll('input[name="switchConfig"]');

  function refresh() {
    const nodeSlider = document.getElementById("nodes");
    const nodeTypeEl = document.querySelector('input[name="nodeType"]:checked');
    const clusterTypeEl = document.querySelector('input[name="clusterType"]:checked');

    if (!nodeSlider || !nodeTypeEl || !clusterTypeEl) return;

    const nodeCount = parseInt(nodeSlider.value, 10);
    const nodeType = nodeTypeEl.value;
    const clusterType = clusterTypeEl.value;
    const switchConfig =
      document.querySelector('input[name="switchConfig"]:checked')?.value || "Same";

    updateGrid(nodeCount, nodeType, clusterType, switchConfig);
  }

  clusterInputs.forEach((input) =>
    input.addEventListener("change", () => {
      const options = document.getElementById("nonConvergedOptions");
      options.style.display = input.value === "Non-Converged" ? "block" : "none";
      refresh();
    })
  );

  switchInputs.forEach((input) => input.addEventListener("change", refresh));

  refresh(); // Trigger rendering on page load
}

// Draw SVG lines from switches to nodes
function drawConnections() {
  const svg = document.getElementById("connectionLines");
  if (!svg) return;
  svg.innerHTML = "";

  const switchCards = document.querySelectorAll(".switch-row .node-card");
  const nodeCards = document.querySelectorAll(".node-row .node-card");

  const svgRect = svg.getBoundingClientRect();

  switchCards.forEach((switchCard) => {
    const swRect = switchCard.getBoundingClientRect();
    const x1 = swRect.left + swRect.width / 2 - svgRect.left;
    const y1 = swRect.bottom - svgRect.top;

    nodeCards.forEach((nodeCard) => {
      const nodeRect = nodeCard.getBoundingClientRect();
      const x2 = nodeRect.left + nodeRect.width / 2 - svgRect.left;
      const y2 = nodeRect.top - svgRect.top;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", "#444");
      line.setAttribute("stroke-width", "2");
      svg.appendChild(line);
    });
  });
}