// =============================================================================
// INDIA EWC ESPORTS HUB - APPLICATION ENGINE
// Developed by Pritesh Gehlot (@priteshgehlot)
// Role-Based Architecture:
//   - Normal Users: Can suggest new players/games AND suggest edits on existing ones.
//   - Admin Access: Unlimited PIN attempts (never locked out). Only admin can approve
//                   requests (which reflect live immediately) and delete posts.
// =============================================================================

class CleanEsportsHub {
  constructor() {
    this.storageKey    = "ewc_hub_data_v2";
    this.adminKey      = "ewc_admin_session";
    this.pendingKey    = "ewc_pending_requests";
    this.adminPin      = "admin";   // Primary Admin PIN (also accepts admin123)
    this.isAdmin       = false;     // Default to standard visitor mode

    this.homeScreen    = document.getElementById("home-screen");
    this.godlikeScreen = document.getElementById("screen-godlike");
    this.s8ulScreen    = document.getElementById("screen-s8ul");
    this.cardGodlike   = document.getElementById("card-godlike-select");
    this.cardS8ul      = document.getElementById("card-s8ul-select");

    // Restore active admin session if already authenticated in this tab or from /admin
    if (sessionStorage.getItem(this.adminKey) === "true" || window.location.search.includes("admin=true")) {
      this.isAdmin = true;
      sessionStorage.setItem(this.adminKey, "true");
    }

    this.loadData();
    this.loadPending();
    this.initEvents();
    this.renderAll();
    this.updateAdminUI();
  }

  // ─── Deep Clone ───────────────────────────────────────────────────────────
  cloneData(obj) { return JSON.parse(JSON.stringify(obj)); }

