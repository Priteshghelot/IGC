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
    this.storageKey    = "ewc_hub_data_v3"; // v3: old stale browser caches are ignored
    this.adminKey      = "ewc_admin_session";
    this.pendingKey    = "ewc_pending_requests";
    this.adminPin      = "admin";   // Primary Admin PIN (also accepts admin123)
    this.isAdmin       = false;     // Default to standard visitor mode

    this.homeScreen         = document.getElementById("home-screen");
    this.godlikeScreen      = document.getElementById("screen-godlike");
    this.s8ulScreen         = document.getElementById("screen-s8ul");
    this.dailyUpdatesScreen = document.getElementById("screen-daily-updates");
    this.cardGodlike        = document.getElementById("card-godlike-select");
    this.cardS8ul           = document.getElementById("card-s8ul-select");
    this.dailyUpdates       = (typeof INITIAL_DAILY_UPDATES !== "undefined") ? INITIAL_DAILY_UPDATES : (INITIAL_HUB_DATA.dailyUpdates || []);
    this.currentDailyFilter = "all";
    this.rosterFilter       = { godlike: { q: "", cat: "ALL" }, s8ul: { q: "", cat: "ALL" } };

    // Restore active admin session if already authenticated in this tab or from /admin
    if (sessionStorage.getItem(this.adminKey) === "true" || (window.location && window.location.search && window.location.search.includes("admin=true"))) {
      this.isAdmin = true;
      sessionStorage.setItem(this.adminKey, "true");
    }

    this.loadData();
    this.loadPending();
    this.initEvents();
    this.renderAll();
    this.updateAdminUI();

    // Sync from Cloud Database (Redis API)
    this.syncCloudData();
    this.syncCloudPending();

    // Check deep link hash
    if (window.location.hash === "#daily-updates") {
      this.showDailyUpdates();
    }
    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#daily-updates") {
        this.showDailyUpdates();
      } else if (!window.location.hash || window.location.hash === "#home" || window.location.hash === "#") {
        this.showHome();
      }
    });
  }

  // ─── Server-side atomic change (the ONLY way data is modified) ────────────
  // The browser sends just the single change; the server applies it to the
  // latest database copy and returns the fresh data. Stale tabs can no longer
  // overwrite the database or bring deleted rows back.
  async cloudOp(op, successMsg) {
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op)
      });
      const json = await res.json().catch(() => ({}));
      if (json.data) this.applyServerData(json.data);
      if (!res.ok || !json.ok) {
        alert("⚠️ " + (json.error || "Save failed. Please refresh and try again."));
        return false;
      }
      if (successMsg) this.showToast(successMsg);
      return true;
    } catch (e) {
      alert("⚠️ Network error. Nothing was saved. Please check your connection and try again.");
      return false;
    }
  }

  applyServerData(data) {
    if (!data || typeof data !== "object") return;
    this.data = data;
    this.saveData();
    this.renderAll();
  }

  async syncCloudData() {
    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          this.data = json.data;
          this.saveData();
          this.renderAll();
        }
      }
    } catch(e) {}
  }

  async syncCloudPending() {
    try {
      const res = await fetch('/api/requests', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.requests)) {
          // Server is the single source of truth for requests
          this.pending = json.requests;
          this.savePending();
          this.updateAdminUI();
          this.renderDailyMarquee();
        }
      }
    } catch(e) {}
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
    if (this.dailyUpdatesScreen) this.dailyUpdatesScreen.classList.remove("active");
    this.homeScreen.style.display = "flex";
    if (window.location.hash === "#daily-updates") {
      try { history.replaceState(null, null, " "); } catch(e) {}
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showGodlike() {
    this.homeScreen.style.display = "none";
    this.s8ulScreen.classList.remove("active");
    if (this.dailyUpdatesScreen) this.dailyUpdatesScreen.classList.remove("active");
    this.godlikeScreen.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showS8ul() {
    this.homeScreen.style.display = "none";
    this.godlikeScreen.classList.remove("active");
    if (this.dailyUpdatesScreen) this.dailyUpdatesScreen.classList.remove("active");
    this.s8ulScreen.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showDailyUpdates() {
    this.homeScreen.style.display = "none";
    this.godlikeScreen.classList.remove("active");
    this.s8ulScreen.classList.remove("active");
    if (this.dailyUpdatesScreen) this.dailyUpdatesScreen.classList.add("active");
    
    const dateEl = document.getElementById("daily-live-date-text");
    if (dateEl) {
      const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      dateEl.textContent = `${today} · LIVE DESK`;
    }

    this.renderApprovedPosts();
    this.renderUpcomingTournaments();
    this.renderThirdPartyTournaments();
    try { window.location.hash = "daily-updates"; } catch(e) {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  openAddDailyPost() {
    this.switchDailyTab("updates");
    const box = document.getElementById("daily-upload-box");
    const btn = document.getElementById("btn-toggle-daily-upload");
    if (box) {
      box.style.display = "block";
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (btn) btn.textContent = "✕ Close Upload Form";
  }

  toggleDailyUploadBox() {
    const box = document.getElementById("daily-upload-box");
    const btn = document.getElementById("btn-toggle-daily-upload");
    if (!box) return;
    const isHidden = box.style.display === "none" || !box.style.display;
    box.style.display = isHidden ? "block" : "none";
    if (btn) btn.textContent = isHidden ? "✕ Close Upload Form" : "📸 + Upload / Submit New Post";
  }

  openImageLightbox(src) {
    const modal = document.getElementById("image-lightbox-modal");
    const img   = document.getElementById("lightbox-img");
    if (!modal || !img || !src) return;
    img.src = src;
    modal.classList.add("active");
  }

  switchDailyTab(tabName = "updates") {
    const panels = {
      updates:     { view: "daily-updates-tab-view",     btn: "btn-daily-tab-updates" },
      tournaments: { view: "daily-tournaments-tab-view", btn: "btn-daily-tab-tournaments" },
      thirdparty:  { view: "daily-thirdparty-tab-view",  btn: "btn-daily-tab-thirdparty" }
    };
    Object.entries(panels).forEach(([key, ids]) => {
      const v = document.getElementById(ids.view);
      const b = document.getElementById(ids.btn);
      const active = key === tabName;
      if (v) v.style.display = active ? "block" : "none";
      if (b) b.classList.toggle("active", active);
    });

    if (tabName === "tournaments") this.renderUpcomingTournaments();
    if (tabName === "thirdparty")  this.renderThirdPartyTournaments();
  }

  getDefaultMajorTournaments() {
    return [
      {
        title: "BGMI India Pro Series (BMPS) Winter Cup",
        game: "BGMI",
        startDate: "2026-11-20",
        endDate: "2026-12-06",
        prize: "₹1,00,00,000+",
        teams: "Top 32 Invited & Open Indian Squads (GodLike, Team SouL, Revenant)",
        location: "India (LAN Finals)"
      },
      {
        title: "PUBG Mobile Global Championship (PMGC) 2026",
        game: "PUBG Mobile",
        startDate: "2026-11-24",
        endDate: "2026-12-14",
        prize: "$3,000,000 USD",
        teams: "International Champions & South Asia / India Contenders",
        location: "Global LAN"
      },
      {
        title: "Valorant Challengers South Asia: Split 1",
        game: "Valorant",
        startDate: "2026-11-28",
        endDate: "2026-12-18",
        prize: "$50,000 USD",
        teams: "GodLike, Global Esports Academy, Orangutan, Velocity",
        location: "South Asia / Mumbai"
      },
      {
        title: "Free Fire MAX India Winter Championship",
        game: "Free Fire MAX",
        startDate: "2026-12-05",
        endDate: "2026-12-22",
        prize: "₹50,00,000",
        teams: "Top 18 Indian Mobile Rosters (GodLike, S8UL, TSG)",
        location: "Online + Delhi LAN"
      },
      {
        title: "CODM India National Qualifiers 2026",
        game: "Call of Duty: Mobile",
        startDate: "2026-12-12",
        endDate: "2026-12-29",
        prize: "$40,000 USD",
        teams: "GodLike CODM, S8UL & Top Indian Mobile Squads",
        location: "India Regional"
      },
      {
        title: "Pokemon UNITE India Winter Invitational",
        game: "Pokemon UNITE",
        startDate: "2026-12-19",
        endDate: "2027-01-04",
        prize: "$25,000 USD",
        teams: "S8UL Pokemon Unite & India Top 16",
        location: "India / APAC"
      },
      {
        title: "MLBB South Asia & India Championship",
        game: "MLBB",
        startDate: "2026-12-26",
        endDate: "2027-01-12",
        prize: "$50,000 USD",
        teams: "GodLike MLBB Women, S8UL MLBB & Indian Challengers",
        location: "India / SEA Qualifier"
      },
      {
        title: "BGMI India Series (BGIS) 2027",
        game: "BGMI",
        startDate: "2027-01-10",
        endDate: "2027-02-15",
        prize: "₹2,00,00,000+",
        teams: "All Indian Pro & Underdog Squads (GodLike, Team SouL, S8UL)",
        location: "Pan-India + LAN Grand Finals"
      },
      {
        title: "VCT Pacific Kickoff 2027",
        game: "Valorant",
        startDate: "2027-01-18",
        endDate: "2027-02-08",
        prize: "Masters Qualification",
        teams: "Global Esports (India Rep) & Top APAC Clubs",
        location: "Seoul, South Korea"
      },
      {
        title: "Tekken World Tour: India & South Asia Major",
        game: "Tekken 8",
        startDate: "2027-02-05",
        endDate: "2027-02-16",
        prize: "TWT Ranking Points + $20,000",
        teams: "S8UL (Soul, AK, Arhaan), GodLike FGC & Top Indian Players",
        location: "Bengaluru / South Asia"
      },
      {
        title: "EWC 2027 India & South Asia Qualifiers",
        game: "Multi-Title (Tekken 8, Chess, FC, MLBB)",
        startDate: "2027-02-20",
        endDate: "2027-03-25",
        prize: "Riyadh EWC27 Slots",
        teams: "GodLike Esports, S8UL Esports & Indian Athletes",
        location: "India / Riyadh Road"
      },
      {
        title: "Skyesports Championship 2027 (BGMI & Valorant)",
        game: "BGMI / Valorant",
        startDate: "2027-03-10",
        endDate: "2027-04-02",
        prize: "₹1,50,00,000",
        teams: "GodLike, S8UL, Revenant, Orangutan & Invited Clubs",
        location: "Mumbai / Pune LAN"
      },
      {
        title: "PUBG Mobile World Cup (PMWC) 2027 Qualifiers",
        game: "PUBG Mobile / BGMI",
        startDate: "2027-04-15",
        endDate: "2027-05-10",
        prize: "EWC27 Riyadh Qualification",
        teams: "India & South Asia Champion Squads",
        location: "Regional + Riyadh"
      },
      {
        title: "Esports World Cup (EWC) 2027 — Riyadh",
        game: "All Official EWC27 Titles",
        startDate: "2027-07-08",
        endDate: "2027-08-24",
        prize: "$60,000,000+ Club & Game Pools",
        teams: "GodLike Esports, S8UL Esports & Global Club Partners",
        location: "Riyadh, Saudi Arabia"
      }
    ];
  }

  renderUpcomingTournaments() {
    const container = document.getElementById("upcoming-tournaments-list");
    if (!container) return;

    const customList = Array.isArray(this.data?.upcomingTournaments) && this.data.upcomingTournaments.length > 0
      ? this.data.upcomingTournaments
      : this.getDefaultMajorTournaments();

    this.renderTournamentCards(container, customList, 10, "No Upcoming Major Tournaments Scheduled");
  }

  renderDailyMarquee() {
    const track = document.getElementById("daily-marquee-content");
    if (!track) return;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const parseLocal = (iso) => {
      const [y, m, d] = String(iso || "").split("-").map(Number);
      return new Date(y, (m || 1) - 1, d || 1).getTime();
    };
    const fmtDate = (iso) => {
      if (!iso) return "";
      return new Date(parseLocal(iso)).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    };

    const majorList = Array.isArray(this.data?.upcomingTournaments) && this.data.upcomingTournaments.length > 0
      ? this.data.upcomingTournaments
      : this.getDefaultMajorTournaments();
    const tpList = this.getActiveThirdPartyList();

    const combined = [...majorList.map(t => ({ ...t, _kind: "🏆" })), ...tpList.map(t => ({ ...t, _kind: "🎮" }))]
      .filter(t => t.startDate && parseLocal(t.endDate || t.startDate) >= todayStart)
      .sort((a, b) => parseLocal(a.startDate) - parseLocal(b.startDate))
      .slice(0, 5);

    const headlines = combined.map(t => {
      const sMs = parseLocal(t.startDate);
      const eMs = parseLocal(t.endDate || t.startDate);
      const badge = (todayStart >= sMs && todayStart <= eMs) ? "LIVE NOW" : `Starts ${fmtDate(t.startDate)}`;
      return `<span class="marquee-headline">${t._kind} <strong>${this.escapeHtml(t.title)}</strong> (${this.escapeHtml(t.game)}) • ${badge}${t.prize ? ` · ${this.escapeHtml(t.prize)}` : ""}</span>`;
    });

    const latestPosts = (this.pending || [])
      .filter(r => r.type === "daily_post" && r.status === "approved" && r.caption)
      .slice(0, 2);
    latestPosts.forEach(p => {
      const shortCap = String(p.caption).replace(/\s+/g, " ").trim().slice(0, 90);
      headlines.unshift(`<span class="marquee-headline">📰 <strong>Latest Update:</strong> ${this.escapeHtml(shortCap)}${p.caption.length > 90 ? "…" : ""}</span>`);
    });

    if (headlines.length === 0) return;
    const oneLoop = headlines.map(h => `${h}<span class="marquee-divider">✦</span>`).join("");
    track.innerHTML = oneLoop + oneLoop; // Seamless infinite scroll loop
  }

  getDefaultThirdPartyTournaments() {
    return [
      {
        id: "tp-1",
        title: "Upthrust Esports: The Patriot Cup (BGMI)",
        game: "BGMI",
        organizer: "Upthrust Esports",
        startDate: "2026-11-18",
        endDate: "2026-11-30",
        prize: "₹15,00,000",
        teams: "GodLike, Team SouL, Revenant, Orangutan & Underdogs",
        location: "India (Online)"
      },
      {
        id: "tp-2",
        title: "iQOO Pro Series Season 5 (BGMI)",
        game: "BGMI",
        organizer: "iQOO / NODWIN Gaming",
        startDate: "2026-11-22",
        endDate: "2026-12-10",
        prize: "₹40,00,000",
        teams: "Invited Tier-1 Indian Rosters & Community Qualifiers",
        location: "India (Online + LAN)"
      },
      {
        id: "tp-3",
        title: "Villager Esports Winter Domin8r Series",
        game: "BGMI / Free Fire MAX",
        organizer: "Villager Esports",
        startDate: "2026-11-29",
        endDate: "2026-12-16",
        prize: "₹12,00,000",
        teams: "Top 24 Indian Mobile Contenders",
        location: "India (Online)"
      },
      {
        id: "tp-4",
        title: "Skyesports Souvenir: Mumbai Edition",
        game: "Valorant / Counter-Strike 2",
        organizer: "Skyesports",
        startDate: "2026-12-06",
        endDate: "2026-12-20",
        prize: "$30,000 USD",
        teams: "Indian & South Asian Invited PC Squads",
        location: "Mumbai LAN"
      },
      {
        id: "tp-5",
        title: "NODWIN Gaming: Masters Winter Showdown",
        game: "BGMI / Valorant",
        organizer: "NODWIN Gaming",
        startDate: "2026-12-14",
        endDate: "2027-01-03",
        prize: "₹50,00,000",
        teams: "GodLike Esports, S8UL, Global Esports & Top Clubs",
        location: "Delhi NCR LAN"
      },
      {
        id: "tp-6",
        title: "Snapdragon Pro Series: India Mobile Open",
        game: "BGMI / CODM / Brawl Stars",
        organizer: "ESL & Qualcomm",
        startDate: "2026-12-22",
        endDate: "2027-01-20",
        prize: "₹1,00,00,000",
        teams: "Open Qualifiers + Pro Indian Lineups",
        location: "Pan-India + LAN"
      },
      {
        id: "tp-7",
        title: "The Esports Club (TEC) Challenger Series",
        game: "Valorant",
        organizer: "The Esports Club",
        startDate: "2027-01-12",
        endDate: "2027-02-02",
        prize: "₹15,00,000",
        teams: "South Asia & India Tier-1/Tier-2 Valorant Teams",
        location: "India / South Asia"
      },
      {
        id: "tp-8",
        title: "Lidoma Battlegrounds Invitational 2027",
        game: "BGMI / Free Fire MAX",
        organizer: "Lidoma Esports",
        startDate: "2027-01-25",
        endDate: "2027-02-14",
        prize: "₹20,00,000",
        teams: "Top Indian & Regional Scrims Powerhouses",
        location: "India (Online)"
      },
      {
        id: "tp-9",
        title: "Upthrust Esports: India Rising Series 2027",
        game: "BGMI",
        organizer: "Upthrust Esports",
        startDate: "2027-02-10",
        endDate: "2027-03-01",
        prize: "₹25,00,000",
        teams: "GodLike, S8UL, Entity, TX & Qualifier Teams",
        location: "India (Online + LAN)"
      },
      {
        id: "tp-10",
        title: "Skyesports Grand Slam 2027",
        game: "Counter-Strike 2 / Valorant",
        organizer: "Skyesports",
        startDate: "2027-03-04",
        endDate: "2027-03-18",
        prize: "$50,000 USD",
        teams: "Top Indian & International Invited Squads",
        location: "Pune / Bengaluru LAN"
      }
    ];
  }

  getActiveThirdPartyList() {
    return Array.isArray(this.data?.thirdPartyTournaments) && this.data.thirdPartyTournaments.length > 0
      ? this.data.thirdPartyTournaments
      : this.getDefaultThirdPartyTournaments();
  }

  renderThirdPartyTournaments() {
    const container = document.getElementById("thirdparty-tournaments-list");
    if (!container) return;
    this.renderTournamentCards(container, this.getActiveThirdPartyList(), 25, "No Upcoming 3rd-Party Tournaments Scheduled", true);
  }

  openAddTournamentModal() {
    this.editingTournamentId = null;
    const titleEl = document.getElementById("tournament-modal-title");
    const btnEl = document.getElementById("tourn-modal-submit-btn");
    if (titleEl) titleEl.textContent = this.isAdmin ? "➕ Add 3rd-Party Tournament (Admin)" : "🎮 Submit 3rd-Party Tournament";
    if (btnEl) btnEl.textContent = this.isAdmin ? "💾 Save Tournament Live" : "📩 Submit for Admin Approval";

    ["tourn-title-input", "tourn-game-input", "tourn-org-input", "tourn-start-input", "tourn-end-input", "tourn-prize-input", "tourn-loc-input", "tourn-teams-input"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const updaterEl = document.getElementById("tourn-updater-input");
    if (updaterEl) updaterEl.value = localStorage.getItem("last_updater_name") || (this.isAdmin ? "Pritesh Gehlot" : "");
    this.openModal("tournament-modal");
  }

  openEditTournamentModal(id) {
    const item = this.getActiveThirdPartyList().find(t => t.id === id);
    if (!item) return;
    this.editingTournamentId = id;
    const titleEl = document.getElementById("tournament-modal-title");
    const btnEl = document.getElementById("tourn-modal-submit-btn");
    if (titleEl) titleEl.textContent = this.isAdmin ? `✏️ Edit Tournament (Admin): ${item.title}` : `📝 Suggest Tournament Edit: ${item.title}`;
    if (btnEl) btnEl.textContent = this.isAdmin ? "💾 Save Changes Live" : "📩 Submit Edit for Approval";

    document.getElementById("tourn-title-input").value = item.title || "";
    document.getElementById("tourn-game-input").value  = item.game || "";
    document.getElementById("tourn-org-input").value   = item.organizer || "";
    document.getElementById("tourn-start-input").value = item.startDate || "";
    document.getElementById("tourn-end-input").value   = item.endDate || item.startDate || "";
    document.getElementById("tourn-prize-input").value = item.prize || "";
    document.getElementById("tourn-loc-input").value   = item.location || "";
    document.getElementById("tourn-teams-input").value = item.teams || "";
    document.getElementById("tourn-updater-input").value = item.updatedBy || localStorage.getItem("last_updater_name") || "";
    this.openModal("tournament-modal");
  }

  async handleSaveTournament(e) {
    if (e) e.preventDefault();
    const title     = document.getElementById("tourn-title-input").value.trim();
    const game      = document.getElementById("tourn-game-input").value.trim();
    const organizer = document.getElementById("tourn-org-input").value.trim() || "Community / 3rd Party";
    const startDate = document.getElementById("tourn-start-input").value.trim();
    const endDate   = document.getElementById("tourn-end-input").value.trim() || startDate;
    const prize     = document.getElementById("tourn-prize-input").value.trim() || "TBA";
    const location  = document.getElementById("tourn-loc-input").value.trim() || "India";
    const teams     = document.getElementById("tourn-teams-input").value.trim() || "Indian Squads";
    const updatedBy = document.getElementById("tourn-updater-input").value.trim() || localStorage.getItem("last_updater_name") || "Community Member";

    if (!title || !game || !startDate) {
      alert("Please fill in Tournament Title, Game Title, and Start Date.");
      return;
    }
    localStorage.setItem("last_updater_name", updatedBy);

    const seedList = this.getDefaultThirdPartyTournaments();
    const payloadT = {
      id: this.editingTournamentId || null,
      title, game, organizer, startDate, endDate, prize, location, teams, updatedBy
    };

    if (this.isAdmin) {
      this.closeModal("tournament-modal");
      const ok = await this.cloudOp(
        { op: "saveThirdPartyTournament", tournament: payloadT, seedList },
        this.editingTournamentId ? `✅ Tournament "${title}" updated & sorted by date!` : `✅ Tournament "${title}" added & sorted by date!`
      );
      if (ok) this.renderThirdPartyTournaments();
      return;
    }

    const req = {
      id: "req-" + Date.now(),
      type: "thirdparty_tournament",
      teamKey: "godlike",
      targetId: this.editingTournamentId || null,
      targetName: title,
      submittedBy: updatedBy,
      submittedAt: new Date().toLocaleString(),
      status: "pending",
      seedList,
      data: payloadT
    };

    this.pending.unshift(req);
    this.savePending();
    this.updateAdminUI();
    this.closeModal("tournament-modal");

    try {
      await fetch('/api/requests', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', request: req })
      });
      this.showToast(`📩 Tournament "${title}" sent to Admin for approval!`);
    } catch (err) {
      this.showToast("⚠️ Could not reach server. Please try again.");
    }
  }

  async deleteThirdPartyTournament(id) {
    const item = this.getActiveThirdPartyList().find(t => t.id === id);
    if (!item) return;
    const seedList = this.getDefaultThirdPartyTournaments();

    if (this.isAdmin) {
      if (confirm(`⚠️ Permanently delete tournament "${item.title}"?`)) {
        const ok = await this.cloudOp({ op: "deleteThirdPartyTournament", id, seedList }, `🗑️ Tournament "${item.title}" deleted.`);
        if (ok) this.renderThirdPartyTournaments();
      }
      return;
    }

    const defaultName = localStorage.getItem("last_updater_name") || "Community Member";
    const nameInput = prompt(`🗑️ Request Deletion of "${item.title}"\nEnter your name:`, defaultName);
    if (nameInput === null) return;
    const submittedBy = nameInput.trim() || defaultName;

    const req = {
      id: "req-" + Date.now(),
      type: "delete_thirdparty_tournament",
      teamKey: "godlike",
      targetId: item.id,
      targetName: item.title,
      submittedBy,
      submittedAt: new Date().toLocaleString(),
      status: "pending",
      seedList,
      data: { target: item.title, reason: `Delete requested for "${item.title}"` }
    };
    this.pending.unshift(req);
    this.savePending();
    this.updateAdminUI();
    try {
      await fetch('/api/requests', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', request: req })
      });
      this.showToast(`🗑️ Delete request for "${item.title}" sent to Admin!`);
    } catch (e) {}
  }

  renderTournamentCards(container, list, limit, emptyTitle, editable = false) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 86400000;

    const parseLocal = (iso) => {
      const [y, m, d] = String(iso).split("-").map(Number);
      return new Date(y, (m || 1) - 1, d || 1).getTime();
    };

    const formatRange = (s, e) => {
      const opts = { day: "numeric", month: "short", year: "numeric" };
      const sStr = new Date(parseLocal(s)).toLocaleDateString("en-IN", opts);
      const eStr = new Date(parseLocal(e)).toLocaleDateString("en-IN", opts);
      return `${sStr} – ${eStr}`;
    };

    const items = list
      .filter(t => parseLocal(t.endDate || t.startDate) >= todayStart)
      .sort((a, b) => parseLocal(a.startDate) - parseLocal(b.startDate))
      .slice(0, limit);

    if (items.length === 0) {
      container.innerHTML = `<div class="daily-empty-feed-card"><h3>📅 ${this.escapeHtml(emptyTitle)}</h3><p style="color:#94a3b8;">Check back soon for the next Indian Gaming Community schedule.</p></div>`;
      return;
    }

    container.innerHTML = items.map((t, idx) => {
      const sMs = parseLocal(t.startDate);
      const eMs = parseLocal(t.endDate || t.startDate);
      const daysUntil = Math.round((sMs - todayStart) / dayMs);

      let statusText = "";
      let statusCls = "status-scheduled";
      if (todayStart >= sMs && todayStart <= eMs) {
        statusText = "🔴 LIVE NOW";
        statusCls = "status-live";
      } else if (daysUntil === 0) {
        statusText = "🔥 Starting Today";
        statusCls = "status-soon";
      } else if (daysUntil === 1) {
        statusText = "⚡ Starts Tomorrow";
        statusCls = "status-soon";
      } else {
        statusText = `⏳ Starts in ${daysUntil} days`;
      }

      return `
        <article class="tournament-card">
          <div class="tournament-card-top">
            <div class="tournament-rank-wrap">
              <span class="tournament-rank-badge">#${idx + 1}</span>
              <span class="tournament-game-pill">${this.escapeHtml(t.game)}</span>
              ${t.organizer ? `<span class="tournament-org-pill">${this.escapeHtml(t.organizer)}</span>` : ""}
            </div>
            <span class="tournament-countdown-pill ${statusCls}">${statusText}</span>
          </div>
          <h3 class="tournament-title">${this.escapeHtml(t.title)}</h3>
          <div class="tournament-meta-grid">
            <div class="tournament-meta-item"><span>📅 Schedule</span><strong>${formatRange(t.startDate, t.endDate || t.startDate)}</strong></div>
            <div class="tournament-meta-item"><span>💰 Prize / Stakes</span><strong>${this.escapeHtml(t.prize || "TBA")}</strong></div>
            <div class="tournament-meta-item"><span>📍 Region</span><strong>${this.escapeHtml(t.location || "India")}</strong></div>
            <div class="tournament-meta-item"><span>🛡️ Featured</span><strong>${this.escapeHtml(t.teams || "Indian Pro Clubs")}</strong></div>
          </div>
          ${editable && t.id ? `
          <div class="tournament-card-actions">
            <span class="tournament-updated-by">${t.updatedBy ? `👤 Added/Edited by ${this.escapeHtml(t.updatedBy)}` : "📅 Auto-sorted by Start Date"}</span>
            <div class="row-action-btns">
              <button type="button" class="btn-action-edit" onclick="window.cleanHub.openEditTournamentModal('${this.escapeHtml(t.id)}')">✏️ Edit</button>
              <button type="button" class="btn-action-delete" onclick="window.cleanHub.deleteThirdPartyTournament('${this.escapeHtml(t.id)}')" title="Delete Tournament">🗑️</button>
            </div>
          </div>` : ""}
        </article>
      `;
    }).join("");
  }

  // ── Image preview handling for post upload ──────────────────────────────
  handleImageFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.showToast("⚠️ Image is too large. Please select an image under 5MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDim = 900;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.78);

        this.selectedPostImage = compressedDataUrl;
        const preview = document.getElementById("daily-image-preview");
        const wrap = document.getElementById("daily-image-preview-wrap");
        if (preview && wrap) {
          preview.src = compressedDataUrl;
          wrap.style.display = "block";
        }
        const urlInput = document.getElementById("daily-post-image");
        if (urlInput) urlInput.value = "";
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  handleImageUrlInput(e) {
    const url = e.target.value.trim();
    const preview = document.getElementById("daily-image-preview");
    const wrap = document.getElementById("daily-image-preview-wrap");
    const fileInput = document.getElementById("daily-post-file");

    if (url) {
      this.selectedPostImage = url;
      if (preview && wrap) {
        preview.src = url;
        wrap.style.display = "block";
      }
      if (fileInput) fileInput.value = "";
    } else {
      if (!this.selectedPostImage || this.selectedPostImage.startsWith("http")) {
        this.clearImagePreview();
      }
    }
  }

  clearImagePreview() {
    this.selectedPostImage = "";
    const preview = document.getElementById("daily-image-preview");
    const wrap = document.getElementById("daily-image-preview-wrap");
    const fileInput = document.getElementById("daily-post-file");
    const urlInput = document.getElementById("daily-post-image");
    if (preview) preview.src = "";
    if (wrap) wrap.style.display = "none";
    if (fileInput) fileInput.value = "";
    if (urlInput) urlInput.value = "";
  }

  // ── Handle daily post submission ──────────────────────────────────────────
  async handleDailyPostSubmit(e) {
    e.preventDefault();
    const urlInput = document.getElementById("daily-post-image");
    const imageUrl = this.selectedPostImage || (urlInput ? urlInput.value.trim() : "");
    const caption  = (document.getElementById("daily-post-caption") || {}).value.trim();
    const name     = (document.getElementById("daily-post-name") || {}).value.trim();

    if (!caption || !name) {
      this.showToast("⚠️ Please fill in both the post description and your name.");
      return;
    }

    const submitBtn = document.getElementById("daily-submit-btn");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "⏳ Submitting...";
    }

    const request = {
      id: "dp_" + Date.now(),
      type: "daily_post",
      imageUrl: imageUrl || "",
      caption: caption,
      submittedBy: name,
      submittedAt: new Date().toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      status: "pending"
    };

    // Save locally
    this.pending.unshift(request);
    this.savePending();
    this.updateAdminUI();

    // Sync to cloud Redis API
    try {
      await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", request })
      });
    } catch(err) { /* local fallback will work */ }

    // Reset form
    const form = document.getElementById("daily-post-form");
    if (form) form.reset();
    this.clearImagePreview();

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "📩 Submit Post for Admin Approval";
    }

    this.showToast("📩 Post submitted! An admin will review and approve it.");
    this.renderApprovedPosts();
  }

  // ── Render approved posts: Recent Post Upload at Top ──────────────────────
  async renderApprovedPosts() {
    const container = document.getElementById("daily-posts-feed-container");
    const counter   = document.getElementById("daily-feed-counter");
    if (!container) return;

    // 1. Gather all approved daily_post items from local pending
    let approved = (this.pending || []).filter(r => r.type === "daily_post" && r.status === "approved");

    // 2. Fetch fresh from cloud Redis
    try {
      const res = await fetch("/api/requests");
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.requests)) {
          const map = new Map();
          this.pending.forEach(r => map.set(r.id, r));
          json.requests.forEach(r => map.set(r.id, r));
          this.pending = Array.from(map.values());
          this.savePending();
          this.updateAdminUI();

          approved = this.pending.filter(r => r.type === "daily_post" && r.status === "approved");
        }
      }
    } catch(err) { /* use local */ }

    // 3. Sort newest/recent first by id or timestamp so recent post upload is on TOP
    approved.sort((a, b) => {
      const timeA = a.id && a.id.startsWith("dp_") ? parseInt(a.id.replace("dp_", ""), 10) : 0;
      const timeB = b.id && b.id.startsWith("dp_") ? parseInt(b.id.replace("dp_", ""), 10) : 0;
      return timeB - timeA;
    });

    if (counter) {
      counter.textContent = approved.length > 0 ? `Showing ${approved.length} Post${approved.length > 1 ? "s" : ""}` : "0 Posts";
    }

    if (approved.length === 0) {
      container.innerHTML = `
        <div class="daily-empty-feed-card">
          <div style="font-size:2.5rem; margin-bottom:12px;">📭</div>
          <h3 style="color:#fff; font-size:1.15rem; margin-bottom:6px;">No Daily Posts Published Yet</h3>
          <p style="color:#94a3b8; font-size:0.9rem; line-height:1.5; max-width:480px; margin:0 auto 1.25rem;">
            Use the form above to upload an image and post news! Every post is reviewed & approved by Admin before appearing here.
          </p>
        </div>`;
      return;
    }

    container.innerHTML = approved.map(post => {
      const hasImage = post.imageUrl && post.imageUrl.length > 5;
      const imgHtml = hasImage ? `
        <div class="daily-post-image-box" onclick="window.cleanHub && window.cleanHub.openImageLightbox('${this.escapeHtml(post.imageUrl)}')" title="Click to view full image">
          <img src="${this.escapeHtml(post.imageUrl)}" alt="Daily Update Image" class="daily-post-main-img" loading="lazy" onerror="this.parentElement.style.display='none'" />
          <span class="daily-img-zoom-hint">🔍 View Full</span>
        </div>` : "";

      return `
        <article class="daily-clean-post-card">
          <div class="daily-post-card-header">
            <div class="daily-post-author-pill">
              <span class="daily-post-author-icon">👤</span>
              <span class="daily-post-author-name">${this.escapeHtml(post.submittedBy || "Admin")}</span>
            </div>
            <div class="daily-post-badge-live">
              <span class="daily-check-icon">✓</span> Verified by Admin
            </div>
          </div>

          ${imgHtml}

          <div class="daily-post-card-body">
            <p class="daily-post-text">${this.escapeHtml(post.caption || "")}</p>
          </div>

          <div class="daily-post-card-footer">
            <span class="daily-post-timestamp">🕒 ${this.escapeHtml(post.submittedAt || "Recent")}</span>
            <span class="daily-post-tag">🇮🇳 India EWC Desk</span>
          </div>
        </article>
      `;
    }).join("");
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

    // EWC27 admin-only action buttons (Add Game / Edit Text)
    const ewc27Actions = document.getElementById("ewc27-admin-actions");
    if (ewc27Actions) ewc27Actions.style.display = this.isAdmin ? "flex" : "none";
  }

  // =========================================================================
  // RENDERING ALL CONTENT
  // =========================================================================
  renderAll() {
    this.renderDailyMarquee();
    this.renderEwc27Games();
    this.renderEWC("godlike", "godl-ewc-tbody", "var(--godl-gold)");
    this.renderEWC("s8ul",    "s8ul-ewc-tbody",  "var(--s8ul-blue)");
    this.renderRosters("godlike", "godl-roster-container", "var(--godl-gold)");
    this.renderRosters("s8ul",    "s8ul-roster-container",  "var(--s8ul-blue)");
  }

  // ─── Render EWC27 Games Section (Above Daily Updates) ─────────────────────
  renderEwc27Games() {
    const track = document.getElementById("ewc27-games-track");
    const titleEl = document.getElementById("ewc27-display-title");
    const subEl = document.getElementById("ewc27-display-subtitle");

    const meta = this.data.ewc27Meta || {
      title: "EWC27 Games",
      subtitle: "Every game brings a new battle to the global stage. Keep watch here as we reveal the games that will set the stage for our next chapter."
    };

    if (titleEl) titleEl.textContent = meta.title || "EWC27 Games";
    if (subEl) subEl.textContent = meta.subtitle || "";

    if (!track) return;

    let games = this.data.ewc27Games;
    if (!Array.isArray(games) || games.length === 0) {
      games = (INITIAL_HUB_DATA && INITIAL_HUB_DATA.ewc27Games) ? INITIAL_HUB_DATA.ewc27Games : [];
      this.data.ewc27Games = games;
    }

    track.innerHTML = games.map(g => {
      const isHighlighted = g.isNewlyAdded || g.highlight;
      const highlightClass = isHighlighted ? "ewc27-card-highlighted" : "";
      const badgeHtml = isHighlighted ? `<span class="ewc27-card-badge">⭐ REVEALED</span>` : "";

      return `
        <div class="ewc27-game-card ${highlightClass}">
          ${badgeHtml}
          <div class="ewc27-card-content">
            <h3 class="ewc27-game-name">${this.escapeHtml(g.title)}</h3>
            ${g.sub ? `<span class="ewc27-game-sub">${this.escapeHtml(g.sub)}</span>` : ""}
            ${g.genre ? `<span class="ewc27-game-genre">${this.escapeHtml(g.genre)}</span>` : ""}
          </div>
          ${this.isAdmin ? `<button class="ewc27-card-edit-btn" onclick="window.cleanHub.openEditEwc27GameModal('${g.id}')" title="Edit Game">✏️</button>` : ""}
        </div>
      `;
    }).join("");
  }

  // ─── Roster Toolbar (Stats + Search + Category Filter) ────────────────────
  renderRosterToolbar(teamKey, games, themeColor) {
    const toolbarId = teamKey === "godlike" ? "godl-roster-toolbar" : "s8ul-roster-toolbar";
    const toolbar = document.getElementById(toolbarId);
    if (!toolbar) return;

    const filter = this.rosterFilter[teamKey] || { q: "", cat: "ALL" };
    const totalGames = games.length;
    const flagshipCount = games.filter(g => g.highlight).length;
    const categories = Array.from(new Set(games.map(g => (g.genre || g.category || "").trim()).filter(Boolean)));

    // Preserve search input focus if user is currently typing
    const existingInput = toolbar.querySelector(".roster-search-input");
    const isTyping = existingInput && document.activeElement === existingInput;
    if (isTyping) {
      toolbar.querySelectorAll(".roster-cat-pill").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.cat === filter.cat);
      });
      return;
    }

    toolbar.innerHTML = `
      <div class="roster-stats-strip">
        <div class="roster-stat-chip" style="--team-accent:${themeColor};">
          <strong>${totalGames}</strong>
          <span>Active Titles</span>
        </div>
        <div class="roster-stat-chip" style="--team-accent:${themeColor};">
          <strong>${flagshipCount}</strong>
          <span>⭐ Flagship</span>
        </div>
        <div class="roster-stat-chip" style="--team-accent:${themeColor};">
          <strong>${categories.length}</strong>
          <span>Categories</span>
        </div>
      </div>
      <div class="roster-controls-row">
        <div class="roster-search-wrap">
          <span class="roster-search-icon">🔍</span>
          <input type="text" class="roster-search-input" placeholder="Search game or player IGN..." value="${this.escapeHtml(filter.q)}">
          ${filter.q ? `<button type="button" class="roster-search-clear" title="Clear search">✕</button>` : ""}
        </div>
        <div class="roster-cat-pills">
          <button type="button" class="roster-cat-pill ${filter.cat === "ALL" ? "active" : ""}" data-cat="ALL">All (${totalGames})</button>
          ${categories.map(c => `<button type="button" class="roster-cat-pill ${filter.cat === c ? "active" : ""}" data-cat="${this.escapeHtml(c)}">${this.escapeHtml(c)}</button>`).join("")}
        </div>
      </div>
    `;

    const tbodyId = teamKey === "godlike" ? "godl-ewc-tbody" : "s8ul-ewc-tbody";
    const input = toolbar.querySelector(".roster-search-input");
    if (input) {
      input.addEventListener("input", (e) => {
        this.rosterFilter[teamKey].q = e.target.value;
        this.renderEWC(teamKey, tbodyId, themeColor, true);
      });
    }
    const clearBtn = toolbar.querySelector(".roster-search-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        this.rosterFilter[teamKey].q = "";
        this.renderEWC(teamKey, tbodyId, themeColor);
      });
    }
    toolbar.querySelectorAll(".roster-cat-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        this.rosterFilter[teamKey].cat = btn.dataset.cat;
        this.renderEWC(teamKey, tbodyId, themeColor);
      });
    });
  }

  formatRosterHtml(rosterText, themeColor) {
    const raw = (rosterText || "").trim();
    if (!raw) return `<span class="roster-athletes-highlight" style="--team-accent:${themeColor};">-</span>`;
    const parts = raw.includes("•")
      ? raw.split("•").map(s => s.trim()).filter(Boolean)
      : (raw.includes(",") ? raw.split(",").map(s => s.trim()).filter(Boolean) : [raw]);

    if (parts.length > 1) {
      return `<div class="athlete-chips-wrap" style="--team-accent:${themeColor};">${parts.map(p => `<span class="athlete-chip">${this.escapeHtml(p)}</span>`).join("")}</div>`;
    }
    return `<span class="roster-athletes-highlight" style="--team-accent:${themeColor};">${this.escapeHtml(raw)}</span>`;
  }

  // ─── Render EWC Games Table ───────────────────────────────────────────────
  renderEWC(teamKey, tbodyId, themeColor, skipToolbar = false) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const allGames = this.data[teamKey]?.ewcGames || [];
    if (!skipToolbar) this.renderRosterToolbar(teamKey, allGames, themeColor);

    const filter = this.rosterFilter[teamKey] || { q: "", cat: "ALL" };
    const q = (filter.q || "").trim().toLowerCase();
    const games = allGames.filter(g => {
      const cat = (g.genre || g.category || "").trim();
      if (filter.cat !== "ALL" && cat !== filter.cat) return false;
      if (!q) return true;
      return (g.title || "").toLowerCase().includes(q)
          || (g.roster || "").toLowerCase().includes(q)
          || cat.toLowerCase().includes(q)
          || (g.status || "").toLowerCase().includes(q);
    });

    let html = "";

    games.forEach((g, index) => {
      const updaterName = g.updatedBy || "Pritesh Gehlot";
      html += `
        <tr class="table-row-highlight ${g.highlight ? 'row-spotlight' : ''}">
          <td class="col-num" style="color:${themeColor};" data-label="#">${g.no || index + 1}</td>
          <td class="col-title" data-label="Game">
            <span class="game-title-highlight" style="--team-accent:${themeColor};">${g.highlight ? '<span class="row-star">⭐</span> ' : ''}${this.escapeHtml(g.title)}</span>
          </td>
          <td class="col-category" data-label="Category"><span class="cat-badge">${this.escapeHtml(g.genre || g.category || "")}</span></td>
          <td class="col-roster" data-label="Official Roster / Athletes">
            ${this.formatRosterHtml(g.roster, themeColor)}
          </td>
          <td class="col-status" data-label="Status">
            <span class="status-badge-highlight" style="color:${themeColor}; border-color:${themeColor};">${this.escapeHtml(g.status)}</span>
          </td>
          <td data-label="Edited By" class="col-edited-by">
            <div class="edited-by-cell">
              <span class="updater-pill" title="${g.updatedAt ? `Last edited: ${this.escapeHtml(g.updatedAt)}` : 'Verified updater'}">
                <span class="updater-icon">👤</span>
                <span class="updater-name">${this.escapeHtml(updaterName)}</span>
              </span>
              <div class="row-action-btns">
                <button class="btn-action-edit" onclick="window.cleanHub.openEditGameModal('${teamKey}','${g.id}')" title="Edit this line-up">
                  ✏️ Edit
                </button>
                <button class="btn-action-delete" onclick="window.cleanHub.deleteGame('${teamKey}','${g.id}')" title="${this.isAdmin ? 'Delete Game Live (Admin)' : 'Request Delete Game'}">
                  🗑️
                </button>
              </div>
            </div>
          </td>
        </tr>`;
    });

    if (games.length === 0) {
      html = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">${allGames.length === 0 ? "No EWC games listed yet." : "No matching games or players found."}</td></tr>`;
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
              ${this.isAdmin ? `
                <div class="player-card-admin-bar">
                  <button class="btn-card-edit" title="Edit Player (Admin)" onclick="window.cleanHub.openEditPlayerModal('${teamKey}','${p.id}')">✏️ Edit</button>
                  <button class="btn-card-delete" title="Delete Player (Admin)" onclick="window.cleanHub.deletePlayer('${teamKey}','${p.id}')">🗑️</button>
                </div>` : ""}
              <div class="player-header">
                <span class="player-ign-text">
                  <span class="player-ign-highlight" style="--team-accent:${themeColor};">${this.escapeHtml(p.ign)}</span>
                </span>
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
    if (!this.checkAdminAuth()) return;
    const pData = this.findPlayer(teamKey, playerId);
    if (!pData) return;
    this.editingPlayerId = playerId;
    this.currentModalTeam = teamKey;
    const modal = document.getElementById("player-modal");
    const title = document.getElementById("player-modal-title");
    const submitBtn = document.getElementById("player-modal-submit-btn");

    if (title) title.textContent = `✏️ Edit Player: ${pData.player.ign} (Admin)`;
    if (submitBtn) submitBtn.textContent = "💾 Save & Update Live";

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
      // Direct Admin Update -> applied atomically on the server
      const op = {
        op: "savePlayer",
        teamKey,
        divisionId: divVal,
        player: { id: this.editingPlayerId || null, ign, name, role, stat1Label, stat1Val, stat2Val, desc }
      };
      if (divVal === "__NEW__") {
        const customName = document.getElementById("player-custom-division-input").value.trim();
        if (!customName) { alert("Please enter a lineup name."); return; }
        op.newDivisionName = customName;
      }
      this.closeModal("player-modal");
      this.cloudOp(op, this.editingPlayerId ? `✅ Player "${ign}" updated live!` : `✅ Player "${ign}" added!`);
      return;
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
      try {
        fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', request: req })
        }).catch(() => {});
      } catch (e) {}
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
      this.cloudOp({ op: "deletePlayer", teamKey, id: playerId }, `🗑️ Player "${pData.player.ign}" permanently deleted.`);
    }
  }

  deleteDivision(teamKey, divisionId) {
    if (!this.checkAdminAuth()) return;
    const div = this.data[teamKey]?.divisions.find(d => d.id === divisionId);
    if (!div) return;
    if (confirm(`⚠️ [ADMIN CONFIRMATION]\nAre you sure you want to permanently delete lineup "${div.name}" and all its players?`)) {
      this.cloudOp({ op: "deleteDivision", teamKey, id: divisionId }, `🗑️ Lineup "${div.name}" permanently deleted.`);
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
    const delBtn = document.getElementById("game-modal-delete-btn");
    if (title) title.textContent = "➕ Add EWC Game Title (Admin)";
    if (submitBtn) submitBtn.textContent = "💾 Save EWC Game Live";
    if (delBtn) delBtn.style.display = "none";

    document.getElementById("game-team-select").value = teamKey;
    const count = (this.data[teamKey]?.ewcGames || []).length;
    document.getElementById("game-no-input").value     = count + 1;
    document.getElementById("game-title-input").value  = "";
    document.getElementById("game-genre-input").value  = "";
    document.getElementById("game-roster-input").value = "";
    document.getElementById("game-status-input").value = "EWC 2026 Official Title";
    document.getElementById("game-highlight-check").checked = false;

    const lastUpdater = localStorage.getItem("last_updater_name") || "Pritesh Gehlot";
    const updaterInput = document.getElementById("game-updater-input");
    if (updaterInput) updaterInput.value = lastUpdater;

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
    const delBtn = document.getElementById("game-modal-delete-btn");

    if (title) title.textContent = this.isAdmin ? `✏️ Edit Game (Admin): ${game.title}` : `📝 Suggest Edit: ${game.title}`;
    if (submitBtn) submitBtn.textContent = this.isAdmin ? "💾 Save Changes Live" : "📩 Submit for Admin Approval";
    if (delBtn) {
      delBtn.style.display = "inline-flex";
      delBtn.textContent = this.isAdmin ? "🗑️ Delete Game Live" : "🗑️ Request Delete";
    }

    document.getElementById("game-team-select").value = teamKey;
    document.getElementById("game-no-input").value     = game.no || 1;
    document.getElementById("game-title-input").value  = game.title || "";
    document.getElementById("game-genre-input").value  = game.genre || game.category || "";
    document.getElementById("game-roster-input").value = game.roster || "";
    document.getElementById("game-status-input").value = game.status || "";
    document.getElementById("game-highlight-check").checked = !!game.highlight;

    const updaterInput = document.getElementById("game-updater-input");
    if (updaterInput) {
      updaterInput.value = game.updatedBy || localStorage.getItem("last_updater_name") || "";
      updaterInput.placeholder = "Your name (e.g. Pritesh Gehlot)";
    }

    modal.classList.add("active");
  }

  handleSaveGame() {
    const teamKey   = document.getElementById("game-team-select").value;
    const no        = parseInt(document.getElementById("game-no-input").value) || 1;
    const title     = document.getElementById("game-title-input").value.trim();
    const genre     = document.getElementById("game-genre-input").value.trim();
    const roster    = document.getElementById("game-roster-input").value.trim();
    const status    = document.getElementById("game-status-input").value.trim() || "EWC 2026 Official Title";
    const highlight = document.getElementById("game-highlight-check").checked;

    const updaterInput = document.getElementById("game-updater-input");
    const updatedBy = (updaterInput ? updaterInput.value.trim() : "") || localStorage.getItem("last_updater_name") || (this.isAdmin ? "Admin" : "Community Member");
    if (!updatedBy) { alert("Please enter your name in the 'Edited By' field."); return; }
    localStorage.setItem("last_updater_name", updatedBy);
    const updatedAt = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    if (!title) { alert("Please enter the game title."); return; }

    const isNew = !this.editingGameId;

    if (this.isAdmin) {
      // Applied atomically on the server (no full-database upload)
      const game = { no, title, genre, roster, status, highlight: !!highlight, updatedBy, updatedAt };
      this.closeModal("game-modal");
      if (isNew) {
        this.cloudOp({ op: "addGame", teamKey, game }, `✅ Game "${title}" added to ${teamKey === "godlike" ? "GodLike" : "S8UL"}!`);
      } else {
        this.cloudOp({ op: "updateGame", teamKey, id: this.editingGameId, game }, `✅ Game "${title}" updated live!`);
      }
      return;
    }

    // Normal Visitor proposal -> Admin approval queue
    const origGame = (this.data[this.currentGameTeam]?.ewcGames || []).find(g => g.id === this.editingGameId);
    const req = {
      id: "req-" + Date.now(),
      type: isNew ? "game" : "edit_game",
      teamKey,
      targetId: this.editingGameId || null,
      targetName: origGame ? origGame.title : title,
      submittedBy: updatedBy,
      submittedAt: new Date().toLocaleString(),
      status: "pending",
      originalData: origGame ? { ...origGame } : null,
      data: { no, title, genre, roster, status, highlight, updatedBy, updatedAt }
    };

    // 1. Add to pending queue immediately in local storage
    this.pending.unshift(req);
    this.savePending();
    this.updateAdminUI();

    // 2. Broadcast to Cloud Redis API
    try {
      fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', request: req })
      }).catch(e => console.warn('Cloud sync error:', e));
    } catch(e) {}

    this.showToast(isNew ? `📩 New Game "${title}" sent to Admin for approval!` : `📩 Edit for "${title}" sent to Admin for approval!`);
    this.closeModal("game-modal");
  }

  handleDeleteFromGameModal() {
    if (!this.editingGameId || !this.currentGameTeam) return;
    const teamKey = this.currentGameTeam;
    const gameId = this.editingGameId;
    this.closeModal("game-modal");
    this.deleteGame(teamKey, gameId);
  }

  async deleteGame(teamKey, gameId) {
    const game = (this.data[teamKey]?.ewcGames || []).find(g => g.id === gameId);
    if (!game) return;

    if (this.isAdmin) {
      if (confirm(`⚠️ [ADMIN CONFIRMATION]\nAre you sure you want to permanently delete "${game.title}"?`)) {
        await this.cloudOp({ op: "deleteGame", teamKey, id: gameId }, `🗑️ Game "${game.title}" permanently deleted.`);
      }
      return;
    }

    // Visitor / non-admin -> send a Delete Game Request directly to the Admin Portal (/admin)
    const defaultName = localStorage.getItem("last_updater_name") || "Pritesh Gehlot";
    const nameInput = prompt(`🗑️ Request Deletion of "${game.title}"\n\nEnter your name to send this delete request to the Admin Portal:`, defaultName);
    if (nameInput === null) return; // cancelled
    const submittedBy = nameInput.trim() || defaultName;
    localStorage.setItem("last_updater_name", submittedBy);

    const req = {
      id: "req-" + Date.now(),
      type: "delete_game",
      teamKey,
      targetId: game.id,
      targetName: game.title,
      submittedBy,
      submittedAt: new Date().toLocaleString(),
      status: "pending",
      data: {
        target: game.title,
        reason: `Delete requested for "${game.title}" (Roster: ${game.roster || "-"})`,
        targetType: "game"
      }
    };

    this.pending.unshift(req);
    this.savePending();
    this.updateAdminUI();

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', request: req })
      });
      if (!res.ok) throw new Error('Request failed');
      this.showToast(`🗑️ Delete request for "${game.title}" sent to Admin Portal!`);
    } catch (e) {
      alert("⚠️ Could not send delete request to server. Please check connection and try again.");
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
    document.getElementById("req-delete-fields").style.display  = "none";
    ["req-ign","req-realname","req-role","req-game","req-desc","req-game-title","req-game-genre","req-game-roster","req-delete-target","req-delete-reason"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    document.getElementById("req-name-input").value = "";
    modal.classList.add("active");

    document.getElementById("request-type-select").onchange = function() {
      const isPlayer = this.value === "player";
      const isGame = this.value === "game";
      const isDelete = this.value === "delete_player" || this.value === "delete_lineup" || this.value === "delete_game";
      document.getElementById("req-player-fields").style.display = isPlayer ? "block" : "none";
      document.getElementById("req-game-fields").style.display   = isGame ? "block" : "none";
      document.getElementById("req-delete-fields").style.display = isDelete ? "block" : "none";
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
    } else if (type === "game") {
      const title  = document.getElementById("req-game-title").value.trim();
      const genre  = document.getElementById("req-game-genre").value.trim();
      const roster = document.getElementById("req-game-roster").value.trim();
      if (!title) { alert("Please enter the game title."); return; }
      reqData = { title, genre, roster };
    } else {
      const target = document.getElementById("req-delete-target").value.trim();
      const reason = document.getElementById("req-delete-reason").value.trim();
      if (!target) { alert("Please enter the player, lineup, or game title to delete."); return; }
      reqData = {
        target,
        reason,
        targetType: type === "delete_player" ? "player" : (type === "delete_lineup" ? "lineup" : "game")
      };
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

    try {
      fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', request })
      }).catch(() => {});
    } catch (e) {}
  }

  // =========================================================================
  // EWC27 GAMES & INTRO TEXT MODALS & SUBMISSIONS
  // =========================================================================
  openAddEwc27GameModal() {
    this.editingEwc27GameId = null;
    const titleModal = document.getElementById("ewc27-game-modal-title");
    if (titleModal) titleModal.textContent = "🎮 Add EWC27 Game";
    const titleInput = document.getElementById("ewc27-modal-game-title");
    const genreInput = document.getElementById("ewc27-modal-game-genre");
    const subInput = document.getElementById("ewc27-modal-game-sub");
    const notesInput = document.getElementById("ewc27-modal-game-notes");
    if (titleInput) titleInput.value = "";
    if (genreInput) genreInput.value = "";
    if (subInput) subInput.value = "";
    if (notesInput) notesInput.value = "";
    this.openModal("ewc27-game-modal");
  }

  openEditEwc27GameModal(gameId) {
    this.editingEwc27GameId = gameId;
    const game = (this.data.ewc27Games || []).find(g => g.id === gameId);
    const titleModal = document.getElementById("ewc27-game-modal-title");
    if (titleModal) titleModal.textContent = `✏️ Edit EWC27 Game: ${game ? game.title : "Game"}`;
    const titleInput = document.getElementById("ewc27-modal-game-title");
    const genreInput = document.getElementById("ewc27-modal-game-genre");
    const subInput = document.getElementById("ewc27-modal-game-sub");
    const notesInput = document.getElementById("ewc27-modal-game-notes");
    if (titleInput) titleInput.value = game ? game.title : "";
    if (genreInput) genreInput.value = game ? (game.genre || "") : "";
    if (subInput) subInput.value = game ? (game.sub || "") : "";
    if (notesInput) notesInput.value = "";
    this.openModal("ewc27-game-modal");
  }

  openEditEwc27TextModal() {
    const meta = this.data.ewc27Meta || {
      title: "EWC27 Games",
      subtitle: "Every game brings a new battle to the global stage. Keep watch here as we reveal the games that will set the stage for our next chapter."
    };
    const titleInput = document.getElementById("ewc27-modal-text-title");
    const subInput = document.getElementById("ewc27-modal-text-sub");
    if (titleInput) titleInput.value = meta.title || "EWC27 Games";
    if (subInput) subInput.value = meta.subtitle || "";
    this.openModal("ewc27-text-modal");
  }

  async handleEwc27GameSubmit(e) {
    e.preventDefault();
    if (!this.isAdmin) {
      this.showToast("⚠️ Admin access required to manage EWC27 games.");
      return;
    }

    const titleEl = document.getElementById("ewc27-modal-game-title");
    const genreEl = document.getElementById("ewc27-modal-game-genre");
    const subEl   = document.getElementById("ewc27-modal-game-sub");
    const title = titleEl ? titleEl.value.trim() : "";
    const genre = genreEl ? genreEl.value.trim() : "";
    const sub   = subEl ? subEl.value.trim() : "";

    if (!title) {
      this.showToast("⚠️ Please enter a Game Title.");
      return;
    }

    this.closeModal("ewc27-game-modal");
    await this.cloudOp({
      op: "saveEwc27Game",
      game: { id: this.editingEwc27GameId || null, title, genre, sub, isNewlyAdded: true }
    }, `✅ EWC27 Game "${title}" saved and live!`);
  }

  async handleEwc27TextSubmit(e) {
    e.preventDefault();
    if (!this.isAdmin) {
      this.showToast("⚠️ Admin access required to edit EWC27 text.");
      return;
    }

    const titleEl = document.getElementById("ewc27-modal-text-title");
    const subEl   = document.getElementById("ewc27-modal-text-sub");
    const title    = titleEl ? titleEl.value.trim() : "EWC27 Games";
    const subtitle = subEl ? subEl.value.trim() : "";

    this.closeModal("ewc27-text-modal");
    await this.cloudOp({
      op: "setEwc27Meta",
      meta: { title, subtitle }
    }, "✅ EWC27 header text updated live!");
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

      if (req.type === "ewc27_game") {
        typeLabel = "🎮 EWC27 Game Suggestion";
        details = `
          <div class="approval-detail"><strong>Proposed Game:</strong> <span style="font-size:1.1rem;font-weight:800;color:#fff;">${this.escapeHtml(req.data.title)}</span></div>
          <div class="approval-detail"><strong>Genre:</strong> ${this.escapeHtml(req.data.genre || "-")}</div>
          <div class="approval-detail"><strong>Publisher / Sub:</strong> ${this.escapeHtml(req.data.sub || "-")}</div>
          <div class="approval-detail"><strong>Notes:</strong> ${this.escapeHtml(req.data.notes || "-")}</div>
        `;
      } else if (req.type === "ewc27_text") {
        typeLabel = "✏️ EWC27 Text Edit";
        details = `
          <div class="approval-detail"><strong>Proposed Title:</strong> ${this.escapeHtml(req.data.title)}</div>
          <div class="approval-detail"><strong>Proposed Subtitle:</strong> ${this.escapeHtml(req.data.subtitle)}</div>
        `;
      } else if (req.type === "edit_player") {
        typeLabel = "✏️ Proposed Player Edit";
        details = `
          <div class="approval-detail"><strong>Target Player:</strong> ${this.escapeHtml(req.targetName || req.data.ign)}</div>
          <div class="approval-detail"><strong>Proposed IGN:</strong> ${this.escapeHtml(req.data.ign)}</div>
          <div class="approval-detail"><strong>Proposed Role:</strong> ${this.escapeHtml(req.data.role)}</div>
          <div class="approval-detail"><strong>Proposed Name:</strong> ${this.escapeHtml(req.data.name || "-")}</div>
          <div class="approval-detail"><strong>Proposed Stats:</strong> ${this.escapeHtml(req.data.stat1Label)}: ${this.escapeHtml(req.data.stat1Val)}</div>
          <div class="approval-detail"><strong>Notes / Bio:</strong> ${this.escapeHtml(req.data.desc || "-")}</div>
        `;
      } else if (req.type === "delete_player") {
        typeLabel = "🗑️ Delete Player Request";
        details = `
          <div class="approval-detail"><strong>Target Player:</strong> ${this.escapeHtml(req.data.target || "-")}</div>
          <div class="approval-detail"><strong>Reason:</strong> ${this.escapeHtml(req.data.reason || "-")}</div>
        `;
      } else if (req.type === "delete_lineup") {
        typeLabel = "🗑️ Delete Lineup Request";
        details = `
          <div class="approval-detail"><strong>Target Lineup:</strong> ${this.escapeHtml(req.data.target || "-")}</div>
          <div class="approval-detail"><strong>Reason:</strong> ${this.escapeHtml(req.data.reason || "-")}</div>
        `;
      } else if (req.type === "thirdparty_tournament") {
        typeLabel = "🎮 3rd-Party Tournament";
        details = `
          <div class="approval-detail"><strong>Tournament:</strong> ${this.escapeHtml(req.data.title || "-")}</div>
          <div class="approval-detail"><strong>Game / Organizer:</strong> ${this.escapeHtml(req.data.game || "-")} · ${this.escapeHtml(req.data.organizer || "-")}</div>
          <div class="approval-detail"><strong>Dates:</strong> ${this.escapeHtml(req.data.startDate || "-")} → ${this.escapeHtml(req.data.endDate || "-")}</div>
          <div class="approval-detail"><strong>Prize / Region:</strong> ${this.escapeHtml(req.data.prize || "TBA")} · ${this.escapeHtml(req.data.location || "India")}</div>
        `;
      } else if (req.type === "delete_thirdparty_tournament") {
        typeLabel = "🗑️ Delete 3rd-Party Tournament";
        details = `
          <div class="approval-detail"><strong>Target Tournament:</strong> ${this.escapeHtml(req.data.target || req.targetName || "-")}</div>
          <div class="approval-detail"><strong>Reason:</strong> ${this.escapeHtml(req.data.reason || "-")}</div>
        `;
      } else if (req.type === "delete_game") {
        typeLabel = "🗑️ Delete Game Request";
        details = `
          <div class="approval-detail"><strong>Target Game:</strong> ${this.escapeHtml(req.data.target || "-")}</div>
          <div class="approval-detail"><strong>Reason:</strong> ${this.escapeHtml(req.data.reason || "-")}</div>
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
            ${req.type.startsWith("delete_") ? `
              <button class="btn-approve btn-approve-delete" style="background:#dc2626; border-color:#ef4444; color:#fff; font-weight:800;" onclick="window.cleanHub.approveRequest('${req.id}')">🗑️ Accept Deletion Live</button>` : `
              <button class="btn-approve" onclick="window.cleanHub.approveRequest('${req.id}')">✅ Accept & Reflect Live</button>`}
            <button class="btn-reject"  onclick="window.cleanHub.rejectRequest('${req.id}')">❌ Reject</button>
            <button class="btn-delete-req" onclick="window.cleanHub.deleteRequest('${req.id}')">🗑️ Delete Request</button>
          </div>
        </div>`;
    }).join("");
  }

  // ─── Approve / Accept Request (APPLIED ATOMICALLY ON SERVER) ───────────────
  async approveRequest(reqId) {
    if (!this.checkAdminAuth()) return;
    const req = this.pending.find(r => r.id === reqId);
    if (!req) return;

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', id: req.id })
      });
      const json = await res.json().catch(() => ({}));
      if (json.data) this.applyServerData(json.data);
      if (Array.isArray(json.requests)) {
        this.pending = json.requests;
        this.savePending();
      }
      if (!res.ok || !json.ok) {
        alert("⚠️ " + (json.error || "Could not approve request."));
        await this.syncCloudPending();
        this.renderApprovals();
        this.updateAdminUI();
        return;
      }
      this.renderApprovals();
      this.updateAdminUI();
      this.showToast(`✅ ${json.message || 'Approved & reflected live!'}`);
    } catch (e) {
      alert("⚠️ Network error while approving request. Please try again.");
    }
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
      try {
        fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject', id: reqId })
        }).catch(() => {});
      } catch(e) {}
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
      try {
        fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', id: reqId })
        }).catch(() => {});
      } catch(e) {}
      this.showToast("🗑️ Request permanently deleted.");
    }
  }

  // =========================================================================
  // UTILITIES
  // =========================================================================
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("active");
  }

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
