/**
 * admin.js - Admin Panel functionality
 * Member CRUD, Weekly Workout Split Designer, Split Assignment & Stats
 * Dharmanagar Iron Gym Management System
 */

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

window.AdminPanel = {
  members: [],
  splits: [],
  currentFilterStatus: "all",
  searchQuery: "",
  
  // Split designer state
  designerSplitId: null,
  designerActiveDay: 0, // 0 = Monday ... 6 = Sunday
  designerDays: [],

  init() {
    this.bindEvents();
    this.loadMembers();
    this.loadSplits();
    this.loadStats();
  },

  bindEvents() {
    // Member search & filter
    const searchInput = document.getElementById("member-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value;
        this.loadMembers();
      });
    }

    document.querySelectorAll(".filter-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.currentFilterStatus = pill.dataset.status;
        this.loadMembers();
      });
    });

    // Add Member button
    document.getElementById("btn-add-member")?.addEventListener("click", () => {
      this.openMemberModal();
    });

    // Live preview for member credentials (username & password)
    const updatePreview = () => {
      const fullName = document.getElementById("member-full-name")?.value.trim() || "";
      const dobVal = document.getElementById("member-dob")?.value.trim() || "";
      const userPreview = document.getElementById("preview-username");
      const passPreview = document.getElementById("preview-password");

      if (userPreview) {
        userPreview.textContent = fullName ? fullName.toLowerCase().replace(/\s+/g, '') : "--";
      }
      if (passPreview) {
        passPreview.textContent = dobVal ? this.formatDobToPassword(dobVal) : "--";
      }
    };
    document.getElementById("member-full-name")?.addEventListener("input", updatePreview);
    document.getElementById("member-dob")?.addEventListener("input", updatePreview);
    document.getElementById("member-dob")?.addEventListener("change", updatePreview);

    // Save Member form submit
    document.getElementById("member-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveMember();
    });

    // Create Split button
    document.getElementById("btn-create-split")?.addEventListener("click", () => {
      this.openSplitDesigner();
    });

    // Save Split button
    document.getElementById("btn-save-split")?.addEventListener("click", () => {
      this.saveSplit();
    });

    // Day tabs inside Split Designer
    document.querySelectorAll(".day-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const dayIdx = parseInt(btn.dataset.day, 10);
        this.switchDesignerDay(dayIdx);
      });
    });

    // Add exercise to current designer day
    document.getElementById("btn-add-exercise-to-day")?.addEventListener("click", () => {
      this.addExerciseToCurrentDay();
    });

    // Rest day toggle inside Split Designer
    document.getElementById("day-is-rest-checkbox")?.addEventListener("change", (e) => {
      const isRest = e.target.checked;
      const dayData = this.designerDays[this.designerActiveDay];
      if (dayData) {
        dayData.is_rest_day = isRest ? 1 : 0;
        if (isRest && (!dayData.target_muscle || dayData.target_muscle === "General Conditioning")) {
          dayData.target_muscle = "Rest & Recovery";
          const input = document.getElementById("day-target-muscle");
          if (input) input.value = "Rest & Recovery";
        }
      }
      this.renderDesignerDayExercises();
    });

    // Target muscle input change
    document.getElementById("day-target-muscle")?.addEventListener("input", (e) => {
      const dayData = this.designerDays[this.designerActiveDay];
      if (dayData) {
        dayData.target_muscle = e.target.value;
      }
    });

    // Confirm assign split
    document.getElementById("btn-confirm-assign-split")?.addEventListener("click", () => {
      this.confirmAssignSplit();
    });
  },

  // ==================== MEMBERS MANAGEMENT ====================
  async loadMembers() {
    const container = document.getElementById("members-list-container");
    if (!container) return;

    try {
      let url = `/api/admin/members?status=${this.currentFilterStatus}`;
      if (this.searchQuery) {
        url += `&search=${encodeURIComponent(this.searchQuery)}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      this.members = data.members || [];
      this.renderMembersList();
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div class="empty-state"><p>Error loading members.</p></div>`;
    }
  },

  renderMembersList() {
    const container = document.getElementById("members-list-container");
    if (!container) return;

    if (this.members.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="empty-icon">👥</div>
          <h3>No Members Found</h3>
          <p>No member accounts match the current filter or search criteria.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.members.map(m => {
      let statusBadge = "badge-success";
      if (m.membership_status === "expired") statusBadge = "badge-danger";
      if (m.membership_status === "inactive") statusBadge = "badge-warning";

      return `
        <div class="member-card">
          <div class="member-card-header">
            <div class="member-info-block">
              <h3>${m.full_name}</h3>
              <span class="member-username">@${m.username}</span>
            </div>
            <span class="badge ${statusBadge}">${m.membership_status}</span>
          </div>

          <div class="member-details-list">
            <div class="detail-line">
              <span>Date of Birth</span>
              <strong>${m.dob || 'N/A'}</strong>
            </div>
            <div class="detail-line">
              <span>Plan</span>
              <strong>${m.membership_plan || 'Standard'}</strong>
            </div>
            <div class="detail-line">
              <span>Assigned Split</span>
              <strong class="text-truncate">${m.split_name || 'None'}</strong>
            </div>
            <div class="detail-line">
              <span>Phone</span>
              <strong>${m.phone || 'N/A'}</strong>
            </div>
            <div class="detail-line">
              <span>Valid Until</span>
              <strong>${m.expiry_date || 'N/A'}</strong>
            </div>
            <div class="detail-line">
              <span>Workouts Logged</span>
              <strong>${m.workout_days_logged || 0} sessions</strong>
            </div>
            <div class="detail-line">
              <span>Latest Weight</span>
              <strong>${m.latest_weight ? m.latest_weight + ' kg' : '--'}</strong>
            </div>
          </div>

          <div class="member-card-footer">
            <button class="btn btn-sm btn-outline" onclick="AdminPanel.editMember(${m.id})">
              ✏️ Edit Member
            </button>
            <button class="btn btn-sm btn-danger" onclick="AdminPanel.deleteMember(${m.id}, '${m.full_name}')">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    }).join("");
  },

  formatDobToPassword(dobStr) {
    if (!dobStr) return "";
    const parts = dobStr.split(/[-/.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD -> DDMMYYYY
        return `${parts[2].padStart(2, "0")}${parts[1].padStart(2, "0")}${parts[0]}`;
      } else if (parts[2].length === 4) {
        // DD-MM-YYYY -> DDMMYYYY
        return `${parts[0].padStart(2, "0")}${parts[1].padStart(2, "0")}${parts[2]}`;
      }
    }
    return dobStr.replace(/\D/g, "");
  },

  async openMemberModal(memberId = null) {
    const title = document.getElementById("member-modal-title");
    const editId = document.getElementById("member-edit-id");
    const form = document.getElementById("member-form");
    if (!form) return;

    form.reset();
    await this.populateSplitsDropdown();

    if (memberId) {
      title.textContent = "Edit Gym Member";
      editId.value = memberId;
      try {
        const res = await fetch(`/api/admin/members/${memberId}`);
        const data = await res.json();
        const m = data.member;
        if (m) {
          document.getElementById("member-full-name").value = m.full_name || "";
          document.getElementById("member-dob").value = m.dob || "";
          document.getElementById("member-phone").value = m.phone || "";
          document.getElementById("member-email").value = m.email || "";
          document.getElementById("member-plan").value = m.membership_plan || "Standard Monthly";
          document.getElementById("member-status").value = m.membership_status || "active";
          document.getElementById("member-expiry-date").value = m.expiry_date || "";
          document.getElementById("member-split-select").value = m.split_id || "";

          // Update preview
          const userPreview = document.getElementById("preview-username");
          const passPreview = document.getElementById("preview-password");
          if (userPreview) userPreview.textContent = m.username || (m.full_name ? m.full_name.toLowerCase().replace(/\s+/g, '') : "--");
          if (passPreview) passPreview.textContent = m.dob ? this.formatDobToPassword(m.dob) : "--";
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      title.textContent = "Add New Gym Member";
      editId.value = "";
      // Reset preview
      const userPreview = document.getElementById("preview-username");
      const passPreview = document.getElementById("preview-password");
      if (userPreview) userPreview.textContent = "--";
      if (passPreview) passPreview.textContent = "--";

      // Set default expiry 30 days from now
      const d = new Date();
      d.setDate(d.getDate() + 30);
      document.getElementById("member-expiry-date").value = d.toISOString().split("T")[0];
    }

    App.openModal("modal-member-form");
  },

  async populateSplitsDropdown() {
    const select = document.getElementById("member-split-select");
    if (!select) return;

    if (this.splits.length === 0) {
      const res = await fetch("/api/admin/splits");
      const data = await res.json();
      this.splits = data.splits || [];
    }

    select.innerHTML = `<option value="">-- No Split Assigned --</option>` +
      this.splits.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  },

  async saveMember() {
    const editId = document.getElementById("member-edit-id").value;
    const fullName = document.getElementById("member-full-name").value.trim();
    const dob = document.getElementById("member-dob").value.trim();

    if (!fullName || !dob) {
      App.showToast("Full Name and Date of Birth are required", "error");
      return;
    }

    const payload = {
      full_name: fullName,
      dob: dob,
      phone: document.getElementById("member-phone").value.trim(),
      email: document.getElementById("member-email").value.trim(),
      membership_plan: document.getElementById("member-plan").value,
      membership_status: document.getElementById("member-status").value,
      expiry_date: document.getElementById("member-expiry-date").value,
      split_id: document.getElementById("member-split-select").value ? parseInt(document.getElementById("member-split-select").value, 10) : null
    };

    try {
      let res;
      if (editId) {
        res = await fetch(`/api/admin/members/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch("/api/admin/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok) {
        App.showToast(data.error || "Failed to save member", "error");
        return;
      }

      const successMsg = data.credentials
        ? `Member saved! Username: ${data.credentials.username} | Password: ${data.credentials.password}`
        : (data.message || "Member saved successfully");
      App.showToast(successMsg, "success");
      App.closeModal("modal-member-form");
      this.loadMembers();
      this.loadStats();
    } catch (err) {
      App.showToast("Network error saving member", "error");
    }
  },

  editMember(memberId) {
    this.openMemberModal(memberId);
  },

  async deleteMember(memberId, name) {
    if (!confirm(`Are you sure you want to delete member "${name}"? All workout and weight logs will also be removed.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/members/${memberId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        App.showToast(`Member "${name}" deleted`, "success");
        this.loadMembers();
        this.loadStats();
      } else {
        App.showToast(data.error || "Failed to delete member", "error");
      }
    } catch (err) {
      App.showToast("Error deleting member", "error");
    }
  },

  // ==================== WORKOUT SPLIT DESIGNER ====================
  async loadSplits() {
    const container = document.getElementById("splits-list-container");
    if (!container) return;

    try {
      const res = await fetch("/api/admin/splits");
      const data = await res.json();
      this.splits = data.splits || [];
      this.renderSplitsList();
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div class="empty-state"><p>Error loading splits.</p></div>`;
    }
  },

  renderSplitsList() {
    const container = document.getElementById("splits-list-container");
    if (!container) return;

    if (this.splits.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="empty-icon">📋</div>
          <h3>No Workout Splits Created</h3>
          <p>Click "Design New Split" to create your first weekly workout schedule.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.splits.map(s => `
      <div class="split-card">
        <div class="split-card-top">
          <h3 class="split-card-title">${s.name}</h3>
          <p class="split-card-desc">${s.description || 'No description provided.'}</p>
          <div class="split-meta-pills">
            <span class="badge badge-info">👥 ${s.assigned_members_count} Members</span>
            <span class="badge badge-primary">💪 ${s.active_days_count} Training Days</span>
            <span class="badge badge-warning">🏋️ ${s.total_exercises_count} Exercises</span>
          </div>
        </div>

        <div class="split-card-actions">
          <button class="btn btn-sm btn-primary" onclick="AdminPanel.editSplit(${s.id})">
            ✏️ Edit Schedule
          </button>
          <button class="btn btn-sm btn-outline" onclick="AdminPanel.openAssignModal(${s.id}, '${s.name.replace(/'/g, "\\'")}')">
            👥 Assign to Members
          </button>
          <button class="btn btn-sm btn-danger" onclick="AdminPanel.deleteSplit(${s.id}, '${s.name.replace(/'/g, "\\'")}')">
            🗑️ Delete
          </button>
        </div>
      </div>
    `).join("");
  },

  async openSplitDesigner(splitId = null) {
    this.designerSplitId = splitId;
    this.designerActiveDay = 0;
    const title = document.getElementById("split-designer-title");
    const nameInput = document.getElementById("split-name-input");
    const descInput = document.getElementById("split-desc-input");
    const editId = document.getElementById("split-edit-id");

    if (splitId) {
      title.textContent = "Edit Workout Split Schedule";
      editId.value = splitId;
      try {
        const res = await fetch(`/api/admin/splits/${splitId}`);
        const data = await res.json();
        const split = data.split;
        nameInput.value = split.name || "";
        descInput.value = split.description || "";
        this.designerDays = split.days || [];
      } catch (err) {
        console.error(err);
      }
    } else {
      title.textContent = "Design New Weekly Workout Split";
      editId.value = "";
      nameInput.value = "";
      descInput.value = "";
      // Initialize 7 default days
      this.designerDays = DAY_NAMES.map((name, idx) => ({
        day_of_week: idx,
        day_name: name,
        target_muscle: idx === 6 ? "Rest Day" : (idx === 0 ? "Chest & Triceps" : (idx === 1 ? "Back & Biceps" : "General Conditioning")),
        is_rest_day: idx === 6 ? 1 : 0,
        exercises: []
      }));
    }

    this.switchDesignerDay(0);
    App.openModal("modal-split-designer");
  },

  switchDesignerDay(dayIdx) {
    // Save current day inputs before switching
    this.saveCurrentDayFormToState();

    this.designerActiveDay = dayIdx;

    // Update day tabs UI
    document.querySelectorAll(".day-tab-btn").forEach(btn => {
      const d = parseInt(btn.dataset.day, 10);
      btn.classList.toggle("active", d === dayIdx);
    });

    const dayData = this.designerDays[dayIdx] || {
      day_of_week: dayIdx,
      day_name: DAY_NAMES[dayIdx],
      target_muscle: "Rest Day",
      is_rest_day: 1,
      exercises: []
    };

    // Update inputs
    const muscleInput = document.getElementById("day-target-muscle");
    const restCheckbox = document.getElementById("day-is-rest-checkbox");
    if (muscleInput) muscleInput.value = dayData.target_muscle || "";
    if (restCheckbox) restCheckbox.checked = !!dayData.is_rest_day;

    this.renderDesignerDayExercises();
  },

  saveCurrentDayFormToState() {
    const dayData = this.designerDays[this.designerActiveDay];
    if (!dayData) return;

    const muscleInput = document.getElementById("day-target-muscle");
    const restCheckbox = document.getElementById("day-is-rest-checkbox");

    if (muscleInput) dayData.target_muscle = muscleInput.value.trim();
    if (restCheckbox) dayData.is_rest_day = restCheckbox.checked ? 1 : 0;

    // Collect exercises from DOM
    const exRows = document.querySelectorAll(".designer-exercise-row");
    const exercises = [];
    exRows.forEach((row, idx) => {
      const name = row.querySelector(".ex-name-input")?.value.trim();
      const sets = parseInt(row.querySelector(".ex-sets-input")?.value, 10) || 3;
      const reps = row.querySelector(".ex-reps-input")?.value.trim() || "10-12";
      const rest = parseInt(row.querySelector(".ex-rest-input")?.value, 10) || 60;
      const notes = row.querySelector(".ex-notes-input")?.value.trim() || "";

      if (name) {
        exercises.push({
          name,
          target_sets: sets,
          target_reps: reps,
          rest_seconds: rest,
          notes,
          order_index: idx
        });
      }
    });

    dayData.exercises = exercises;
  },

  renderDesignerDayExercises() {
    const container = document.getElementById("designer-exercises-list");
    const dayData = this.designerDays[this.designerActiveDay];
    if (!container || !dayData) return;

    if (dayData.is_rest_day) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem;">
          <div class="empty-icon">🛌</div>
          <h4>Designated Rest Day</h4>
          <p class="text-sm text-muted">No exercises required. Members can focus on recovery and hydration.</p>
        </div>
      `;
      return;
    }

    if (!dayData.exercises || dayData.exercises.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 1.5rem;">
          <p class="text-sm text-muted">No exercises added yet for ${DAY_NAMES[this.designerActiveDay]}. Click "+ Add Exercise" above.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = dayData.exercises.map((ex, idx) => `
      <div class="designer-exercise-row" data-idx="${idx}">
        <div>
          <label class="text-sm text-muted">Exercise Name</label>
          <input type="text" class="form-input ex-name-input" value="${ex.name || ''}" placeholder="e.g. Barbell Bench Press" required>
        </div>
        <div>
          <label class="text-sm text-muted">Sets</label>
          <input type="number" min="1" max="20" class="form-input ex-sets-input" value="${ex.target_sets || 3}">
        </div>
        <div>
          <label class="text-sm text-muted">Reps</label>
          <input type="text" class="form-input ex-reps-input" value="${ex.target_reps || '10-12'}" placeholder="10-12">
        </div>
        <div>
          <label class="text-sm text-muted">Rest (sec)</label>
          <input type="number" step="15" min="0" class="form-input ex-rest-input" value="${ex.rest_seconds || 60}">
        </div>
        <div>
          <label class="text-sm text-muted">&nbsp;</label>
          <button type="button" class="btn btn-sm btn-danger" onclick="AdminPanel.removeExerciseFromDay(${idx})" title="Remove">✕</button>
        </div>
        <div style="grid-column: 1 / -1; margin-top: 0.25rem;">
          <input type="text" class="form-input ex-notes-input text-sm" value="${ex.notes || ''}" placeholder="Coaching notes (e.g. 2-second eccentric, focus on chest squeeze)">
        </div>
      </div>
    `).join("");
  },

  addExerciseToCurrentDay() {
    this.saveCurrentDayFormToState();
    const dayData = this.designerDays[this.designerActiveDay];
    if (!dayData) return;

    if (dayData.is_rest_day) {
      dayData.is_rest_day = 0;
      const chk = document.getElementById("day-is-rest-checkbox");
      if (chk) chk.checked = false;
    }

    if (!dayData.exercises) dayData.exercises = [];
    dayData.exercises.push({
      name: "",
      target_sets: 3,
      target_reps: "10-12",
      rest_seconds: 60,
      notes: ""
    });

    this.renderDesignerDayExercises();
  },

  removeExerciseFromDay(idx) {
    this.saveCurrentDayFormToState();
    const dayData = this.designerDays[this.designerActiveDay];
    if (dayData && dayData.exercises) {
      dayData.exercises.splice(idx, 1);
      this.renderDesignerDayExercises();
    }
  },

  async saveSplit() {
    this.saveCurrentDayFormToState();
    const name = document.getElementById("split-name-input")?.value.trim();
    const desc = document.getElementById("split-desc-input")?.value.trim();

    if (!name) {
      App.showToast("Split name is required", "error");
      return;
    }

    const payload = {
      name,
      description: desc,
      days: this.designerDays
    };

    try {
      let res;
      if (this.designerSplitId) {
        res = await fetch(`/api/admin/splits/${this.designerSplitId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch("/api/admin/splits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok) {
        App.showToast(data.error || "Failed to save workout split", "error");
        return;
      }

      App.showToast(data.message || "Split saved successfully!", "success");
      App.closeModal("modal-split-designer");
      this.loadSplits();
      this.loadStats();
    } catch (err) {
      App.showToast("Network error saving split", "error");
    }
  },

  editSplit(splitId) {
    this.openSplitDesigner(splitId);
  },

  async deleteSplit(splitId, name) {
    if (!confirm(`Are you sure you want to delete the split "${name}"?`)) return;

    try {
      const res = await fetch(`/api/admin/splits/${splitId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        App.showToast(`Workout Split "${name}" deleted`, "success");
        this.loadSplits();
        this.loadStats();
      } else {
        App.showToast(data.error || "Failed to delete split", "error");
      }
    } catch (err) {
      App.showToast("Error deleting split", "error");
    }
  },

  // ==================== ASSIGN SPLIT TO MEMBERS ====================
  async openAssignModal(splitId, splitName) {
    document.getElementById("assign-split-id").value = splitId;
    document.getElementById("assign-split-name-label").textContent = splitName;
    const checklist = document.getElementById("assign-members-checklist");
    if (!checklist) return;

    try {
      const res = await fetch("/api/admin/members?status=all");
      const data = await res.json();
      const members = data.members || [];

      if (members.length === 0) {
        checklist.innerHTML = `<p class="text-sm text-muted">No members registered yet.</p>`;
      } else {
        checklist.innerHTML = members.map(m => `
          <label class="checklist-item">
            <input type="checkbox" value="${m.id}" ${m.split_id === splitId ? 'checked' : ''}>
            <div>
              <strong>${m.full_name}</strong>
              <span class="text-sm text-muted">(@${m.username}) - Current: ${m.split_name || 'None'}</span>
            </div>
          </label>
        `).join("");
      }

      App.openModal("modal-assign-split");
    } catch (err) {
      console.error(err);
    }
  },

  async confirmAssignSplit() {
    const splitId = document.getElementById("assign-split-id")?.value;
    const checklist = document.getElementById("assign-members-checklist");
    if (!splitId || !checklist) return;

    const checkedInputs = checklist.querySelectorAll("input[type='checkbox']:checked");
    const memberIds = Array.from(checkedInputs).map(i => parseInt(i.value, 10));

    if (memberIds.length === 0) {
      App.showToast("Please select at least one member", "error");
      return;
    }

    try {
      const res = await fetch(`/api/admin/splits/${splitId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_ids: memberIds })
      });
      const data = await res.json();
      if (res.ok) {
        App.showToast(data.message || "Split assigned successfully!", "success");
        App.closeModal("modal-assign-split");
        this.loadSplits();
        this.loadMembers();
      } else {
        App.showToast(data.error || "Assignment failed", "error");
      }
    } catch (err) {
      App.showToast("Error assigning split", "error");
    }
  },

  // ==================== ADMIN STATS ====================
  async loadStats() {
    const kpiGrid = document.getElementById("admin-kpi-grid");
    if (!kpiGrid) return;

    try {
      const res = await fetch("/api/admin/dashboard-stats");
      const data = await res.json();

      kpiGrid.innerHTML = `
        <div class="kpi-card">
          <span class="kpi-label">TOTAL MEMBERS</span>
          <strong class="kpi-val">${data.total_members}</strong>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">ACTIVE MEMBERS</span>
          <strong class="kpi-val" style="color: var(--accent-lime);">${data.active_members}</strong>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">EXPIRED MEMBERS</span>
          <strong class="kpi-val" style="color: var(--accent-rose);">${data.expired_members}</strong>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">WORKOUT SPLITS</span>
          <strong class="kpi-val">${data.total_splits}</strong>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">ACTIVE ON FLOOR TODAY</span>
          <strong class="kpi-val" style="color: var(--accent-cyan);">${data.active_today}</strong>
        </div>
      `;
    } catch (err) {
      console.error(err);
    }
  }
};
