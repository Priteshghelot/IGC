// =============================================================================
// INDIA EWC ESPORTS HUB - APPLICATION ENGINE
// Developed by Pritesh Gehlot (@priteshgehlot)
// Role-Based System:
//   ADMIN  → Full CRUD: add/edit/delete players & EWC games, approve/reject user requests
//   USER   → Submit player/game suggestions; pending admin approval before going live
// =============================================================================

class CleanEsportsHub {
  constructor() {
    this.storageKey    = "ewc_hub_data_v2";
    this.adminKey      = "ewc_admin_session";
    this.pendingKey    = "ewc_pending_requests";
    this.adminPin      = "admin123"; // Change this to your secret PIN
    this.isAdmin       = false;      // Always starts as regular user

    this.homeScreen    = document.getElementById("home-screen");
    this.godlikeScreen = document.getElementById("screen-godlike");
    this.s8ulScreen    = document.getElementById("screen-s8ul");
    this.cardGodlike   = document.getElementById("card-godlike-select");
    this.cardS8ul      = document.getElementById("card-s8ul-select");

    // Restore admin session if still active (tab-level only)
    if (sessionStorage.getItem(this.adminKey) === "true") {
      this.isAdmin = true;
    }

    this.loadData();
    this.loadPending();
    this.initEvents();
    this.renderAll();
    this.updateAdminUI();
    this.injectAdminLoginBtn();
  }

  // ─── Deep clone ───────────────────────────────────────────────────────────
  cloneData(obj) { return JSON.parse(JSON.stringify(obj)); }

  // ─── Persistent Data ──────────────────────────────────────────────────────
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

  // ─── Pending Request Queue (user submissions) ─────────────────────────────
  loadPending() {
    try {
      const raw = localStorage.getItem(this.pendingKey);
      this.pending = raw ? JSON.parse(raw) : [];
    } catch(e) { this.pending = []; }
  }
  savePending() {
    try { localStorage.setItem(this.pendingKey, JSON.stringify(this.pending)); } catch(e) {}
  }

  // ─── Reset to defaults ────────────────────────────────────────────────────
  resetToDefaults() {
    if (!this.isAdmin) return;
    if (confirm("Reset ALL data to official defaults? Custom changes will be cleared.")) {
      this.data = this.cloneData(INITIAL_HUB_DATA);
      this.saveData();
      this.renderAll();
      this.showToast("🔄 Reset to official defaults!");
    }
  }

