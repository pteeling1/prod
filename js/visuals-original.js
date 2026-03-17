const slider = document.getElementById("nodeCount");
const output = document.getElementById("nodeValue");
const grid = document.getElementById("nodeGrid");
const nodeTypeRadios = document.getElementsByName("nodeType");
const clusterTypeRadios = document.getElementsByName("clusterType");
const nonConvergedOptions = document.getElementById("nonConvergedOptions");
const switchColors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12"];

function getSelectedType() {
  return [...nodeTypeRadios].find(r => r.checked)?.value || "AX 760";
}

function getSelectedClusterType() {
  return [...clusterTypeRadios].find(r => r.checked)?.value || "Converged";
}

function getSwitchConfiguration() {
  const selected = document.querySelector('input[name="switchConfig"]:checked');
  return selected ? selected.value : "Same";
}

function drawElbow(x1, y1, midX, y2, x2, color = "#666") {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", "2");
  path.setAttribute("fill", "none");
  document.getElementById("connectionLines").appendChild(path);
}

function updateGrid() {
  const count = parseInt(slider.value);
  const size = 300; // Fixed image size
  const type = getSelectedType();
  output.textContent = count;
  grid.innerHTML = "";

  const isNonConverged = getSelectedClusterType() === "Non-Converged";
  const isSeparate = isNonConverged && getSwitchConfiguration() === "Separate";

  const switchWrapper = document.createElement("div");
  switchWrapper.className = "switch-wrapper";

  if (isSeparate) {
    const topGroup = document.createElement("div");
    const bottomGroup = document.createElement("div");
    topGroup.className = bottomGroup.className = "switch-group";

    for (let s = 0; s < 4; s++) {
      const switchCard = document.createElement("div");
      switchCard.className = "node-card switch";
      switchCard.innerHTML = `<img src="images/s5248F.png" alt="Switch ${s + 1}" style="width: ${size}px;">`;
      (s < 2 ? topGroup : bottomGroup).appendChild(switchCard);
    }

    switchWrapper.appendChild(topGroup);
    switchWrapper.appendChild(bottomGroup);
  } else {
    const switchGroup = document.createElement("div");
    switchGroup.className = "switch-group";

    for (let s = 0; s < 2; s++) {
      const switchCard = document.createElement("div");
      switchCard.className = "node-card switch";
      switchCard.innerHTML = `<img src="images/s5248F.png" alt="Switch ${s + 1}" style="width: ${size}px;">`;
      switchGroup.appendChild(switchCard);
    }

    switchWrapper.appendChild(switchGroup);
  }

  grid.appendChild(switchWrapper);

  for (let i = 0; i < count; i++) {
    const nodeCard = document.createElement("div");
    nodeCard.className = "node-card node";
    const imgPath = type === "AX 660" ? "./images/660.avif" : "./images/760.avif";
    nodeCard.innerHTML = `<img src="${imgPath}" alt="${type} - Node ${i + 1}" style="width: ${size}px;">`;
    grid.appendChild(nodeCard);
  }

  drawConnectionLines();
}

function drawConnectionLines() {
  const svg = document.getElementById("connectionLines");
  svg.innerHTML = "";

  const switchImgs = [...grid.querySelectorAll('.node-card.switch img')];
  const nodeImgs = [...grid.querySelectorAll('.node-card.node img')];
  if (!switchImgs.length || !nodeImgs.length) return;

  const svgRect = svg.getBoundingClientRect();
  const getMid = el => {
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - svgRect.left,
      y: r.top + r.height / 2 - svgRect.top
    };
  };

  const switchPositions = switchImgs.map(getMid);
  const midpoint = (switchPositions.length - 1) / 2;

  nodeImgs.forEach((node, nIdx) => {
    const nodePos = getMid(node);

    switchPositions.forEach((swPos, swIdx) => {
      const color = switchColors[swIdx % switchColors.length];
      const delta = swIdx - midpoint;

      const switchOffset = Math.sign(delta) * Math.pow(Math.abs(delta), 1.5) * 50;
      const nodeOffset = (nIdx - (nodeImgs.length - 1) / 2) * 10;
      const lineFanOffset = (swIdx - midpoint) * 6;
      const lineExitOffset = (swIdx - midpoint) * 18;

      const offsetX = switchOffset + nodeOffset + lineFanOffset + lineExitOffset;

      drawElbow(
        nodePos.x + offsetX,
        nodePos.y,
        swPos.x + offsetX,
        swPos.y,
        swPos.x,
        color
      );
    });
  });
}

slider.addEventListener("input", updateGrid);
nodeTypeRadios.forEach(r => r.addEventListener("change", updateGrid));
clusterTypeRadios.forEach(r => r.addEventListener("change", () => {
  const isNonConverged = getSelectedClusterType() === "Non-Converged";
  nonConvergedOptions.style.display = isNonConverged ? "block" : "none";
  updateGrid();
}));
document.querySelectorAll('input[name="switchConfig"]').forEach(r => r.addEventListener("change", updateGrid));
window.addEventListener("resize", drawConnectionLines);
window.addEventListener("DOMContentLoaded", () => {
  const isNonConverged = getSelectedClusterType() === "Non-Converged";
  nonConvergedOptions.style.display = isNonConverged ? "block" : "none";
  updateGrid();
});