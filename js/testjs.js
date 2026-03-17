let workloadRowCounter = 0;

function addWorkloadRow() {
  const container = document.getElementById("workloadList");
  if (!container) return;

  workloadRowCounter += 1;
  const checkboxId = `workloadProfile_${workloadRowCounter}`;

  container.insertAdjacentHTML("beforeend", `
    <div class="card p-3 mb-3 workload-row">
      <!-- Row 1 -->
      <div class="row g-3">
        <div class="col-md-3">
          <label class="form-label">Workload Category</label>
          <select class="form-select workload-category">
            <option value="avd" selected>Azure Virtual Desktop</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label">Workload Name</label>
          <input type="text" class="form-control workload-name" value="My Workload ${workloadRowCounter}">
        </div>
        <div class="col-md-2">
          <label class="form-label">Total Users</label>
          <input type="number" class="form-control workload-users" value="100" min="1">
        </div>
        <div class="col-md-2">
          <label class="form-label">Max Concurrency (%)</label>
          <input type="number" class="form-control workload-concurrency" value="90" min="1" max="100">
        </div>
        <div class="col-md-2">
          <label class="form-label">Session Type</label>
          <select class="form-select workload-session">
            <option value="multi" selected>Multi-session</option>
            <option value="single">Single-session</option>
          </select>
        </div>
      </div>

      <!-- Row 2 -->
      <div class="row g-3 mt-2 align-items-end">
        <div class="col-md-3">
          <label class="form-label">Workload Type</label>
          <select class="form-select workload-type">
            <option value="light">Light</option>
            <option value="medium" selected>Medium</option>
            <option value="heavy">Heavy</option>
            <option value="power">Power</option>
          </select>
        </div>
        <div class="col-md-6">
          <div class="form-check mt-4">
            <input class="form-check-input workload-profile" type="checkbox" id="${checkboxId}">
            <label class="form-check-label" for="${checkboxId}">Add file share for user profile</label>
          </div>
        </div>
        <div class="col-md-3 text-end">
          <button type="button" class="btn btn-sm btn-outline-danger mt-4" onclick="removeWorkloadRow(this)">Remove</button>
        </div>
      </div>
    </div>
  `);
}

function removeWorkloadRow(btn) {
  const card = btn.closest(".workload-row");
  if (card) card.remove();
}