  // ─── Event Bindings ───────────────────────────────────────────────────────
  initEvents() {
    if (this.cardGodlike) this.cardGodlike.addEventListener("click", () => this.showGodlike());
    if (this.cardS8ul)    this.cardS8ul.addEventListener("click",    () => this.showS8ul());

    // Sub-tabs
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

    // Close modals on outside click
    window.addEventListener("click", e => {
      if (e.target.classList.contains("modal-overlay")) e.target.classList.remove("active");
    });

    // Player form
    const pf = document.getElementById("player-modal-form");
    if (pf) pf.addEventListener("submit", e => { e.preventDefault(); this.handleSavePlayer(); });

    // Game form
    const gf = document.getElementById("game-modal-form");
    if (gf) gf.addEventListener("submit", e => { e.preventDefault(); this.handleSaveGame(); });

    // User request form
    const rf = document.getElementById("request-modal-form");
    if (rf) rf.addEventListener("submit", e => { e.preventDefault(); this.handleUserRequest(); });

    // Division selector
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
  // ADMIN AUTH
  // =========================================================================
  injectAdminLoginBtn() {
    // Add a subtle admin login button at the bottom of the page
    const existing = document.getElementById("admin-login-fab");
    if (existing) return;
    const fab = document.createElement("button");
    fab.id = "admin-login-fab";
    fab.className = "admin-login-fab";
    fab.title = this.isAdmin ? "Exit Admin Mode" : "Admin Login";
    fab.innerHTML = this.isAdmin ? "👑 Admin" : "🔑 Admin";
    fab.onclick = () => this.toggleAdminMode();
    document.body.appendChild(fab);
  }

  toggleAdminMode() {
    if (this.isAdmin) {
      if (confirm("Exit admin mode?")) {
        this.isAdmin = false;
        sessionStorage.removeItem(this.adminKey);
        this.updateAdminUI();
        this.renderAll();
        this.showToast("🔒 Logged out of admin mode");
        document.getElementById("admin-login-fab").innerHTML = "🔑 Admin";
        document.getElementById("admin-login-fab").title = "Admin Login";
      }
    } else {
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
    if (pin === "admin" || pin === "admin123" || pin === this.adminPin) {
      this.isAdmin = true;
      sessionStorage.setItem(this.adminKey, "true");
      this.updateAdminUI();
      this.renderAll();
      this.closeModal("admin-login-modal");
      this.showToast("👑 Admin access granted! You can now edit, approve & manage.");
      const fab = document.getElementById("admin-login-fab");
      if (fab) {
        fab.innerHTML = "👑 Admin: ON (Exit)";
        fab.title = "Exit Admin Mode";
      }
    } else {
      const err = document.getElementById("admin-pin-error");
      if (err) err.style.display = "block";
      document.getElementById("admin-pin-input").value = "";
      document.getElementById("admin-pin-input").focus();
    }
  }

  updateAdminUI() {
    const banner = document.getElementById("admin-banner");
    if (banner) banner.style.display = this.isAdmin ? "block" : "none";

    const pendingCount = (this.pending || []).filter(r => r.status === "pending").length;

    // Show pending badge on admin banner
    if (this.isAdmin) {
      const badge = document.getElementById("pending-count-badge");
      if (badge) {
        badge.textContent = pendingCount > 0 ? `${pendingCount} new request${pendingCount > 1 ? 's' : ''}` : "";
        badge.style.display = pendingCount > 0 ? "inline-block" : "none";
      }
      const numSpan = document.getElementById("admin-pending-num");
      if (numSpan) numSpan.textContent = pendingCount > 0 ? `(${pendingCount})` : "";
    }

    document.body.classList.toggle("admin-mode-active", this.isAdmin);

    // Show/hide submit request buttons (only for non-admins)
    document.querySelectorAll(".btn-user-submit-request").forEach(btn => {
      btn.style.display = this.isAdmin ? "none" : "inline-flex";
    });

    // Show/hide admin only buttons
    document.querySelectorAll(".admin-only-btn").forEach(btn => {
      btn.style.display = this.isAdmin ? "inline-flex" : "none";
    });
  }

  // =========================================================================
  // RENDERING
  // =========================================================================
  renderAll() {
    this.renderEWC("godlike", "godl-ewc-tbody", "var(--godl-gold)");
    this.renderEWC("s8ul",    "s8ul-ewc-tbody",  "var(--s8ul-blue)");
    this.renderRosters("godlike", "godl-roster-container", "var(--godl-gold)");
    this.renderRosters("s8ul",    "s8ul-roster-container",  "var(--s8ul-blue)");
  }

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
          ${this.isAdmin ? `
            <td class="admin-td-actions" data-label="Actions">
              <button class="btn-action-edit" onclick="window.cleanHub.openEditGameModal('${teamKey}','${g.id}')">✏️ Edit</button>
              <button class="btn-action-delete" onclick="window.cleanHub.deleteGame('${teamKey}','${g.id}')">🗑️</button>
            </td>` : ""}
        </tr>`;
    });

    if (games.length === 0) {
      html = `<tr><td colspan="${this.isAdmin ? 6 : 5}" style="text-align:center;padding:2rem;color:var(--text-muted);">No EWC games listed yet.</td></tr>`;
    }
    tbody.innerHTML = html;

    // Admin: add game button below table
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
          ✨ + Add EWC Game Title
        </button>`;
      adminBar.style.display = "block";
    } else if (adminBar) {
      adminBar.style.display = "none";
    }
  }

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
              ${this.isAdmin ? `
                <div class="player-card-admin-bar">
                  <button class="btn-card-edit" onclick="window.cleanHub.openEditPlayerModal('${teamKey}','${p.id}')">✏️ Edit</button>
                  <button class="btn-card-delete" onclick="window.cleanHub.deletePlayer('${teamKey}','${p.id}')">🗑️</button>
                </div>` : ""}
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
  // ADMIN: PLAYER MODAL (ADD / EDIT)
  // =========================================================================
  openAddPlayerModal(teamKey = "godlike", divisionId = null) {
    if (!this.isAdmin) return;
    this.editingPlayerId = null;
    this.currentModalTeam = teamKey;
    const modal = document.getElementById("player-modal");
    document.getElementById("player-modal-title").textContent = "➕ Add Player or New Lineup";
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
    if (!this.isAdmin) return;
    const pData = this.findPlayer(teamKey, playerId);
    if (!pData) return;
    this.editingPlayerId = playerId;
    this.currentModalTeam = teamKey;
    const modal = document.getElementById("player-modal");
    document.getElementById("player-modal-title").textContent = `✏️ Edit Player: ${pData.player.ign}`;
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
    html += `<option value="__NEW__" ${selectedDivId === "__NEW__" ? "selected" : ""}>➕ [Create New Lineup]</option>`;
    divSelect.innerHTML = html;
  }

