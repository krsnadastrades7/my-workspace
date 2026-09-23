/**
 * member.js - Gym Member Dashboard functionality
 * Today's Workout execution & completion tracking, Weekly Calendar, Weight & Progress Tracker
 * Dharmanagar Iron Gym Management System
 */

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

window.MemberDashboard = {
  dashboardData: null,
  selectedCalendarDay: null,
  weightLogs: [],

  init() {
    this.bindEvents();
    this.loadTodayWorkout();
    this.loadWeeklyCalendar();
    this.loadWeightProgress();
    this.loadProfile();
  },

  bindEvents() {
    // Open weight log modal
    document.getElementById("btn-open-weight-modal")?.addEventListener("click", () => {
      const todayStr = new Date().toISOString().split("T")[0];
      const dateInput = document.getElementById("weight-date-input");
      if (dateInput) dateInput.value = todayStr;
      App.openModal("modal-log-weight");
    });

    // Submit weight log form
    document.getElementById("weight-log-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveWeightLog();
    });
  },

  // ==================== TODAY'S WORKOUT ====================
  async loadTodayWorkout() {
    const container = document.getElementById("today-exercises-container");
    if (!container) return;

    try {
      const res = await fetch("/api/member/dashboard");
      const data = await res.json();
      this.dashboardData = data;

      if (!data.has_split) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <h3>No Workout Split Assigned</h3>
            <p>${data.message || 'Please contact Coach Ratan at Dharmanagar Iron Gym to assign your weekly split schedule.'}</p>
          </div>
        `;
        return;
      }

      this.renderTodayHero(data);
      this.renderTodayExercises(data.today);
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div class="empty-state"><p>Error loading today's workout.</p></div>`;
    }
  },

  renderTodayHero(data) {
    const today = data.today;
    const split = data.split;

    const dateBadge = document.getElementById("today-date-badge");
    const muscleTitle = document.getElementById("today-muscle-title");
    const splitName = document.getElementById("today-split-name");
    const radialCount = document.getElementById("radial-completed-count");
    const progressStatus = document.getElementById("today-progress-status");
    const progressPct = document.getElementById("today-progress-pct");
    const progressFill = document.getElementById("today-progress-fill");

    if (dateBadge) {
      const dateObj = new Date();
      const options = { weekday: 'long', month: 'short', day: 'numeric' };
      dateBadge.textContent = `TODAY • ${dateObj.toLocaleDateString('en-IN', options).toUpperCase()}`;
    }

    if (muscleTitle) muscleTitle.textContent = today.target_muscle || "Rest Day";
    if (splitName) splitName.textContent = `Routine: ${split.name}`;

    if (radialCount) radialCount.textContent = `${today.completed_exercises}/${today.total_exercises}`;
    if (progressStatus) progressStatus.textContent = `${today.completed_exercises} of ${today.total_exercises} exercises completed`;
    if (progressPct) progressPct.textContent = `${today.percent_completed}%`;
    if (progressFill) progressFill.style.width = `${today.percent_completed}%`;

    const countBadge = document.getElementById("today-exercise-count");
    if (countBadge) countBadge.textContent = `${today.total_exercises} Exercises`;
  },

  renderTodayExercises(today) {
    const container = document.getElementById("today-exercises-container");
    if (!container) return;

    if (today.is_rest_day) {
      container.innerHTML = `
        <div class="rest-day-hero">
          <div class="rest-day-icon">🛌</div>
          <h2>Active Recovery & Rest Day</h2>
          <p>Your body grows and recovers during rest! Stay hydrated, hit your daily protein targets (1.6g - 2.2g per kg body weight), and get 7-8 hours of restful sleep.</p>
          <div class="split-meta-pills" style="justify-content: center;">
            <span class="badge badge-success">💧 Hydrate 3-4 Liters</span>
            <span class="badge badge-info">🥩 Protein Goal</span>
            <span class="badge badge-primary">🚶 8,000 Recovery Steps</span>
          </div>
        </div>
      `;
      return;
    }

    if (!today.exercises || today.exercises.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏋️</div>
          <h3>No exercises scheduled for today</h3>
          <p>Enjoy your rest day or check the Weekly Calendar to preview upcoming workouts.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = today.exercises.map(ex => {
      const isDone = ex.completed === 1;
      return `
        <div class="exercise-card ${isDone ? 'completed' : ''}" id="ex-card-${ex.id}">
          <div class="exercise-card-header">
            <div class="exercise-checkbox-wrap">
              <input type="checkbox" class="exercise-checkbox" 
                     id="chk-ex-${ex.id}" 
                     ${isDone ? 'checked' : ''} 
                     onchange="MemberDashboard.toggleExercise(${ex.id})">
              <div class="checkbox-visual">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </div>

            <div class="exercise-header-text">
              <h4 class="exercise-name">${ex.name}</h4>
              <div class="exercise-meta-pills">
                <span class="meta-pill highlight">${ex.target_sets} Sets</span>
                <span class="meta-pill">${ex.target_reps} Reps</span>
                <span class="meta-pill">⏱️ ${ex.rest_seconds}s Rest</span>
              </div>
            </div>
          </div>

          ${ex.notes ? `<div class="exercise-notes-box">💡 <strong>Coach Note:</strong> ${ex.notes}</div>` : ''}

          <div class="exercise-log-inputs">
            <div class="log-field-wrap">
              <span>Weight:</span>
              <input type="number" step="0.5" min="0" class="log-mini-input" id="log-wt-${ex.id}" 
                     value="${ex.logged_weight > 0 ? ex.logged_weight : ''}" placeholder="kg" 
                     onchange="MemberDashboard.saveExerciseMetrics(${ex.id})">
            </div>

            <div class="log-field-wrap">
              <span>Reps:</span>
              <input type="number" min="0" class="log-mini-input" id="log-reps-${ex.id}" 
                     value="${ex.logged_reps > 0 ? ex.logged_reps : ''}" placeholder="reps" 
                     onchange="MemberDashboard.saveExerciseMetrics(${ex.id})">
            </div>

            <button type="button" class="btn btn-outline btn-rest-timer" onclick="App.startTimer(${ex.rest_seconds || 60})">
              ⏱️ Rest (${ex.rest_seconds || 60}s)
            </button>
          </div>
        </div>
      `;
    }).join("");
  },

  async toggleExercise(exerciseId) {
    const chk = document.getElementById(`chk-ex-${exerciseId}`);
    const card = document.getElementById(`ex-card-${exerciseId}`);
    const isCompleted = chk ? chk.checked : false;

    const wtInput = document.getElementById(`log-wt-${exerciseId}`);
    const repsInput = document.getElementById(`log-reps-${exerciseId}`);

    const payload = {
      exercise_id: exerciseId,
      completed: isCompleted,
      weight_used: wtInput ? parseFloat(wtInput.value) || 0 : 0,
      reps_done: repsInput ? parseInt(repsInput.value, 10) || 0 : 0
    };

    // Immediate visual update
    if (card) {
      card.classList.toggle("completed", isCompleted);
    }

    try {
      const res = await fetch("/api/member/exercise/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        if (isCompleted) {
          App.showToast("Exercise marked completed! Solid work! 💪", "success");
        }
        // Refresh dashboard numbers
        this.updateProgressCounters();
      }
    } catch (err) {
      console.error(err);
      App.showToast("Error updating exercise status", "error");
    }
  },

  async saveExerciseMetrics(exerciseId) {
    const chk = document.getElementById(`chk-ex-${exerciseId}`);
    const wtInput = document.getElementById(`log-wt-${exerciseId}`);
    const repsInput = document.getElementById(`log-reps-${exerciseId}`);

    const payload = {
      exercise_id: exerciseId,
      completed: chk ? chk.checked : true,
      weight_used: wtInput ? parseFloat(wtInput.value) || 0 : 0,
      reps_done: repsInput ? parseInt(repsInput.value, 10) || 0 : 0
    };

    try {
      await fetch("/api/member/exercise/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      App.showToast("Lifting log saved", "info");
    } catch (err) {
      console.error(err);
    }
  },

  updateProgressCounters() {
    const allCheckboxes = document.querySelectorAll(".exercise-checkbox");
    const completed = document.querySelectorAll(".exercise-checkbox:checked").length;
    const total = allCheckboxes.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const radialCount = document.getElementById("radial-completed-count");
    const progressStatus = document.getElementById("today-progress-status");
    const progressPct = document.getElementById("today-progress-pct");
    const progressFill = document.getElementById("today-progress-fill");

    if (radialCount) radialCount.textContent = `${completed}/${total}`;
    if (progressStatus) progressStatus.textContent = `${completed} of ${total} exercises completed`;
    if (progressPct) progressPct.textContent = `${pct}%`;
    if (progressFill) progressFill.style.width = `${pct}%`;

    if (completed === total && total > 0) {
      App.showToast("🏆 Today's Workout Complete! Outstanding discipline!", "success");
    }
  },

  // ==================== WEEKLY SPLIT CALENDAR ====================
  async loadWeeklyCalendar() {
    const grid = document.getElementById("weekly-calendar-grid");
    if (!grid) return;

    if (!this.dashboardData) {
      try {
        const res = await fetch("/api/member/dashboard");
        this.dashboardData = await res.json();
      } catch (e) {
        console.error(e);
        return;
      }
    }

    const calendar = this.dashboardData.weekly_calendar || [];
    const todayDow = new Date().getDay(); // 0 = Sunday in JS, so convert:
    const currentDow = (todayDow + 6) % 7; // Convert to Mon=0, Sun=6

    grid.innerHTML = calendar.map(d => {
      const isToday = d.day_of_week === currentDow;
      return `
        <div class="calendar-day-card ${isToday ? 'today' : ''}" 
             id="cal-card-${d.day_of_week}" 
             onclick="MemberDashboard.selectCalendarDay(${d.day_of_week})">
          <div>
            <div class="day-header-pill">
              <span class="day-abbr">${d.day_name.substring(0, 3).toUpperCase()}</span>
              ${isToday ? '<span class="badge badge-primary">TODAY</span>' : ''}
            </div>
            <div class="day-muscle-text">${d.target_muscle}</div>
          </div>
          <div class="day-status-pill">
            ${d.is_rest_day ? '🛌 Rest' : `🏋️ ${d.total_exercises} Exercises`}
          </div>
        </div>
      `;
    }).join("");

    // Select today by default in the preview card
    this.selectCalendarDay(currentDow);
  },

  async selectCalendarDay(dayIdx) {
    document.querySelectorAll(".calendar-day-card").forEach(c => c.classList.remove("selected"));
    document.getElementById(`cal-card-${dayIdx}`)?.classList.add("selected");

    const dayNameEl = document.getElementById("preview-day-name");
    const muscleEl = document.getElementById("preview-target-muscle");
    const statusEl = document.getElementById("preview-day-status");
    const listEl = document.getElementById("preview-exercises-list");

    if (!listEl) return;

    listEl.innerHTML = `<div class="loading-spinner">Loading day routine...</div>`;

    try {
      const res = await fetch(`/api/member/day/${dayIdx}`);
      const data = await res.json();

      if (dayNameEl) dayNameEl.textContent = data.day_name;
      if (muscleEl) muscleEl.textContent = data.target_muscle;
      if (statusEl) {
        statusEl.textContent = data.is_rest_day ? "Rest Day" : "Training Day";
        statusEl.className = `badge ${data.is_rest_day ? 'badge-info' : 'badge-primary'}`;
      }

      if (data.is_rest_day) {
        listEl.innerHTML = `
          <div class="empty-state" style="padding: 1.5rem;">
            <p class="text-sm text-muted">🛌 Scheduled Rest & Active Recovery Day. Focus on mobility, nutrition, and sleep.</p>
          </div>
        `;
        return;
      }

      if (!data.exercises || data.exercises.length === 0) {
        listEl.innerHTML = `<p class="text-sm text-muted">No exercises programmed for this day.</p>`;
        return;
      }

      listEl.innerHTML = data.exercises.map((ex, i) => `
        <div class="preview-exercise-row">
          <div>
            <strong>${i + 1}. ${ex.name}</strong>
            ${ex.notes ? `<div class="text-sm text-muted mt-1">💡 ${ex.notes}</div>` : ''}
          </div>
          <div class="exercise-meta-pills">
            <span class="meta-pill highlight">${ex.target_sets} Sets</span>
            <span class="meta-pill">${ex.target_reps} Reps</span>
            <span class="meta-pill">⏱️ ${ex.rest_seconds}s</span>
          </div>
        </div>
      `).join("");
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<p class="text-sm text-muted">Error loading exercises.</p>`;
    }
  },

  // ==================== WEIGHT & PROGRESS TRACKER ====================
  async loadWeightProgress() {
    try {
      const res = await fetch("/api/member/weight-logs");
      const data = await res.json();
      this.weightLogs = data.logs || [];
      const summary = data.summary || {};

      // Update KPI cards
      const curr = document.getElementById("kpi-current-wt");
      const start = document.getElementById("kpi-start-wt");
      const change = document.getElementById("kpi-change-wt");
      const count = document.getElementById("kpi-entries-count");

      if (curr) curr.textContent = summary.current_weight ? `${summary.current_weight} kg` : "-- kg";
      if (start) start.textContent = summary.start_weight ? `${summary.start_weight} kg` : "-- kg";
      if (change) {
        const chg = summary.change_kg || 0;
        change.textContent = `${chg > 0 ? '+' : ''}${chg} kg`;
        change.style.color = chg <= 0 ? "var(--accent-lime)" : "var(--accent-cyan)";
      }
      if (count) count.textContent = summary.total_entries || 0;

      // Render chart & table
      this.renderWeightChart(this.weightLogs);
      this.renderWeightHistoryTable(this.weightLogs);
    } catch (err) {
      console.error(err);
    }
  },

  renderWeightChart(logs) {
    const canvas = document.getElementById("weight-chart-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const width = canvas.parentElement.clientWidth || 600;
    const height = 260;

    // Retina display scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (!logs || logs.length < 2) {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px 'Plus Jakarta Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Log at least 2 weigh-ins to render the progress trendline.", width / 2, height / 2);
      return;
    }

    const padding = { top: 30, right: 30, bottom: 40, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const weights = logs.map(l => l.weight_kg);
    let minW = Math.floor(Math.min(...weights) - 1);
    let maxW = Math.ceil(Math.max(...weights) + 1);
    if (minW === maxW) { minW -= 2; maxW += 2; }

    const getX = (index) => padding.left + (index / (logs.length - 1)) * chartW;
    const getY = (val) => padding.top + chartH - ((val - minW) / (maxW - minW)) * chartH;

    // Draw horizontal grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#64748b";
    ctx.font = "11px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "right";

    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const val = minW + (i / steps) * (maxW - minW);
      const y = getY(val);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(`${val.toFixed(1)} kg`, padding.left - 8, y + 4);
    }

    // Draw area gradient under curve
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, "rgba(163, 230, 53, 0.35)");
    gradient.addColorStop(1, "rgba(163, 230, 53, 0.0)");

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(weights[0]));
    for (let i = 1; i < logs.length; i++) {
      ctx.lineTo(getX(i), getY(weights[i]));
    }
    ctx.lineTo(getX(logs.length - 1), padding.top + chartH);
    ctx.lineTo(getX(0), padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw the trendline
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(weights[0]));
    for (let i = 1; i < logs.length; i++) {
      ctx.lineTo(getX(i), getY(weights[i]));
    }
    ctx.strokeStyle = "#a3e635";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Draw points & date labels
    ctx.textAlign = "center";
    ctx.fillStyle = "#94a3b8";

    logs.forEach((log, i) => {
      const x = getX(i);
      const y = getY(log.weight_kg);

      // Outer ring
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#0c1017";
      ctx.fill();
      ctx.strokeStyle = "#a3e635";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Weight label above point
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 11px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(`${log.weight_kg}`, x, y - 10);

      // Date label below axis
      const dateParts = log.log_date.split("-");
      const dateLabel = `${dateParts[2]}/${dateParts[1]}`;
      ctx.fillStyle = "#64748b";
      ctx.font = "10px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(dateLabel, x, padding.top + chartH + 18);
    });
  },

  renderWeightHistoryTable(logs) {
    const tbody = document.getElementById("weight-history-tbody");
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No logs recorded yet.</td></tr>`;
      return;
    }

    const reversed = [...logs].reverse();
    tbody.innerHTML = reversed.map(l => `
      <tr>
        <td><strong>${l.log_date}</strong></td>
        <td><strong style="color: var(--accent-lime);">${l.weight_kg} kg</strong></td>
        <td>${l.body_fat_pct ? l.body_fat_pct + '%' : '--'}</td>
        <td class="text-muted">${l.notes || '--'}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="MemberDashboard.deleteWeightLog(${l.id})">
            ✕
          </button>
        </td>
      </tr>
    `).join("");
  },

  async saveWeightLog() {
    const wtInput = document.getElementById("weight-kg-input");
    const dateInput = document.getElementById("weight-date-input");
    const bfInput = document.getElementById("bodyfat-input");
    const notesInput = document.getElementById("weight-notes-input");

    const payload = {
      weight_kg: parseFloat(wtInput?.value),
      log_date: dateInput?.value || new Date().toISOString().split("T")[0],
      body_fat_pct: bfInput?.value ? parseFloat(bfInput.value) : null,
      notes: notesInput?.value.trim() || ""
    };

    if (!payload.weight_kg || payload.weight_kg <= 0) {
      App.showToast("Please enter a valid weight in kg", "error");
      return;
    }

    try {
      const res = await fetch("/api/member/weight-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        App.showToast(data.message || "Weight logged successfully!", "success");
        App.closeModal("modal-log-weight");
        document.getElementById("weight-log-form")?.reset();
        this.loadWeightProgress();
      } else {
        App.showToast(data.error || "Failed to log weight", "error");
      }
    } catch (err) {
      App.showToast("Error saving weight log", "error");
    }
  },

  async deleteWeightLog(logId) {
    if (!confirm("Are you sure you want to delete this weight entry?")) return;

    try {
      const res = await fetch(`/api/member/weight-logs/${logId}`, { method: "DELETE" });
      if (res.ok) {
        App.showToast("Weight log removed", "success");
        this.loadWeightProgress();
      }
    } catch (err) {
      App.showToast("Error deleting log", "error");
    }
  },

  // ==================== MEMBER PROFILE ====================
  async loadProfile() {
    const user = App.currentUser;
    if (!user) return;

    const avatar = document.getElementById("profile-avatar-large");
    const nameEl = document.getElementById("profile-full-name");
    const userEl = document.getElementById("profile-username");
    const planEl = document.getElementById("profile-plan");
    const splitEl = document.getElementById("profile-split-name");
    const phoneEl = document.getElementById("profile-phone");
    const startEl = document.getElementById("profile-start-date");
    const expiryEl = document.getElementById("profile-expiry-date");
    const totalWkEl = document.getElementById("profile-total-workouts");

    if (avatar) avatar.textContent = user.full_name.charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = user.full_name;
    if (userEl) userEl.textContent = `@${user.username}`;
    if (planEl) planEl.textContent = user.membership_plan || "Standard Monthly";
    if (splitEl) splitEl.textContent = user.split_name || "Assigned Routine";
    if (phoneEl) phoneEl.textContent = user.phone || "Not Provided";
    if (startEl) startEl.textContent = user.start_date || "2026-08-01";
    if (expiryEl) expiryEl.textContent = user.expiry_date || "2026-11-01";

    if (this.dashboardData && this.dashboardData.stats && totalWkEl) {
      totalWkEl.textContent = `${this.dashboardData.stats.total_workouts_logged || 0} Sessions`;
    }
  }
};