  // ─── Persistent Storage ───────────────────────────────────────────────────
  loadData() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      this.data = saved ? JSON.parse(saved) : this.cloneData(INITIAL_HUB_DATA);
      if (!saved) this.saveData();
    } catch(e) {
      this.data = this.cloneData(INITIAL_HUB_DATA);
    }
  }

  saveData() {
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.data)); } catch(e) {}
  }

  // ─── Pending Requests Queue ───────────────────────────────────────────────
  loadPending() {
    try {
      const raw = localStorage.getItem(this.pendingKey);
      this.pending = raw ? JSON.parse(raw) : [];
    } catch(e) { this.pending = []; }
  }

  savePending() {
    try { localStorage.setItem(this.pendingKey, JSON.stringify(this.pending)); } catch(e) {}
  }

  // ─── Admin Check (No lockouts, never blocks access) ────────────────────────
  checkAdminAuth() {
    if (!this.isAdmin || sessionStorage.getItem(this.adminKey) !== "true") {
      alert("⛔ Admin Access Required: Only verified administrators can approve, reject, or delete items. Please log in using the Admin button.");
      return false;
    }
    return true;
  }

  // ─── Event Bindings ───────────────────────────────────────────────────────
  initEvents() {
    if (this.cardGodlike) this.cardGodlike.addEventListener("click", () => this.showGodlike());
    if (this.cardS8ul)    this.cardS8ul.addEventListener("click",    () => this.showS8ul());

    // Sub-Tabs
    document.querySelectorAll(".sub-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const screen = btn.closest(".detail-screen");
        if (!screen) return;
        const targetId = btn.dataset.sub;
        screen.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.remove("active"));
        screen.querySelectorAll(".sub-tab-content").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        const el = document.getElementById(targetId);
        if (el) el.classList.add("active");
      });
    });

    // Close Modals on click outside
    window.addEventListener("click", e => {
      if (e.target.classList.contains("modal-overlay")) e.target.classList.remove("active");
    });

    // Player form
    const pf = document.getElementById("player-modal-form");
    if (pf) pf.addEventListener("submit", e => { e.preventDefault(); this.handleSavePlayer(); });

    // Game form
    const gf = document.getElementById("game-modal-form");
    if (gf) gf.addEventListener("submit", e => { e.preventDefault(); this.handleSaveGame(); });

    // User suggestion form
    const rf = document.getElementById("request-modal-form");
    if (rf) rf.addEventListener("submit", e => { e.preventDefault(); this.handleUserRequest(); });

    // Division dropdown change
    const divSel = document.getElementById("player-division-select");
    const divCWrap = document.getElementById("player-custom-division-wrap");
    if (divSel && divCWrap) {
      divSel.addEventListener("change", () => {
        const isNew = divSel.value === "__NEW__";
        divCWrap.style.display = isNew ? "block" : "none";
        document.getElementById("player-custom-division-input").required = isNew;
      });
    }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  showHome() {
    this.godlikeScreen.classList.remove("active");
    this.s8ulScreen.classList.remove("active");
    this.homeScreen.style.display = "flex";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showGodlike() {
    this.homeScreen.style.display = "none";
    this.s8ulScreen.classList.remove("active");
    this.godlikeScreen.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showS8ul() {
    this.homeScreen.style.display = "none";
    this.godlikeScreen.classList.remove("active");
    this.s8ulScreen.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // =========================================================================
  // ADMIN AUTH (ACCESSIBLE VIA /admin - UNLIMITED ATTEMPTS, NEVER LOCKED OUT)
  // =========================================================================
  toggleAdminMode() {
    if (this.isAdmin) {
      if (confirm("Exit Admin Mode?")) {
        this.isAdmin = false;
        sessionStorage.removeItem(this.adminKey);
        this.updateAdminUI();
        this.renderAll();
        this.showToast("🔒 Logged out of admin mode.");
      }
    } else {
      window.location.href = "/admin";
    }
  }
      this.openAdminLoginModal();
    }
  }

  openAdminLoginModal() {
    const modal = document.getElementById("admin-login-modal");
    if (modal) {
      document.getElementById("admin-pin-input").value = "";
      const err = document.getElementById("admin-pin-error");
      if (err) err.style.display = "none";
      modal.classList.add("active");
      setTimeout(() => document.getElementById("admin-pin-input").focus(), 100);
    }
  }

  submitAdminLogin() {
    const pin = document.getElementById("admin-pin-input").value.trim();
    // Validate PIN (admin or admin123). Unlimited attempts without lockout.
    if (pin === "admin" || pin === "admin123" || pin === this.adminPin) {
      this.isAdmin = true;
      sessionStorage.setItem(this.adminKey, "true");
      this.updateAdminUI();
      this.renderAll();
      this.closeModal("admin-login-modal");
      this.showToast("👑 Admin access unlocked! You can now accept edits and delete posts.");
      const fab = document.getElementById("admin-login-fab");
      if (fab) {
        fab.innerHTML = "👑 Admin: ON (Exit)";
        fab.title = "Exit Admin Mode";
      }
    } else {
      // NEVER BLOCK: Simply display error message and allow immediate retry
      const err = document.getElementById("admin-pin-error");
      if (err) {
        err.textContent = "⚠️ Incorrect password. Try again (unlimited attempts allowed).";
        err.style.display = "block";
      }
      document.getElementById("admin-pin-input").value = "";
      document.getElementById("admin-pin-input").focus();
    }
  }

  updateAdminUI() {
    const banner = document.getElementById("admin-banner");
    if (banner) banner.style.display = this.isAdmin ? "block" : "none";

    const pendingCount = (this.pending || []).filter(r => r.status === "pending").length;

    if (this.isAdmin) {
      const badge = document.getElementById("pending-count-badge");
      if (badge) {
        badge.textContent = pendingCount > 0 ? `${pendingCount} pending request${pendingCount > 1 ? 's' : ''}` : "";
        badge.style.display = pendingCount > 0 ? "inline-block" : "none";
      }
      const numSpan = document.getElementById("admin-pending-num");
      if (numSpan) numSpan.textContent = pendingCount > 0 ? `(${pendingCount})` : "";
    }

    document.body.classList.toggle("admin-mode-active", this.isAdmin);

    // Show/hide direct add buttons (only visible to admin)
    document.querySelectorAll(".admin-only-btn").forEach(btn => {
      btn.style.display = this.isAdmin ? "inline-flex" : "none";
    });

    // Show/hide user general submit button (only visible to non-admins)
    document.querySelectorAll(".btn-user-submit-request").forEach(btn => {
      btn.style.display = this.isAdmin ? "none" : "inline-flex";
    });
  }

  // =========================================================================
  // RENDERING ALL CONTENT
  // =========================================================================
  renderAll() {
    this.renderEWC("godlike", "godl-ewc-tbody", "var(--godl-gold)");
    this.renderEWC("s8ul",    "s8ul-ewc-tbody",  "var(--s8ul-blue)");
    this.renderRosters("godlike", "godl-roster-container", "var(--godl-gold)");
    this.renderRosters("s8ul",    "s8ul-roster-container",  "var(--s8ul-blue)");
  }

  // ─── Render EWC Games Table ───────────────────────────────────────────────
  renderEWC(teamKey, tbodyId, themeColor) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const games = this.data[teamKey]?.ewcGames || [];
    let html = "";

    games.forEach((g, index) => {
      const rowStyle = g.highlight ? `style="background:rgba(255,255,255,0.05);"` : "";
      const statusStyle = `style="color:${themeColor}; font-weight:700;"`;
      html += `
        <tr ${rowStyle}>
          <td class="col-num" style="color:${themeColor};" data-label="#">${g.no || index + 1}</td>
          <td class="col-title" data-label="Game">${this.escapeHtml(g.title)}</td>
          <td data-label="Genre">${this.escapeHtml(g.genre)}</td>
          <td data-label="Roster">${this.escapeHtml(g.roster)}</td>
          <td ${statusStyle} data-label="Status">${this.escapeHtml(g.status)}</td>
          <td class="admin-td-actions" data-label="Actions">
            <button class="btn-action-edit" title="${this.isAdmin ? 'Edit Game' : 'Suggest Edit (Sends to Admin)'}" onclick="window.cleanHub.openEditGameModal('${teamKey}','${g.id}')">✏️ Edit</button>
            ${this.isAdmin ? `<button class="btn-action-delete" title="Delete Game (Admin Only)" onclick="window.cleanHub.deleteGame('${teamKey}','${g.id}')">🗑️</button>` : ""}
          </td>
        </tr>`;
    });

    if (games.length === 0) {
      html = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">No EWC games listed yet.</td></tr>`;
    }
    tbody.innerHTML = html;

    // Admin direct Add Game button below table
    const container = tbody.closest(".sub-tab-content");
    let adminBar = container?.querySelector(".admin-table-bar");
    if (this.isAdmin) {
      if (!adminBar) {
        adminBar = document.createElement("div");
        adminBar.className = "admin-table-bar";
        container.appendChild(adminBar);
      }
      adminBar.innerHTML = `
        <button class="btn-admin-add" onclick="window.cleanHub.openAddGameModal('${teamKey}')">
          ✨ + Add EWC Game Title (Admin)
        </button>`;
      adminBar.style.display = "block";
    } else if (adminBar) {
      adminBar.style.display = "none";
    }
  }

  // ─── Render Rosters ───────────────────────────────────────────────────────
  renderRosters(teamKey, containerId, themeColor) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const divisions = this.data[teamKey]?.divisions || [];
    let html = "";

    divisions.forEach(div => {
      html += `
        <div class="division-block" id="div-${div.id}">
          <div class="division-header-wrap">
            <h3 style="color:${themeColor};font-size:1.25rem;margin:1.25rem 0 0.85rem;">
              ${this.escapeHtml(div.name)}
            </h3>
            ${this.isAdmin ? `
              <div class="div-admin-actions">
                <button class="btn-action-add-player" onclick="window.cleanHub.openAddPlayerModal('${teamKey}','${div.id}')">➕ Add Player</button>
                <button class="btn-action-delete-div" onclick="window.cleanHub.deleteDivision('${teamKey}','${div.id}')">🗑️ Delete Lineup</button>
              </div>` : ""}
          </div>
          <div class="roster-grid-clean" style="margin-bottom:2rem;">`;

      if (div.players?.length > 0) {
        div.players.forEach(p => {
          html += `
            <div class="player-box" style="border-top:2px solid ${themeColor};">
              <div class="player-card-admin-bar">
                <button class="btn-card-edit" title="${this.isAdmin ? 'Edit Player' : 'Suggest Edit (Sends to Admin)'}" onclick="window.cleanHub.openEditPlayerModal('${teamKey}','${p.id}')">✏️ Edit</button>
                ${this.isAdmin ? `<button class="btn-card-delete" title="Delete Player (Admin Only)" onclick="window.cleanHub.deletePlayer('${teamKey}','${p.id}')">🗑️</button>` : ""}
              </div>
              <div class="player-header">
                <span class="player-ign-text">${this.escapeHtml(p.ign)}</span>
                <span class="player-role-tag" style="color:${themeColor};">${this.escapeHtml(p.role)}</span>
              </div>
              <div class="player-sub-name">${this.escapeHtml(p.name)}</div>
              <div class="player-stats-bar">
                <div><span>${this.escapeHtml(p.stat1Label || "ROLE")}</span><strong>${this.escapeHtml(p.stat1Val || "-")}</strong></div>
                <div><span>${this.escapeHtml(p.stat2Label || "STATUS")}</span><strong style="color:#10B981;">${this.escapeHtml(p.stat2Val || "Active")}</strong></div>
              </div>
              <div class="player-desc-text">${this.escapeHtml(p.desc || "")}</div>
            </div>`;
        });
      } else {
        html += `<div style="grid-column:1/-1;padding:1.5rem;text-align:center;background:rgba(255,255,255,0.02);border-radius:10px;color:var(--text-muted);">No players in this lineup yet.</div>`;
      }

      html += `</div></div>`;
    });

    if (divisions.length === 0) {
      html = `<div style="text-align:center;padding:3rem;color:var(--text-muted);">No lineups found.</div>`;
    }

    if (this.isAdmin) {
      html += `
        <div class="admin-roster-footer-bar">
          <button class="btn-admin-add" onclick="window.cleanHub.openAddPlayerModal('${teamKey}','__NEW__')">
            ✨ + Add Entirely New Lineup / Division
          </button>
        </div>`;
    }

    container.innerHTML = html;
  }

  // =========================================================================
  // PLAYER MODAL: ADD / EDIT
  // Normal users submit an edit/post request; Admin updates live immediately.
  // =========================================================================
  openAddPlayerModal(teamKey = "godlike", divisionId = null) {
    if (!this.checkAdminAuth()) return;
    this.editingPlayerId = null;
    this.currentModalTeam = teamKey;
    const modal = document.getElementById("player-modal");
    const title = document.getElementById("player-modal-title");
    const submitBtn = document.getElementById("player-modal-submit-btn");

    if (title) title.textContent = "➕ Add Player or New Lineup (Admin)";
    if (submitBtn) submitBtn.textContent = "💾 Save Player Live";

    document.getElementById("player-team-select").value = teamKey;
    this.populateDivisionSelect(teamKey, divisionId);
    ["player-ign-input","player-name-input","player-role-input","player-desc-input","player-custom-division-input"].forEach(id => {
      document.getElementById(id).value = "";
    });
    document.getElementById("player-stat1-label").value = "K/D";
    document.getElementById("player-stat1-val").value = "3.50";
    document.getElementById("player-stat2-val").value = "Active";
    const isNew = divisionId === "__NEW__";
    document.getElementById("player-custom-division-wrap").style.display = isNew ? "block" : "none";
    document.getElementById("player-custom-division-input").required = isNew;
    if (isNew) document.getElementById("player-division-select").value = "__NEW__";
    modal.classList.add("active");
  }

  openEditPlayerModal(teamKey, playerId) {
    const pData = this.findPlayer(teamKey, playerId);
    if (!pData) return;
    this.editingPlayerId = playerId;
    this.currentModalTeam = teamKey;
    const modal = document.getElementById("player-modal");
    const title = document.getElementById("player-modal-title");
    const submitBtn = document.getElementById("player-modal-submit-btn");

    if (this.isAdmin) {
      if (title) title.textContent = `✏️ Edit Player: ${pData.player.ign} (Admin Mode)`;
      if (submitBtn) submitBtn.textContent = "💾 Save & Update Immediately";
    } else {
      if (title) title.textContent = `✏️ Suggest Edit: ${pData.player.ign}`;
      if (submitBtn) submitBtn.textContent = "📩 Submit Edit for Admin Approval";
    }

    document.getElementById("player-team-select").value = teamKey;
    this.populateDivisionSelect(teamKey, pData.division.id);
    document.getElementById("player-ign-input").value      = pData.player.ign || "";
    document.getElementById("player-name-input").value     = pData.player.name || "";
    document.getElementById("player-role-input").value     = pData.player.role || "";
    document.getElementById("player-stat1-label").value    = pData.player.stat1Label || "K/D";
    document.getElementById("player-stat1-val").value      = pData.player.stat1Val || "";
    document.getElementById("player-stat2-val").value      = pData.player.stat2Val || "Active";
    document.getElementById("player-desc-input").value     = pData.player.desc || "";
    document.getElementById("player-custom-division-wrap").style.display = "none";
    document.getElementById("player-custom-division-input").required = false;
    modal.classList.add("active");
  }

  populateDivisionSelect(teamKey, selectedDivId = null) {
    const divSelect = document.getElementById("player-division-select");
    const divisions = this.data[teamKey]?.divisions || [];
    let html = "";
    divisions.forEach(d => {
      html += `<option value="${d.id}" ${d.id === selectedDivId ? "selected" : ""}>${d.name}</option>`;
    });
    if (this.isAdmin) {
      html += `<option value="__NEW__" ${selectedDivId === "__NEW__" ? "selected" : ""}>➕ [Create New Lineup]</option>`;
    }
    divSelect.innerHTML = html;
  }

  handleSavePlayer() {
    const teamKey = document.getElementById("player-team-select").value;
    let divVal    = document.getElementById("player-division-select").value;
    const ign     = document.getElementById("player-ign-input").value.trim();
    const name    = document.getElementById("player-name-input").value.trim();
    const role    = document.getElementById("player-role-input").value.trim();
    const stat1Label = document.getElementById("player-stat1-label").value.trim() || "K/D";
    const stat1Val   = document.getElementById("player-stat1-val").value.trim() || "-";
    const stat2Val   = document.getElementById("player-stat2-val").value.trim() || "Active";
    const desc    = document.getElementById("player-desc-input").value.trim();
    if (!ign) { alert("Please enter the player IGN."); return; }

    if (this.isAdmin) {
      // Direct Admin Update
      if (divVal === "__NEW__") {
        const customName = document.getElementById("player-custom-division-input").value.trim();
        if (!customName) { alert("Please enter a lineup name."); return; }
        const newDivId = "div-" + Date.now();
        this.data[teamKey].divisions.push({ id: newDivId, name: customName, players: [] });
        divVal = newDivId;
      }

      if (this.editingPlayerId) {
        const pData = this.findPlayer(this.currentModalTeam, this.editingPlayerId);
        if (pData) {
          if (this.currentModalTeam !== teamKey || pData.division.id !== divVal) {
            pData.division.players = pData.division.players.filter(p => p.id !== this.editingPlayerId);
            const target = this.data[teamKey].divisions.find(d => d.id === divVal);
            if (target) target.players.push({ id: this.editingPlayerId, ign, name, role, stat1Label, stat1Val, stat2Label: "STATUS", stat2Val, desc });
          } else {
            Object.assign(pData.player, { ign, name, role, stat1Label, stat1Val, stat2Label: "STATUS", stat2Val, desc });
          }
        }
        this.showToast(`✅ Player "${ign}" updated live!`);
      } else {
        const target = this.data[teamKey].divisions.find(d => d.id === divVal);
        if (target) {
          target.players.push({ id: "p-" + Date.now(), ign, name, role, stat1Label, stat1Val, stat2Label: "STATUS", stat2Val, desc });
          this.showToast(`✅ Player "${ign}" added!`);
        }
      }
      this.saveData();
      this.renderAll();
    } else {
      // Normal User Edit Request -> Sent to Admin for Review
      const pData = this.editingPlayerId ? this.findPlayer(this.currentModalTeam, this.editingPlayerId) : null;
      const req = {
        id: "req-" + Date.now(),
        type: "edit_player",
        teamKey,
        targetId: this.editingPlayerId,
        targetName: pData ? pData.player.ign : ign,
        submittedBy: "Community User",
        submittedAt: new Date().toLocaleString(),
        status: "pending",
        originalData: pData ? { ...pData.player } : null,
        data: {
          ign, name, role, stat1Label, stat1Val, stat2Label: "STATUS", stat2Val, desc, divisionId: divVal
        }
      };
      this.pending.push(req);
      this.savePending();
      this.updateAdminUI();
      this.showToast(`📩 Edit request for "${ign}" submitted! It will reflect once approved by Admin.`);
    }

    this.closeModal("player-modal");
  }

  // ─── Delete Operations (STRICTLY ADMIN ONLY) ──────────────────────────────
  deletePlayer(teamKey, playerId) {
    if (!this.checkAdminAuth()) return;
    const pData = this.findPlayer(teamKey, playerId);
    if (!pData) return;
    if (confirm(`⚠️ [ADMIN CONFIRMATION]\nAre you sure you want to permanently delete player "${pData.player.ign}" from ${pData.division.name}?`)) {
      pData.division.players = pData.division.players.filter(p => p.id !== playerId);
      this.saveData(); this.renderAll();
      this.showToast(`🗑️ Player "${pData.player.ign}" permanently deleted.`);
    }
  }

  deleteDivision(teamKey, divisionId) {
    if (!this.checkAdminAuth()) return;
    const div = this.data[teamKey]?.divisions.find(d => d.id === divisionId);
    if (!div) return;
    if (confirm(`⚠️ [ADMIN CONFIRMATION]\nAre you sure you want to permanently delete lineup "${div.name}" and all its players?`)) {
      this.data[teamKey].divisions = this.data[teamKey].divisions.filter(d => d.id !== divisionId);
      this.saveData(); this.renderAll();
      this.showToast(`🗑️ Lineup "${div.name}" permanently deleted.`);
    }
  }

  findPlayer(teamKey, playerId) {
    for (const div of (this.data[teamKey]?.divisions || [])) {
      const player = div.players.find(p => p.id === playerId);
      if (player) return { division: div, player };
    }
    return null;
  }

  // =========================================================================
  // GAME MODAL: ADD / EDIT
  // =========================================================================
  openAddGameModal(teamKey = "godlike") {
    if (!this.checkAdminAuth()) return;
    this.editingGameId = null;
    this.currentGameTeam = teamKey;
    const title = document.getElementById("game-modal-title");
    const submitBtn = document.getElementById("game-modal-submit-btn");
    if (title) title.textContent = "➕ Add EWC Game Title (Admin)";
    if (submitBtn) submitBtn.textContent = "💾 Save EWC Game Live";

    document.getElementById("game-team-select").value = teamKey;
    const count = (this.data[teamKey]?.ewcGames || []).length;
    document.getElementById("game-no-input").value     = count + 1;
    document.getElementById("game-title-input").value  = "";
    document.getElementById("game-genre-input").value  = "";
    document.getElementById("game-roster-input").value = "";
    document.getElementById("game-status-input").value = "EWC 2026 Official Title";
    document.getElementById("game-highlight-check").checked = false;
    document.getElementById("game-modal").classList.add("active");
  }

  openEditGameModal(teamKey, gameId) {
    const game = (this.data[teamKey]?.ewcGames || []).find(g => g.id === gameId);
    if (!game) return;
    this.editingGameId = gameId;
    this.currentGameTeam = teamKey;
    const modal = document.getElementById("game-modal");
    const title = document.getElementById("game-modal-title");
    const submitBtn = document.getElementById("game-modal-submit-btn");

    if (this.isAdmin) {
      if (title) title.textContent = `✏️ Edit: ${game.title} (Admin Mode)`;
      if (submitBtn) submitBtn.textContent = "💾 Save & Update Immediately";
    } else {
      if (title) title.textContent = `✏️ Suggest Edit: ${game.title}`;
      if (submitBtn) submitBtn.textContent = "📩 Submit Edit for Admin Approval";
    }

    document.getElementById("game-team-select").value = teamKey;
    document.getElementById("game-no-input").value     = game.no || 1;
    document.getElementById("game-title-input").value  = game.title || "";
    document.getElementById("game-genre-input").value  = game.genre || "";
    document.getElementById("game-roster-input").value = game.roster || "";
    document.getElementById("game-status-input").value = game.status || "";
    document.getElementById("game-highlight-check").checked = !!game.highlight;
    modal.classList.add("active");
  }

  handleSaveGame() {
    const teamKey   = document.getElementById("game-team-select").value;
    const no        = parseInt(document.getElementById("game-no-input").value) || 1;
    const title     = document.getElementById("game-title-input").value.trim();
    const genre     = document.getElementById("game-genre-input").value.trim();
    const roster    = document.getElementById("game-roster-input").value.trim();
    const status    = document.getElementById("game-status-input").value.trim();
    const highlight = document.getElementById("game-highlight-check").checked;
    if (!title) { alert("Please enter the game title."); return; }

    if (this.isAdmin) {
      if (this.editingGameId) {
        if (this.currentGameTeam !== teamKey) {
          this.data[this.currentGameTeam].ewcGames = this.data[this.currentGameTeam].ewcGames.filter(g => g.id !== this.editingGameId);
          this.data[teamKey].ewcGames.push({ id: this.editingGameId, no, title, genre, roster, status, highlight });
        } else {
          const game = this.data[teamKey].ewcGames.find(g => g.id === this.editingGameId);
          if (game) Object.assign(game, { no, title, genre, roster, status, highlight });
        }
        this.showToast(`✅ Game "${title}" updated live!`);
      } else {
        this.data[teamKey].ewcGames.push({ id: "game-" + Date.now(), no, title, genre, roster, status, highlight });
        this.showToast(`✅ Game "${title}" added!`);
      }
      this.data[teamKey].ewcGames.sort((a, b) => (a.no || 0) - (b.no || 0));
      this.saveData();
      this.renderAll();
    } else {
      // Normal User Edit Request -> Sent to Admin
      const origGame = (this.data[this.currentGameTeam]?.ewcGames || []).find(g => g.id === this.editingGameId);
      const req = {
        id: "req-" + Date.now(),
        type: "edit_game",
        teamKey,
        targetId: this.editingGameId,
        targetName: origGame ? origGame.title : title,
        submittedBy: "Community User",
        submittedAt: new Date().toLocaleString(),
        status: "pending",
        originalData: origGame ? { ...origGame } : null,
        data: { no, title, genre, roster, status, highlight }
      };
      this.pending.push(req);
      this.savePending();
      this.updateAdminUI();
      this.showToast(`📩 Edit request for "${title}" submitted! It will reflect once approved by Admin.`);
    }

    this.closeModal("game-modal");
  }

  deleteGame(teamKey, gameId) {
    if (!this.checkAdminAuth()) return;
    const game = (this.data[teamKey]?.ewcGames || []).find(g => g.id === gameId);
    if (!game) return;
    if (confirm(`⚠️ [ADMIN CONFIRMATION]\nAre you sure you want to permanently delete "${game.title}"?`)) {
      this.data[teamKey].ewcGames = this.data[teamKey].ewcGames.filter(g => g.id !== gameId);
      this.saveData(); this.renderAll();
      this.showToast(`🗑️ Game "${game.title}" permanently deleted.`);
    }
  }

  // =========================================================================
  // USER: SUBMIT NEW SUGGESTION / POST REQUEST
  // =========================================================================
  openRequestModal(teamKey) {
    this.currentRequestTeam = teamKey;
    const modal = document.getElementById("request-modal");
    document.getElementById("request-team-label").textContent =
      teamKey === "godlike" ? "GodLike Esports" : "S8UL Esports";
    document.getElementById("request-type-select").value = "player";
    document.getElementById("req-player-fields").style.display = "block";
    document.getElementById("req-game-fields").style.display   = "none";
    ["req-ign","req-realname","req-role","req-game","req-desc","req-game-title","req-game-genre","req-game-roster"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    document.getElementById("req-name-input").value = "";
    modal.classList.add("active");

    document.getElementById("request-type-select").onchange = function() {
      document.getElementById("req-player-fields").style.display = this.value === "player" ? "block" : "none";
      document.getElementById("req-game-fields").style.display   = this.value === "game"   ? "block" : "none";
    };
  }

  handleUserRequest() {
    const type        = document.getElementById("request-type-select").value;
    const submittedBy = document.getElementById("req-name-input").value.trim() || "Community Fan";

    let reqData = {};
    if (type === "player") {
      const ign  = document.getElementById("req-ign").value.trim();
      const name = document.getElementById("req-realname").value.trim();
      const role = document.getElementById("req-role").value.trim();
      const game = document.getElementById("req-game").value.trim();
      const desc = document.getElementById("req-desc").value.trim();
      if (!ign || !role) { alert("Please fill in Player IGN and Role."); return; }
      reqData = { ign, name, role, game, desc };
    } else {
      const title  = document.getElementById("req-game-title").value.trim();
      const genre  = document.getElementById("req-game-genre").value.trim();
      const roster = document.getElementById("req-game-roster").value.trim();
      if (!title) { alert("Please enter the game title."); return; }
      reqData = { title, genre, roster };
    }

    const request = {
      id:          "req-" + Date.now(),
      type,
      teamKey:     this.currentRequestTeam,
      submittedBy,
      submittedAt: new Date().toLocaleString(),
      status:      "pending",
      data:        reqData
    };

    this.pending.push(request);
    this.savePending();
    this.closeModal("request-modal");
    this.showToast("📨 Request submitted! An admin will review and accept it.");
    this.updateAdminUI();
  }

  // =========================================================================
  // ADMIN: APPROVALS & REQUEST MANAGEMENT (ACCEPT & REFLECT LIVE)
  // =========================================================================
  openApprovalsPanel() {
    if (!this.checkAdminAuth()) return;
    const modal = document.getElementById("approvals-modal");
    this.renderApprovals();
    modal.classList.add("active");
  }

  renderApprovals() {
    const list = document.getElementById("approvals-list");
    const pending = (this.pending || []).filter(r => r.status === "pending");

    if (pending.length === 0) {
      list.innerHTML = `<div class="approvals-empty">✅ No pending requests. All caught up!</div>`;
      return;
    }

    list.innerHTML = pending.map(req => {
      const teamLabel = req.teamKey === "godlike" ? "GodLike" : "S8UL";
      const themeColor = req.teamKey === "godlike" ? "var(--godl-gold)" : "var(--s8ul-blue)";
      let typeLabel = "👤 New Player";
      let details = "";

      if (req.type === "edit_player") {
        typeLabel = "✏️ Proposed Player Edit";
        details = `
          <div class="approval-detail"><strong>Target Player:</strong> ${this.escapeHtml(req.targetName || req.data.ign)}</div>
          <div class="approval-detail"><strong>Proposed IGN:</strong> ${this.escapeHtml(req.data.ign)}</div>
          <div class="approval-detail"><strong>Proposed Role:</strong> ${this.escapeHtml(req.data.role)}</div>
          <div class="approval-detail"><strong>Proposed Name:</strong> ${this.escapeHtml(req.data.name || "-")}</div>
          <div class="approval-detail"><strong>Proposed Stats:</strong> ${this.escapeHtml(req.data.stat1Label)}: ${this.escapeHtml(req.data.stat1Val)}</div>
          <div class="approval-detail"><strong>Notes / Bio:</strong> ${this.escapeHtml(req.data.desc || "-")}</div>
        `;
      } else if (req.type === "edit_game") {
        typeLabel = "✏️ Proposed Game Edit";
        details = `
          <div class="approval-detail"><strong>Target Game:</strong> ${this.escapeHtml(req.targetName || req.data.title)}</div>
          <div class="approval-detail"><strong>Proposed Title:</strong> ${this.escapeHtml(req.data.title)}</div>
          <div class="approval-detail"><strong>Proposed Genre:</strong> ${this.escapeHtml(req.data.genre || "-")}</div>
          <div class="approval-detail"><strong>Proposed Roster:</strong> ${this.escapeHtml(req.data.roster || "-")}</div>
          <div class="approval-detail"><strong>Status Badge:</strong> ${this.escapeHtml(req.data.status || "-")}</div>
        `;
      } else if (req.type === "player") {
        typeLabel = "👤 New Player Suggestion";
        details = `
          <div class="approval-detail"><strong>IGN:</strong> ${this.escapeHtml(req.data.ign)}</div>
          <div class="approval-detail"><strong>Real Name:</strong> ${this.escapeHtml(req.data.name || "-")}</div>
          <div class="approval-detail"><strong>Role:</strong> ${this.escapeHtml(req.data.role)}</div>
          <div class="approval-detail"><strong>Game:</strong> ${this.escapeHtml(req.data.game || "-")}</div>
          <div class="approval-detail"><strong>Note:</strong> ${this.escapeHtml(req.data.desc || "-")}</div>
        `;
      } else {
        typeLabel = "🎮 New Game Suggestion";
        details = `
          <div class="approval-detail"><strong>Title:</strong> ${this.escapeHtml(req.data.title)}</div>
          <div class="approval-detail"><strong>Genre:</strong> ${this.escapeHtml(req.data.genre || "-")}</div>
          <div class="approval-detail"><strong>Roster:</strong> ${this.escapeHtml(req.data.roster || "-")}</div>
        `;
      }

      return `
        <div class="approval-card" id="approval-${req.id}">
          <div class="approval-header">
            <span class="approval-type-badge" style="border-color:${themeColor};color:${themeColor};">
              ${typeLabel} · ${teamLabel}
            </span>
            <span class="approval-meta">By ${this.escapeHtml(req.submittedBy)} · ${req.submittedAt}</span>
          </div>
          ${details}
          <div class="approval-actions">
            <button class="btn-approve" onclick="window.cleanHub.approveRequest('${req.id}')">✅ Accept & Reflect Live</button>
            <button class="btn-reject"  onclick="window.cleanHub.rejectRequest('${req.id}')">❌ Reject</button>
            <button class="btn-delete-req" onclick="window.cleanHub.deleteRequest('${req.id}')">🗑️ Delete</button>
          </div>
        </div>`;
    }).join("");
  }

  // ─── Approve / Accept Request (IMMEDIATELY REFLECTS LIVE) ──────────────────
  approveRequest(reqId) {
    if (!this.checkAdminAuth()) return;
    const req = this.pending.find(r => r.id === reqId);
    if (!req) return;

    if (req.type === "edit_player") {
      const pData = this.findPlayer(req.teamKey, req.targetId);
      if (pData) {
        if (req.data.divisionId && pData.division.id !== req.data.divisionId) {
          pData.division.players = pData.division.players.filter(p => p.id !== req.targetId);
          const targetDiv = this.data[req.teamKey].divisions.find(d => d.id === req.data.divisionId) || pData.division;
          targetDiv.players.push({
            id: req.targetId,
            ign: req.data.ign,
            name: req.data.name || "",
            role: req.data.role,
            stat1Label: req.data.stat1Label,
            stat1Val: req.data.stat1Val,
            stat2Label: req.data.stat2Label || "STATUS",
            stat2Val: req.data.stat2Val || "Active",
            desc: req.data.desc || ""
          });
        } else {
          Object.assign(pData.player, {
            ign: req.data.ign,
            name: req.data.name || "",
            role: req.data.role,
            stat1Label: req.data.stat1Label,
            stat1Val: req.data.stat1Val,
            stat2Label: req.data.stat2Label || "STATUS",
            stat2Val: req.data.stat2Val || "Active",
            desc: req.data.desc || ""
          });
        }
        this.showToast(`✅ Edit accepted! "${req.data.ign}" is now updated live.`);
      }
    } else if (req.type === "edit_game") {
      const game = (this.data[req.teamKey]?.ewcGames || []).find(g => g.id === req.targetId);
      if (game) {
        Object.assign(game, {
          no: req.data.no,
          title: req.data.title,
          genre: req.data.genre || "",
          roster: req.data.roster || "",
          status: req.data.status || "EWC 2026 Official Title",
          highlight: !!req.data.highlight
        });
        this.data[req.teamKey].ewcGames.sort((a, b) => (a.no || 0) - (b.no || 0));
        this.showToast(`✅ Edit accepted! "${req.data.title}" is now updated live.`);
      }
    } else if (req.type === "player") {
      let targetDiv = this.data[req.teamKey].divisions.find(d => d.name === "Community Submissions")
                   || this.data[req.teamKey].divisions[0];
      if (!targetDiv) {
        targetDiv = { id: "div-subs-" + Date.now(), name: "Community Submissions", players: [] };
        this.data[req.teamKey].divisions.push(targetDiv);
      }
      targetDiv.players.push({
        id:          "p-" + Date.now(),
        ign:         req.data.ign,
        name:        req.data.name || "",
        role:        req.data.role,
        stat1Label:  "GAME",
        stat1Val:    req.data.game || "-",
        stat2Label:  "STATUS",
        stat2Val:    "Active",
        desc:        req.data.desc || ""
      });
      this.showToast(`✅ Player "${req.data.ign}" approved & added live!`);
    } else {
      const count = (this.data[req.teamKey].ewcGames || []).length + 1;
      this.data[req.teamKey].ewcGames.push({
        id:        "game-" + Date.now(),
        no:        count,
        title:     req.data.title,
        genre:     req.data.genre || "",
        roster:    req.data.roster || "",
        status:    "EWC 2026 Official Title",
        highlight: false
      });
      this.showToast(`✅ Game "${req.data.title}" approved & added live!`);
    }

    req.status = "approved";
    this.saveData();
    this.savePending();
    this.renderAll();
    this.renderApprovals();
    this.updateAdminUI();
  }

  rejectRequest(reqId) {
    if (!this.checkAdminAuth()) return;
    const req = this.pending.find(r => r.id === reqId);
    if (!req) return;
    if (confirm(`Reject this ${req.type} request from ${req.submittedBy}?`)) {
      req.status = "rejected";
      this.savePending();
      this.renderApprovals();
      this.updateAdminUI();
      this.showToast("❌ Request marked as rejected.");
    }
  }

  deleteRequest(reqId) {
    if (!this.checkAdminAuth()) return;
    const req = this.pending.find(r => r.id === reqId);
    if (!req) return;
    if (confirm(`⚠️ [ADMIN CONFIRMATION]\nAre you sure you want to permanently delete this request from ${req.submittedBy}?`)) {
      this.pending = this.pending.filter(r => r.id !== reqId);
      this.savePending();
      this.renderApprovals();
      this.updateAdminUI();
      this.showToast("🗑️ Request permanently deleted.");
    }
  }

  // =========================================================================
  // UTILITIES
  // =========================================================================
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
  }

  showToast(message) {
    let toast = document.getElementById("app-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "app-toast";
      toast.className = "app-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.cleanHub = new CleanEsportsHub();
});
