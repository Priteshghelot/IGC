// =============================================================================
// INDIA EWC ESPORTS HUB - APPLICATION & ADMIN ENGINE
// Developed by Pritesh Gehlot (@priteshgehlot)
// Full Admin CRUD (Edit, Add, Delete) for Players, Lineups & EWC Games
// Live LocalStorage Persistence & Zero Fake Profile Pictures
// =============================================================================

class CleanEsportsHub {
  constructor() {
    this.storageKey = "ewc_hub_data_v2";
    this.adminKey = "ewc_admin_active";
    this.adminPin = "admin"; // Admin PIN for security (default: admin)
    this.isAdmin = true; // Always enable modify & add controls inside club screens

    this.homeScreen = document.getElementById("home-screen");
    this.godlikeScreen = document.getElementById("screen-godlike");
    this.s8ulScreen = document.getElementById("screen-s8ul");

    this.cardGodlike = document.getElementById("card-godlike-select");
    this.cardS8ul = document.getElementById("card-s8ul-select");

    this.loadData();
    this.initEvents();
    this.renderAll();
    this.updateAdminUI();
  }

  // Deep clone helper
  cloneData(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Load from LocalStorage or fall back to INITIAL_HUB_DATA from data.js
  loadData() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        this.data = JSON.parse(saved);
      } else {
        this.data = this.cloneData(INITIAL_HUB_DATA);
        this.saveData();
      }
    } catch (e) {
      console.error("Error loading data from localStorage:", e);
      this.data = this.cloneData(INITIAL_HUB_DATA);
    }
  }

  // Save changes to LocalStorage
  saveData() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch (e) {
      console.error("Error saving data:", e);
    }
  }

  // Reset to original official data
  resetToDefaults() {
    if (confirm("Are you sure you want to reset all games and lineups back to official defaults? Any custom modifications will be cleared.")) {
      this.data = this.cloneData(INITIAL_HUB_DATA);
      this.saveData();
      this.renderAll();
      this.showToast("🔄 Data reset to official defaults!");
    }
  }

  initEvents() {
    // Portal Card Clicks on Home Screen
    if (this.cardGodlike) {
      this.cardGodlike.addEventListener("click", () => this.showGodlike());
    }
    if (this.cardS8ul) {
      this.cardS8ul.addEventListener("click", () => this.showS8ul());
    }

    // Sub-Tabs inside GodLike and S8UL screens
    document.querySelectorAll(".sub-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const parentScreen = btn.closest(".detail-screen");
        if (!parentScreen) return;

        const targetSubId = btn.dataset.sub;
        parentScreen.querySelectorAll(".sub-tab-btn").forEach(b => b.classList.remove("active"));
        parentScreen.querySelectorAll(".sub-tab-content").forEach(c => c.classList.remove("active"));

        btn.classList.add("active");
        const targetContent = document.getElementById(targetSubId);
        if (targetContent) targetContent.classList.add("active");
      });
    });

    // Close Modals on click outside or close buttons
    window.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-overlay")) {
        e.target.classList.remove("active");
      }
    });

    // Form Submissions
    const playerForm = document.getElementById("player-modal-form");
    if (playerForm) {
      playerForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSavePlayer();
      });
    }

    const gameForm = document.getElementById("game-modal-form");
    if (gameForm) {
      gameForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSaveGame();
      });
    }

    // Dynamic Division selector change in player modal
    const divSelect = document.getElementById("player-division-select");
    const divCustomWrap = document.getElementById("player-custom-division-wrap");
    if (divSelect && divCustomWrap) {
      divSelect.addEventListener("change", () => {
        if (divSelect.value === "__NEW__") {
          divCustomWrap.style.display = "block";
          document.getElementById("player-custom-division-input").required = true;
        } else {
          divCustomWrap.style.display = "none";
          document.getElementById("player-custom-division-input").required = false;
        }
      });
    }
  }

  // Navigation
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

  // ===========================================================================
  // ADMIN TOGGLE & AUTH
  // ===========================================================================
  toggleAdminMode() {
    if (this.isAdmin) {
      this.isAdmin = false;
      localStorage.setItem(this.adminKey, "false");
      this.updateAdminUI();
      this.renderAll();
      this.showToast("🔒 Admin mode deactivated");
    } else {
      const pin = prompt("Enter Admin PIN to enable modify access:\n(Default PIN: admin)", "");
      if (pin === null) return; // user cancelled
      if (pin === this.adminPin || pin.trim() === "admin" || pin.trim() === "1234") {
        this.isAdmin = true;
        localStorage.setItem(this.adminKey, "true");
        this.updateAdminUI();
        this.renderAll();
        this.showToast("👑 Admin mode activated! You can now edit, add, or delete players and games.");
      } else {
        alert("Incorrect PIN. Please use: admin");
      }
    }
  }

  updateAdminUI() {
    const adminBanner = document.getElementById("admin-banner");
    const adminToggles = document.querySelectorAll(".btn-admin-toggle-text");

    if (adminBanner) {
      adminBanner.style.display = this.isAdmin ? "block" : "none";
    }

    adminToggles.forEach(btn => {
      btn.textContent = this.isAdmin ? "👑 Admin: ON (Click to Exit)" : "⚙️ Admin Mode";
      if (this.isAdmin) {
        btn.classList.add("admin-active");
      } else {
        btn.classList.remove("admin-active");
      }
    });

    document.body.classList.toggle("admin-mode-active", this.isAdmin);
  }

  // ===========================================================================
  // RENDERING ALL VIEWS
  // ===========================================================================
  renderAll() {
    this.renderEWC("godlike", "godl-ewc-tbody", "var(--godl-gold)");
    this.renderEWC("s8ul", "s8ul-ewc-tbody", "var(--s8ul-blue)");
    this.renderRosters("godlike", "godl-roster-container", "var(--godl-gold)");
    this.renderRosters("s8ul", "s8ul-roster-container", "var(--s8ul-blue)");
  }

  // Render EWC Games Table
  renderEWC(teamKey, tbodyId, themeColor) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const games = this.data[teamKey]?.ewcGames || [];
    let html = "";

    games.forEach((g, index) => {
      const rowStyle = g.highlight ? `style="background:rgba(255, 255, 255, 0.05);"` : "";
      const statusStyle = `style="color:${themeColor}; font-weight:700;"`;

      html += `
        <tr ${rowStyle}>
          <td class="col-num" style="color:${themeColor};">${g.no || index + 1}</td>
          <td class="col-title">${this.escapeHtml(g.title)}</td>
          <td>${this.escapeHtml(g.genre)}</td>
          <td>${this.escapeHtml(g.roster)}</td>
          <td ${statusStyle}>${this.escapeHtml(g.status)}</td>
          ${this.isAdmin ? `
            <td class="admin-td-actions">
              <button class="btn-action-edit" title="Edit Game" onclick="window.cleanHub.openEditGameModal('${teamKey}', '${g.id}')">✏️ Edit</button>
              <button class="btn-action-delete" title="Delete Game" onclick="window.cleanHub.deleteGame('${teamKey}', '${g.id}')">🗑️</button>
            </td>
          ` : ""}
        </tr>
      `;
    });

    if (games.length === 0) {
      html = `<tr><td colspan="${this.isAdmin ? 6 : 5}" style="text-align:center; padding:2rem; color:var(--text-muted);">No EWC games listed. Click "Add Game" to add one.</td></tr>`;
    }

    tbody.innerHTML = html;

    // Admin Add Game Button below table
    const container = tbody.closest(".sub-tab-content");
    let adminBtnWrap = container ? container.querySelector(".admin-table-bar") : null;
    if (this.isAdmin) {
      if (!adminBtnWrap) {
        adminBtnWrap = document.createElement("div");
        adminBtnWrap.className = "admin-table-bar";
        container.appendChild(adminBtnWrap);
      }
      adminBtnWrap.innerHTML = `
        <button class="btn-admin-add" onclick="window.cleanHub.openAddGameModal('${teamKey}')">
          ➕ Add New EWC Game to ${this.data[teamKey]?.name || "Team"}
        </button>
      `;
      adminBtnWrap.style.display = "block";
    } else if (adminBtnWrap) {
      adminBtnWrap.style.display = "none";
    }
  }

  // Render Rosters (Divisions & Player Cards)
  renderRosters(teamKey, containerId, themeColor) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const divisions = this.data[teamKey]?.divisions || [];
    let html = "";

    divisions.forEach(div => {
      html += `
        <div class="division-block" id="div-${div.id}">
          <div class="division-header-wrap">
            <h3 style="color:${themeColor}; font-size:1.25rem; margin:1.25rem 0 0.85rem;">
              ${this.escapeHtml(div.name)}
            </h3>
            ${this.isAdmin ? `
              <div class="div-admin-actions">
                <button class="btn-action-add-player" onclick="window.cleanHub.openAddPlayerModal('${teamKey}', '${div.id}')">
                  ➕ Add Player
                </button>
                <button class="btn-action-delete-div" title="Delete this whole lineup division" onclick="window.cleanHub.deleteDivision('${teamKey}', '${div.id}')">
                  🗑️ Delete Lineup
                </button>
              </div>
            ` : ""}
          </div>

          <div class="roster-grid-clean" style="margin-bottom:2rem;">
      `;

      if (div.players && div.players.length > 0) {
        div.players.forEach(p => {
          html += `
            <div class="player-box" style="border-top: 2px solid ${themeColor};">
              ${this.isAdmin ? `
                <div class="player-card-admin-bar">
                  <button class="btn-card-edit" title="Edit Player Details" onclick="window.cleanHub.openEditPlayerModal('${teamKey}', '${p.id}')">✏️ Edit</button>
                  <button class="btn-card-delete" title="Remove Player" onclick="window.cleanHub.deletePlayer('${teamKey}', '${p.id}')">🗑️</button>
                </div>
              ` : ""}
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
            </div>
          `;
        });
      } else {
        html += `
          <div style="grid-column: 1/-1; padding:1.5rem; text-align:center; background:rgba(255,255,255,0.02); border-radius:10px; color:var(--text-muted);">
            No players currently in this lineup. Click "➕ Add Player" to add one.
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    });

    if (divisions.length === 0) {
      html = `<div style="text-align:center; padding:3rem; color:var(--text-muted);">No lineups found. Click "Add New Lineup" to get started.</div>`;
    }

    if (this.isAdmin) {
      html += `
        <div class="admin-roster-footer-bar">
          <button class="btn-admin-add" onclick="window.cleanHub.openAddPlayerModal('${teamKey}', '__NEW__')">
            ✨ + Add Entirely New Lineup / Division
          </button>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  // ===========================================================================
  // PLAYER MODAL: ADD / EDIT
  // ===========================================================================
  openAddPlayerModal(teamKey = "godlike", divisionId = null) {
    this.editingPlayerId = null;
    this.currentModalTeam = teamKey;

    const modal = document.getElementById("player-modal");
    const title = document.getElementById("player-modal-title");
    const teamSelect = document.getElementById("player-team-select");
    const divSelect = document.getElementById("player-division-select");
    const divCustomWrap = document.getElementById("player-custom-division-wrap");

    title.textContent = "➕ Add Player or New Lineup";
    teamSelect.value = teamKey;

    // Populate divisions for team
    this.populateDivisionSelect(teamKey, divisionId);

    // Clear inputs
    document.getElementById("player-ign-input").value = "";
    document.getElementById("player-name-input").value = "";
    document.getElementById("player-role-input").value = "";
    document.getElementById("player-stat1-label").value = "K/D";
    document.getElementById("player-stat1-val").value = "3.50";
    document.getElementById("player-stat2-val").value = "Active";
    document.getElementById("player-desc-input").value = "";
    document.getElementById("player-custom-division-input").value = "";

    if (divisionId === "__NEW__") {
      divSelect.value = "__NEW__";
      divCustomWrap.style.display = "block";
      document.getElementById("player-custom-division-input").required = true;
    } else {
      divCustomWrap.style.display = "none";
      document.getElementById("player-custom-division-input").required = false;
    }

    modal.classList.add("active");
  }

  openEditPlayerModal(teamKey, playerId) {
    const playerObj = this.findPlayer(teamKey, playerId);
    if (!playerObj) return;

    this.editingPlayerId = playerId;
    this.currentModalTeam = teamKey;

    const modal = document.getElementById("player-modal");
    const title = document.getElementById("player-modal-title");
    const teamSelect = document.getElementById("player-team-select");
    const divSelect = document.getElementById("player-division-select");
    const divCustomWrap = document.getElementById("player-custom-division-wrap");

    title.textContent = `✏️ Edit Player: ${playerObj.player.ign}`;
    teamSelect.value = teamKey;

    this.populateDivisionSelect(teamKey, playerObj.division.id);

    document.getElementById("player-ign-input").value = playerObj.player.ign || "";
    document.getElementById("player-name-input").value = playerObj.player.name || "";
    document.getElementById("player-role-input").value = playerObj.player.role || "";
    document.getElementById("player-stat1-label").value = playerObj.player.stat1Label || "K/D";
    document.getElementById("player-stat1-val").value = playerObj.player.stat1Val || "";
    document.getElementById("player-stat2-val").value = playerObj.player.stat2Val || "Active";
    document.getElementById("player-desc-input").value = playerObj.player.desc || "";

    divCustomWrap.style.display = "none";
    document.getElementById("player-custom-division-input").required = false;

    modal.classList.add("active");
  }

  populateDivisionSelect(teamKey, selectedDivId = null) {
    const divSelect = document.getElementById("player-division-select");
    const divisions = this.data[teamKey]?.divisions || [];

    let html = "";
    divisions.forEach(d => {
      const isSel = (d.id === selectedDivId) ? "selected" : "";
      html += `<option value="${d.id}" ${isSel}>${d.name}</option>`;
    });

    html += `<option value="__NEW__" ${(selectedDivId === "__NEW__") ? "selected" : ""}>➕ [Create New Lineup / Division]</option>`;
    divSelect.innerHTML = html;
  }

  handleSavePlayer() {
    const teamKey = document.getElementById("player-team-select").value;
    let divSelectVal = document.getElementById("player-division-select").value;

    const ign = document.getElementById("player-ign-input").value.trim();
    const name = document.getElementById("player-name-input").value.trim();
    const role = document.getElementById("player-role-input").value.trim();
    const stat1Label = document.getElementById("player-stat1-label").value.trim() || "K/D";
    const stat1Val = document.getElementById("player-stat1-val").value.trim() || "-";
    const stat2Val = document.getElementById("player-stat2-val").value.trim() || "Active";
    const desc = document.getElementById("player-desc-input").value.trim();

    if (!ign) {
      alert("Please enter the player's In-Game Name (IGN).");
      return;
    }

    // Check if creating a new division
    if (divSelectVal === "__NEW__") {
      const customDivName = document.getElementById("player-custom-division-input").value.trim();
      if (!customDivName) {
        alert("Please enter a name for the new lineup/division.");
        return;
      }
      const newDivId = "div-" + Date.now();
      const newDivision = {
        id: newDivId,
        name: customDivName,
        players: []
      };
      this.data[teamKey].divisions.push(newDivision);
      divSelectVal = newDivId;
    }

    if (this.editingPlayerId) {
      // Update existing
      const pData = this.findPlayer(this.currentModalTeam, this.editingPlayerId);
      if (pData) {
        // If team or division changed, remove from old
        if (this.currentModalTeam !== teamKey || pData.division.id !== divSelectVal) {
          pData.division.players = pData.division.players.filter(p => p.id !== this.editingPlayerId);
          // Add to new
          const targetDiv = this.data[teamKey].divisions.find(d => d.id === divSelectVal);
          if (targetDiv) {
            targetDiv.players.push({
              id: this.editingPlayerId,
              ign, name, role, stat1Label, stat1Val, stat2Label: "STATUS", stat2Val, desc
            });
          }
        } else {
          // Update in place
          Object.assign(pData.player, {
            ign, name, role, stat1Label, stat1Val, stat2Label: "STATUS", stat2Val, desc
          });
        }
      }
      this.showToast(`✅ Player "${ign}" updated!`);
    } else {
      // Add new
      const targetDiv = this.data[teamKey].divisions.find(d => d.id === divSelectVal);
      if (targetDiv) {
        const newPlayer = {
          id: "p-" + Date.now(),
          ign, name, role, stat1Label, stat1Val, stat2Label: "STATUS", stat2Val, desc
        };
        targetDiv.players.push(newPlayer);
        this.showToast(`✅ New player "${ign}" added to ${targetDiv.name}!`);
      }
    }

    this.saveData();
    this.renderAll();
    this.closeModal("player-modal");
  }

  deletePlayer(teamKey, playerId) {
    const pData = this.findPlayer(teamKey, playerId);
    if (!pData) return;

    if (confirm(`Are you sure you want to remove player "${pData.player.ign}" from ${pData.division.name}?`)) {
      pData.division.players = pData.division.players.filter(p => p.id !== playerId);
      this.saveData();
      this.renderAll();
      this.showToast(`🗑️ Player "${pData.player.ign}" removed.`);
    }
  }

  deleteDivision(teamKey, divisionId) {
    const div = this.data[teamKey]?.divisions.find(d => d.id === divisionId);
    if (!div) return;

    if (confirm(`Are you sure you want to delete the entire lineup "${div.name}" and all its players?`)) {
      this.data[teamKey].divisions = this.data[teamKey].divisions.filter(d => d.id !== divisionId);
      this.saveData();
      this.renderAll();
      this.showToast(`🗑️ Lineup "${div.name}" deleted.`);
    }
  }

  findPlayer(teamKey, playerId) {
    const divisions = this.data[teamKey]?.divisions || [];
    for (const division of divisions) {
      const player = division.players.find(p => p.id === playerId);
      if (player) {
        return { division, player };
      }
    }
    return null;
  }

  // ===========================================================================
  // GAME MODAL: ADD / EDIT
  // ===========================================================================
  openAddGameModal(teamKey = "godlike") {
    this.editingGameId = null;
    this.currentGameTeam = teamKey;

    const modal = document.getElementById("game-modal");
    const title = document.getElementById("game-modal-title");
    const teamSelect = document.getElementById("game-team-select");

    title.textContent = `➕ Add EWC Game Title`;
    teamSelect.value = teamKey;

    const gamesCount = (this.data[teamKey]?.ewcGames || []).length;
    document.getElementById("game-no-input").value = gamesCount + 1;
    document.getElementById("game-title-input").value = "";
    document.getElementById("game-genre-input").value = "";
    document.getElementById("game-roster-input").value = "";
    document.getElementById("game-status-input").value = "EWC 2026 Official Title";
    document.getElementById("game-highlight-check").checked = false;

    modal.classList.add("active");
  }

  openEditGameModal(teamKey, gameId) {
    const game = (this.data[teamKey]?.ewcGames || []).find(g => g.id === gameId);
    if (!game) return;

    this.editingGameId = gameId;
    this.currentGameTeam = teamKey;

    const modal = document.getElementById("game-modal");
    const title = document.getElementById("game-modal-title");
    const teamSelect = document.getElementById("game-team-select");

    title.textContent = `✏️ Edit Game: ${game.title}`;
    teamSelect.value = teamKey;

    document.getElementById("game-no-input").value = game.no || 1;
    document.getElementById("game-title-input").value = game.title || "";
    document.getElementById("game-genre-input").value = game.genre || "";
    document.getElementById("game-roster-input").value = game.roster || "";
    document.getElementById("game-status-input").value = game.status || "";
    document.getElementById("game-highlight-check").checked = !!game.highlight;

    modal.classList.add("active");
  }

  handleSaveGame() {
    const teamKey = document.getElementById("game-team-select").value;
    const no = parseInt(document.getElementById("game-no-input").value) || 1;
    const title = document.getElementById("game-title-input").value.trim();
    const genre = document.getElementById("game-genre-input").value.trim();
    const roster = document.getElementById("game-roster-input").value.trim();
    const status = document.getElementById("game-status-input").value.trim();
    const highlight = document.getElementById("game-highlight-check").checked;

    if (!title) {
      alert("Please enter the game title.");
      return;
    }

    if (this.editingGameId) {
      // If team changed, remove from old
      if (this.currentGameTeam !== teamKey) {
        this.data[this.currentGameTeam].ewcGames = this.data[this.currentGameTeam].ewcGames.filter(g => g.id !== this.editingGameId);
        this.data[teamKey].ewcGames.push({
          id: this.editingGameId, no, title, genre, roster, status, highlight
        });
      } else {
        const game = this.data[teamKey].ewcGames.find(g => g.id === this.editingGameId);
        if (game) {
          Object.assign(game, { no, title, genre, roster, status, highlight });
        }
      }
      this.showToast(`✅ Game "${title}" updated!`);
    } else {
      const newGame = {
        id: "game-" + Date.now(),
        no, title, genre, roster, status, highlight
      };
      this.data[teamKey].ewcGames.push(newGame);
      this.showToast(`✅ Game "${title}" added to EWC lineup!`);
    }

    // Sort by game number
    this.data[teamKey].ewcGames.sort((a, b) => (a.no || 0) - (b.no || 0));

    this.saveData();
    this.renderAll();
    this.closeModal("game-modal");
  }

  deleteGame(teamKey, gameId) {
    const game = (this.data[teamKey]?.ewcGames || []).find(g => g.id === gameId);
    if (!game) return;

    if (confirm(`Are you sure you want to delete "${game.title}" from ${this.data[teamKey]?.name} EWC games?`)) {
      this.data[teamKey].ewcGames = this.data[teamKey].ewcGames.filter(g => g.id !== gameId);
      this.saveData();
      this.renderAll();
      this.showToast(`🗑️ Game "${game.title}" removed.`);
    }
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================
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
    this.toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, 3200);
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
