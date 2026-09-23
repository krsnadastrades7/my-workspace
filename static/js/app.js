/**
 * app.js - Core application controller, auth, router, modals, and utilities
 * Dharmanagar Iron Gym Management System
 */

const App = {
  currentUser: null,
  activeRole: null, // 'admin' | 'member' | null

  async init() {
    this.bindEvents();
    this.initModals();
    await this.checkAuth();
  },

  // ----------------- Auth State Management -----------------
  async checkAuth() {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.user) {
        this.setSession(data.user);
      } else {
        this.showLoginView();
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      this.showLoginView();
    }
  },

  setSession(user) {
    this.currentUser = user;
    this.activeRole = user.role;

    // Update Header UI
    const authBar = document.getElementById("auth-user-bar");
    const guestBar = document.getElementById("guest-bar");
    const avatar = document.getElementById("user-avatar");
    const fullName = document.getElementById("user-full-name");
    const roleBadge = document.getElementById("user-role-badge");

    if (authBar && guestBar) {
      authBar.classList.remove("hidden");
      guestBar.classList.add("hidden");
    }

    if (fullName) fullName.textContent = user.full_name;
    if (avatar) avatar.textContent = user.full_name.charAt(0).toUpperCase();
    if (roleBadge) {
      roleBadge.textContent = user.role === "admin" ? "Coach / Admin" : "Gym Member";
      roleBadge.className = `user-badge ${user.role === "admin" ? "badge-primary" : "badge-info"}`;
    }

    // Route to proper role dashboard
    if (user.role === "admin") {
      this.showAdminView();
    } else {
      this.showMemberView();
    }
  },

  async login(username, password) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        this.showToast(data.error || "Invalid username or password", "error");
        return false;
      }

      this.showToast(`Welcome, ${data.user.full_name}!`, "success");
      await this.checkAuth();
      return true;
    } catch (err) {
      this.showToast("Failed to connect to server", "error");
      return false;
    }
  },

  async logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      this.currentUser = null;
      this.activeRole = null;
      this.showToast("Signed out successfully", "info");
      this.showLoginView();
    } catch (err) {
      console.error(err);
    }
  },

  async switchUser(username) {
    try {
      const res = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      if (!res.ok) {
        this.showToast(data.error || "User switch failed", "error");
        return;
      }
      this.closeModal("modal-quick-switch");
      this.showToast(`Switched account to ${data.user.full_name}`, "success");
      await this.checkAuth();
    } catch (err) {
      this.showToast("Switch failed", "error");
    }
  },

  async registerMember(payload) {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        this.showToast(data.error || "Registration failed", "error");
        return;
      }
      this.closeModal("modal-register-member");
      const creds = data.credentials;
      const msg = creds
        ? `Account created! Username: ${creds.username} | Password: ${creds.password}`
        : data.message;
      this.showToast(msg, "success");
      await this.checkAuth();
    } catch (err) {
      this.showToast("Network error registering account", "error");
    }
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

  // ----------------- View Routing -----------------
  showLoginView() {
    this.hideAllViews();
    document.getElementById("view-login")?.classList.remove("hidden");
    const authBar = document.getElementById("auth-user-bar");
    const guestBar = document.getElementById("guest-bar");
    if (authBar) authBar.classList.add("hidden");
    if (guestBar) guestBar.classList.remove("hidden");
  },

  showAdminView() {
    this.hideAllViews();
    const adminView = document.getElementById("view-admin");
    if (adminView) {
      adminView.classList.remove("hidden");
      if (window.AdminPanel) {
        window.AdminPanel.init();
      }
    }
  },

  showMemberView() {
    this.hideAllViews();
    const memberView = document.getElementById("view-member");
    if (memberView) {
      memberView.classList.remove("hidden");
      if (window.MemberDashboard) {
        window.MemberDashboard.init();
      }
    }
  },

  hideAllViews() {
    document.getElementById("view-login")?.classList.add("hidden");
    document.getElementById("view-admin")?.classList.add("hidden");
    document.getElementById("view-member")?.classList.add("hidden");
  },

  // ----------------- Event Handlers -----------------
  bindEvents() {
    // Login form submit
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const u = document.getElementById("login-username").value;
        const p = document.getElementById("login-password").value;
        await this.login(u, p);
      });
    }

    // Demo user buttons in login view
    document.querySelectorAll(".btn-demo").forEach(btn => {
      btn.addEventListener("click", async () => {
        const username = btn.dataset.user;
        await this.switchUser(username);
      });
    });

    // Open Register modal button
    document.getElementById("btn-open-register")?.addEventListener("click", () => {
      this.openModal("modal-register-member");
    });

    // Live preview for registration credentials
    const updateRegPreview = () => {
      const name = document.getElementById("reg-full-name")?.value.trim() || "";
      const dob = document.getElementById("reg-dob")?.value.trim() || "";
      const userEl = document.getElementById("reg-preview-username");
      const passEl = document.getElementById("reg-preview-password");
      if (userEl) userEl.textContent = name ? name.toLowerCase().replace(/\s+/g, '') : "--";
      if (passEl) passEl.textContent = dob ? this.formatDobToPassword(dob) : "--";
    };
    document.getElementById("reg-full-name")?.addEventListener("input", updateRegPreview);
    document.getElementById("reg-dob")?.addEventListener("input", updateRegPreview);
    document.getElementById("reg-dob")?.addEventListener("change", updateRegPreview);

    // Register form submit
    document.getElementById("register-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fullName = document.getElementById("reg-full-name")?.value.trim();
      const dob = document.getElementById("reg-dob")?.value.trim();
      if (!fullName || !dob) {
        this.showToast("Full Name and Date of Birth are required", "error");
        return;
      }
      await this.registerMember({
        full_name: fullName,
        dob: dob,
        phone: document.getElementById("reg-phone")?.value.trim() || "",
        email: document.getElementById("reg-email")?.value.trim() || "",
        membership_plan: document.getElementById("reg-plan")?.value || "Standard Monthly"
      });
    });

    // Header buttons
    document.getElementById("btn-logout")?.addEventListener("click", () => this.logout());
    document.getElementById("btn-open-login")?.addEventListener("click", () => this.showLoginView());
    document.getElementById("btn-quick-switch")?.addEventListener("click", () => this.openQuickSwitchModal());

    // Admin nav tabs
    document.querySelectorAll(".admin-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".admin-tab-content").forEach(c => c.classList.remove("active"));
        tab.classList.add("active");
        const targetId = tab.dataset.tab;
        document.getElementById(targetId)?.classList.add("active");

        if (targetId === "admin-members") window.AdminPanel?.loadMembers();
        if (targetId === "admin-splits") window.AdminPanel?.loadSplits();
        if (targetId === "admin-stats") window.AdminPanel?.loadStats();
      });
    });

    // Member nav tabs
    document.querySelectorAll(".member-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".member-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".member-tab-content").forEach(c => c.classList.remove("active"));
        tab.classList.add("active");
        const targetId = tab.dataset.tab;
        document.getElementById(targetId)?.classList.add("active");

        if (targetId === "member-today") window.MemberDashboard?.loadTodayWorkout();
        if (targetId === "member-weekly") window.MemberDashboard?.loadWeeklyCalendar();
        if (targetId === "member-progress") window.MemberDashboard?.loadWeightProgress();
        if (targetId === "member-profile") window.MemberDashboard?.loadProfile();
      });
    });
  },

  // ----------------- Quick Switch Modal -----------------
  async openQuickSwitchModal() {
    try {
      const res = await fetch("/api/auth/demo-users");
      const data = await res.json();
      const listEl = document.getElementById("demo-users-list");
      if (!listEl) return;

      listEl.innerHTML = data.users.map(u => `
        <div class="demo-user-item" onclick="App.switchUser('${u.username}')">
          <div>
            <strong>${u.full_name}</strong>
            <span class="text-sm text-muted">(@${u.username})</span>
            <div class="text-sm text-muted">${u.membership_plan || ''}</div>
          </div>
          <span class="badge ${u.role === 'admin' ? 'badge-primary' : 'badge-info'}">
            ${u.role === 'admin' ? '👑 Coach/Admin' : '🏋️ Member'}
          </span>
        </div>
      `).join("");

      this.openModal("modal-quick-switch");
    } catch (err) {
      console.error(err);
    }
  },

  // ----------------- Modal Manager -----------------
  initModals() {
    document.querySelectorAll("[data-close]").forEach(btn => {
      btn.addEventListener("click", () => {
        const modalId = btn.dataset.close;
        this.closeModal(modalId);
      });
    });

    document.querySelectorAll(".modal-overlay").forEach(overlay => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.classList.add("hidden");
        }
      });
    });

    // Close on Escape key
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(m => m.classList.add("hidden"));
      }
    });

    // Timer controls
    this.initTimerControls();
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("hidden");
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("hidden");
  },

  // ----------------- Toast Notifications -----------------
  showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let icon = "✓";
    if (type === "error") icon = "✕";
    if (type === "info") icon = "ℹ";

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  },

  // ----------------- Exercise Rest Timer -----------------
  timerInterval: null,
  timerRemaining: 60,
  timerPaused: false,

  initTimerControls() {
    document.getElementById("btn-close-timer")?.addEventListener("click", () => {
      this.stopTimer();
      this.closeModal("modal-rest-timer");
    });

    document.querySelectorAll(".timer-preset-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const sec = parseInt(btn.dataset.sec, 10);
        this.startTimer(sec);
      });
    });

    document.getElementById("btn-timer-pause")?.addEventListener("click", () => {
      const btn = document.getElementById("btn-timer-pause");
      if (this.timerPaused) {
        this.timerPaused = false;
        btn.textContent = "Pause";
      } else {
        this.timerPaused = true;
        btn.textContent = "Resume";
      }
    });

    document.getElementById("btn-timer-add30")?.addEventListener("click", () => {
      this.timerRemaining += 30;
      this.updateTimerDisplay();
    });

    document.getElementById("btn-timer-reset")?.addEventListener("click", () => {
      this.startTimer(60);
    });
  },

  startTimer(seconds = 60) {
    this.stopTimer();
    this.timerRemaining = seconds;
    this.timerPaused = false;
    const pauseBtn = document.getElementById("btn-timer-pause");
    if (pauseBtn) pauseBtn.textContent = "Pause";
    const statusEl = document.getElementById("timer-status");
    if (statusEl) statusEl.textContent = "RESTING";

    this.openModal("modal-rest-timer");
    this.updateTimerDisplay();

    this.timerInterval = setInterval(() => {
      if (this.timerPaused) return;

      this.timerRemaining--;
      this.updateTimerDisplay();

      if (this.timerRemaining <= 0) {
        this.stopTimer();
        this.playTimerBeep();
        if (statusEl) statusEl.textContent = "TIME TO LIFT!";
        this.showToast("Rest time is up! Get ready for your next set.", "info");
      }
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  },

  updateTimerDisplay() {
    const digits = document.getElementById("timer-digits");
    if (!digits) return;
    const mins = Math.floor(Math.max(0, this.timerRemaining) / 60);
    const secs = Math.max(0, this.timerRemaining) % 60;
    digits.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  },

  playTimerBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 pitch
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      // Audio context might be disabled until user gesture
    }
  }
};

// Bootstrap application on page load
document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