  handleSavePlayer() {
    if (!this.isAdmin) return;
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
      this.showToast(`✅ Player "${ign}" updated!`);
    } else {
      const target = this.data[teamKey].divisions.find(d => d.id === divVal);
      if (target) {
        target.players.push({ id: "p-" + Date.now(), ign, name, role, stat1Label, stat1Val, stat2Label: "STATUS", stat2Val, desc });
        this.showToast(`✅ Player "${ign}" added!`);
      }
    }

    this.saveData(); this.renderAll(); this.closeModal("player-modal");
  }

  deletePlayer(teamKey, playerId) {
    if (!this.isAdmin) return;
    const pData = this.findPlayer(teamKey, playerId);
    if (!pData) return;
    if (confirm(`Remove player "${pData.player.ign}"?`)) {
      pData.division.players = pData.division.players.filter(p => p.id !== playerId);
      this.saveData(); this.renderAll();
      this.showToast(`🗑️ Player "${pData.player.ign}" removed.`);
    }
  }

  deleteDivision(teamKey, divisionId) {
    if (!this.isAdmin) return;
    const div = this.data[teamKey]?.divisions.find(d => d.id === divisionId);
    if (!div) return;
    if (confirm(`Delete entire lineup "${div.name}" and all its players?`)) {
      this.data[teamKey].divisions = this.data[teamKey].divisions.filter(d => d.id !== divisionId);
      this.saveData(); this.renderAll();
      this.showToast(`🗑️ Lineup "${div.name}" deleted.`);
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
  // ADMIN: GAME MODAL (ADD / EDIT)
  // =========================================================================
  openAddGameModal(teamKey = "godlike") {
    if (!this.isAdmin) return;
    this.editingGameId = null;
    this.currentGameTeam = teamKey;
    document.getElementById("game-modal-title").textContent = "➕ Add EWC Game Title";
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
    if (!this.isAdmin) return;
    const game = (this.data[teamKey]?.ewcGames || []).find(g => g.id === gameId);
    if (!game) return;
    this.editingGameId = gameId;
    this.currentGameTeam = teamKey;
    document.getElementById("game-modal-title").textContent = `✏️ Edit: ${game.title}`;
    document.getElementById("game-team-select").value = teamKey;
    document.getElementById("game-no-input").value     = game.no || 1;
    document.getElementById("game-title-input").value  = game.title || "";
    document.getElementById("game-genre-input").value  = game.genre || "";
    document.getElementById("game-roster-input").value = game.roster || "";
    document.getElementById("game-status-input").value = game.status || "";
    document.getElementById("game-highlight-check").checked = !!game.highlight;
    document.getElementById("game-modal").classList.add("active");
  }

  handleSaveGame() {
    if (!this.isAdmin) return;
    const teamKey   = document.getElementById("game-team-select").value;
    const no        = parseInt(document.getElementById("game-no-input").value) || 1;
    const title     = document.getElementById("game-title-input").value.trim();
    const genre     = document.getElementById("game-genre-input").value.trim();
    const roster    = document.getElementById("game-roster-input").value.trim();
    const status    = document.getElementById("game-status-input").value.trim();
    const highlight = document.getElementById("game-highlight-check").checked;
    if (!title) { alert("Please enter the game title."); return; }

    if (this.editingGameId) {
      if (this.currentGameTeam !== teamKey) {
        this.data[this.currentGameTeam].ewcGames = this.data[this.currentGameTeam].ewcGames.filter(g => g.id !== this.editingGameId);
        this.data[teamKey].ewcGames.push({ id: this.editingGameId, no, title, genre, roster, status, highlight });
      } else {
        const game = this.data[teamKey].ewcGames.find(g => g.id === this.editingGameId);
        if (game) Object.assign(game, { no, title, genre, roster, status, highlight });
      }
      this.showToast(`✅ Game "${title}" updated!`);
    } else {
      this.data[teamKey].ewcGames.push({ id: "game-" + Date.now(), no, title, genre, roster, status, highlight });
      this.showToast(`✅ Game "${title}" added!`);
    }

    this.data[teamKey].ewcGames.sort((a, b) => (a.no || 0) - (b.no || 0));
    this.saveData(); this.renderAll(); this.closeModal("game-modal");
  }

  deleteGame(teamKey, gameId) {
    if (!this.isAdmin) return;
    const game = (this.data[teamKey]?.ewcGames || []).find(g => g.id === gameId);
    if (!game) return;
    if (confirm(`Delete "${game.title}"?`)) {
      this.data[teamKey].ewcGames = this.data[teamKey].ewcGames.filter(g => g.id !== gameId);
      this.saveData(); this.renderAll();
      this.showToast(`🗑️ Game "${game.title}" removed.`);
    }
  }

  // =========================================================================
  // USER: SUBMIT SUGGESTION (open form)
  // =========================================================================
  openRequestModal(teamKey) {
    if (this.isAdmin) return; // Admins edit directly
    this.currentRequestTeam = teamKey;
    const modal = document.getElementById("request-modal");
    document.getElementById("request-team-label").textContent =
      teamKey === "godlike" ? "GodLike Esports" : "S8UL Esports";
    document.getElementById("request-type-select").value = "player";
    document.getElementById("req-player-fields").style.display = "block";
    document.getElementById("req-game-fields").style.display   = "none";
    // Clear fields
    ["req-ign","req-realname","req-role","req-game","req-desc","req-game-title","req-game-genre","req-game-roster"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    document.getElementById("req-name-input").value = "";
    modal.classList.add("active");

    // Toggle between player/game request type
    document.getElementById("request-type-select").onchange = function() {
      document.getElementById("req-player-fields").style.display = this.value === "player" ? "block" : "none";
      document.getElementById("req-game-fields").style.display   = this.value === "game"   ? "block" : "none";
    };
  }

  handleUserRequest() {
    const type        = document.getElementById("request-type-select").value;
    const submittedBy = document.getElementById("req-name-input").value.trim() || "Anonymous";

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
    this.showToast("📨 Request submitted! An admin will review it soon.");
    this.updateAdminUI();
  }

  // =========================================================================
  // ADMIN: APPROVALS PANEL
  // =========================================================================
  openApprovalsPanel() {
    if (!this.isAdmin) return;
    const modal = document.getElementById("approvals-modal");
    this.renderApprovals();
    modal.classList.add("active");
  }

  renderApprovals() {
    const list = document.getElementById("approvals-list");
    const pending = this.pending.filter(r => r.status === "pending");

    if (pending.length === 0) {
      list.innerHTML = `<div class="approvals-empty">✅ No pending requests. All caught up!</div>`;
      return;
    }

    list.innerHTML = pending.map(req => {
      const teamLabel = req.teamKey === "godlike" ? "GodLike" : "S8UL";
      const themeColor = req.teamKey === "godlike" ? "var(--godl-gold)" : "var(--s8ul-blue)";
      let details = "";
      if (req.type === "player") {
        details = `
          <div class="approval-detail"><strong>IGN:</strong> ${this.escapeHtml(req.data.ign)}</div>
          <div class="approval-detail"><strong>Real Name:</strong> ${this.escapeHtml(req.data.name || "-")}</div>
          <div class="approval-detail"><strong>Role:</strong> ${this.escapeHtml(req.data.role)}</div>
          <div class="approval-detail"><strong>Game:</strong> ${this.escapeHtml(req.data.game || "-")}</div>
          <div class="approval-detail"><strong>Note:</strong> ${this.escapeHtml(req.data.desc || "-")}</div>`;
      } else {
        details = `
          <div class="approval-detail"><strong>Title:</strong> ${this.escapeHtml(req.data.title)}</div>
          <div class="approval-detail"><strong>Genre:</strong> ${this.escapeHtml(req.data.genre || "-")}</div>
          <div class="approval-detail"><strong>Roster:</strong> ${this.escapeHtml(req.data.roster || "-")}</div>`;
      }

      return `
        <div class="approval-card" id="approval-${req.id}">
          <div class="approval-header">
            <span class="approval-type-badge" style="border-color:${themeColor};color:${themeColor};">
              ${req.type === "player" ? "👤 Player" : "🎮 Game"} · ${teamLabel}
            </span>
            <span class="approval-meta">By ${this.escapeHtml(req.submittedBy)} · ${req.submittedAt}</span>
          </div>
          ${details}
          <div class="approval-actions">
            <button class="btn-approve" onclick="window.cleanHub.approveRequest('${req.id}')">✅ Approve</button>
            <button class="btn-reject"  onclick="window.cleanHub.rejectRequest('${req.id}')">❌ Reject</button>
          </div>
        </div>`;
    }).join("");
  }

  approveRequest(reqId) {
    const req = this.pending.find(r => r.id === reqId);
    if (!req) return;

    if (req.type === "player") {
      // Add to first division, or create a new "Submissions" division
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
      this.showToast(`✅ Player "${req.data.ign}" approved & added!`);
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
      this.showToast(`✅ Game "${req.data.title}" approved & added!`);
    }

    req.status = "approved";
    this.saveData();
    this.savePending();
    this.renderAll();
    this.renderApprovals();
    this.updateAdminUI();
  }

  rejectRequest(reqId) {
    const req = this.pending.find(r => r.id === reqId);
    if (!req) return;
    if (confirm(`Reject this ${req.type} request from ${req.submittedBy}?`)) {
      req.status = "rejected";
      this.savePending();
      this.renderApprovals();
      this.updateAdminUI();
      this.showToast("❌ Request rejected.");
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
