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
    this.adminPin      = "Iorikof@11";
    this.isAdmin       = false;     // Default to standard visitor mode

    this.homeScreen         = document.getElementById("home-screen");
    this.godlikeScreen      = document.getElementById("screen-godlike");
    this.s8ulScreen         = document.getElementById("screen-s8ul");
    this.enc27Screen        = document.getElementById("screen-enc27");
    this.dailyUpdatesScreen = document.getElementById("screen-daily-updates");
    this.clubUpcomingScreen = document.getElementById("screen-club-upcoming");
    this.cardGodlike        = document.getElementById("card-godlike-select");
    this.cardS8ul           = document.getElementById("card-s8ul-select");
    this.dailyUpdates       = (typeof INITIAL_DAILY_UPDATES !== "undefined") ? INITIAL_DAILY_UPDATES : (INITIAL_HUB_DATA.dailyUpdates || []);
    this.currentDailyFilter = "all";
    this.dailyTabFilters    = {
      updates:     { q: "", game: "ALL" },
      tournaments: { q: "", game: "ALL" },
      thirdparty:  { q: "", game: "ALL" }
    };
    this.cachedApprovedPosts = [];
    this.rosterFilter       = { godlike: { q: "", cat: "ALL" }, s8ul: { q: "", cat: "ALL" } };
    this.enc27Filter        = { q: "", cat: "ALL" };

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
    this.initVisitorTracker();
    this.startAutoLiveSync();

    // Check deep link hash
    if (window.location.hash === "#daily-updates") {
      this.showDailyUpdates();
    } else if (window.location.hash === "#enc27") {
      this.showEnc27();
    }
    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#daily-updates") {
        this.showDailyUpdates();
      } else if (window.location.hash === "#enc27") {
        this.showEnc27();
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

  initVisitorTracker() {
    let sid = sessionStorage.getItem("igc_visitor_sid");
    if (!sid) {
      sid = "v-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem("igc_visitor_sid", sid);
    }

    const ping = async (isHit) => {
      try {
        const res = await fetch("/api/analytics", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid, hit: isHit ? 1 : 0 })
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!json.ok) return;
        const fmt = (n) => Number(n || 0).toLocaleString("en-IN");
        const activeEl = document.getElementById("stat-active-now");
        const dailyEl  = document.getElementById("stat-daily-views");
        const totalEl  = document.getElementById("stat-total-views");
        const ytEl     = document.getElementById("stat-yt-subs");
        const kickEl   = document.getElementById("stat-kick-followers");
        const igEl     = document.getElementById("stat-ig-followers");
        const updateVal = (el, nextVal, flashOnChange = false) => {
          if (!el || nextVal === undefined || nextVal === null) return;
          const str = String(nextVal);
          if (flashOnChange && el.textContent && el.textContent !== "—" && el.textContent !== str) {
            const pill = el.closest(".visitor-stat-pill");
            if (pill) {
              pill.classList.remove("stat-updated-flash");
              void pill.offsetWidth;
              pill.classList.add("stat-updated-flash");
            }
          }
          el.textContent = str;
        };
        updateVal(activeEl, fmt(json.activeNow));
        updateVal(dailyEl, fmt(json.dailyViews));
        updateVal(totalEl, fmt(json.totalViews));
        if (json.ytSubs)        updateVal(ytEl, json.ytSubs, true);
        if (json.kickFollowers) updateVal(kickEl, json.kickFollowers, true);
        if (json.igFollowers)   updateVal(igEl, json.igFollowers, true);
        if (json.myVote)        localStorage.setItem("igc_fan_poll_vote", json.myVote);
        if (json.poll)          this.renderFanPoll(json.poll);
      } catch (e) {}
    };

    ping(true);
    this._visitorHeartbeat = setInterval(() => {
      if (!document.hidden) ping(false);
    }, 10000);
  }

  renderFanPoll(poll) {
    if (!poll) return;
    const s8 = Math.max(0, Number(poll.s8ul) || 0);
    const gl = Math.max(0, Number(poll.godlike) || 0);
    const total = s8 + gl;
    const s8Pct = total > 0 ? Math.round((s8 / total) * 100) : 50;
    const glPct = total > 0 ? (100 - s8Pct) : 50;

    const s8CountEl = document.getElementById("poll-s8ul-count");
    const glCountEl = document.getElementById("poll-godl-count");
    const s8PctEl   = document.getElementById("poll-s8ul-pct");
    const glPctEl   = document.getElementById("poll-godl-pct");
    const totalEl   = document.getElementById("poll-total-votes");
    const s8Bar     = document.getElementById("poll-bar-s8ul");
    const glBar     = document.getElementById("poll-bar-godl");
    const s8BarLbl  = document.getElementById("poll-bar-s8ul-label");
    const glBarLbl  = document.getElementById("poll-bar-godl-label");
    const leaderEl  = document.getElementById("poll-leader-badge");
    const needle    = document.getElementById("poll-needle");

    if (s8CountEl) s8CountEl.textContent = s8.toLocaleString("en-IN");
    if (glCountEl) glCountEl.textContent = gl.toLocaleString("en-IN");
    if (s8PctEl)   s8PctEl.textContent   = `${s8Pct}%`;
    if (glPctEl)   glPctEl.textContent   = `${glPct}%`;
    if (totalEl)   totalEl.textContent   = `${total.toLocaleString("en-IN")} Total Vote${total === 1 ? "" : "s"}`;
    if (s8Bar)     s8Bar.style.width     = `${s8Pct}%`;
    if (glBar)     glBar.style.width     = `${glPct}%`;
    if (s8BarLbl)  s8BarLbl.textContent  = s8Pct >= 18 ? `S8UL ${s8Pct}%` : "";
    if (glBarLbl)  glBarLbl.textContent  = glPct >= 18 ? `GodLike ${glPct}%` : "";
    if (needle)    needle.style.left     = `${s8Pct}%`;

    if (s8Bar && glBar && leaderEl) {
      s8Bar.classList.toggle("is-winning", s8 > gl);
      glBar.classList.toggle("is-winning", gl > s8);
      leaderEl.classList.remove("lead-s8ul", "lead-godl");
      if (needle) needle.classList.remove("lead-s8ul", "lead-godl");

      if (s8 > gl) {
        leaderEl.classList.add("lead-s8ul");
        leaderEl.textContent = `💙 S8UL Winning (${s8Pct}%)`;
        if (needle) { needle.classList.add("lead-s8ul"); needle.textContent = "💙"; }
      } else if (gl > s8) {
        leaderEl.classList.add("lead-godl");
        leaderEl.textContent = `💛 GodLike Winning (${glPct}%)`;
        if (needle) { needle.classList.add("lead-godl"); needle.textContent = "💛"; }
      } else {
        leaderEl.textContent = total > 0 ? `⚡ Tied (${s8Pct}% – ${glPct}%)` : "⚡ Vote Now — 50% / 50%";
        if (needle) needle.textContent = "⚡";
      }
    }

    const myVote = localStorage.getItem("igc_fan_poll_vote");
    const btnS8 = document.getElementById("btn-vote-s8ul");
    const btnGl = document.getElementById("btn-vote-godl");
    if (btnS8) {
      btnS8.classList.toggle("voted", myVote === "s8ul");
      btnS8.textContent = myVote === "s8ul" ? "💙 ✓ Supporting S8UL" : "💙 Support S8UL";
    }
    if (btnGl) {
      btnGl.classList.toggle("voted", myVote === "godlike");
      btnGl.textContent = myVote === "godlike" ? "💛 ✓ Supporting GodLike" : "💛 Support GodLike";
    }
  }

  async voteFanPoll(team) {
    const prevTeam = localStorage.getItem("igc_fan_poll_vote");
    if (prevTeam === team) {
      this.showToast(`🔥 You are already supporting ${team === "s8ul" ? "S8UL" : "GodLike"}!`);
      return;
    }
    localStorage.setItem("igc_fan_poll_vote", team);
    try {
      const res = await fetch("/api/analytics", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "vote", team, prevTeam })
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok && json.poll) {
        if (json.myVote) localStorage.setItem("igc_fan_poll_vote", json.myVote);
        this.renderFanPoll(json.poll);
        this.showToast(
          json.alreadyVoted
            ? `ℹ️ Your unique vote is already recorded for ${team === "s8ul" ? "S8UL Esports" : "GodLike Esports"}!`
            : `🔥 Vote counted for ${team === "s8ul" ? "S8UL Esports" : "GodLike Esports"}!`
        );
      }
    } catch (e) {
      this.showToast("⚠️ Could not save vote. Please try again.");
    }
  }

  startAutoLiveSync() {
    this._liveDataSync = setInterval(() => {
      if (document.hidden) return;
      // Avoid interrupting while user is typing in a search box or editing a modal
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || document.querySelector(".modal-overlay.active")) return;
      this.syncCloudData();
      this.syncCloudPending();
      if (this.dailyUpdatesScreen?.classList.contains("active")) {
        this.renderApprovedPosts();
      }
    }, 10000);
  }

  requestFingerprint(r) {
    const norm = (v) => String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
    const d = r && r.data && typeof r.data === "object" ? { ...r.data } : {};
    delete d.updatedAt;
    delete d.submittedAt;
    const sortedData = Object.keys(d).sort().reduce((acc, k) => {
      acc[k] = typeof d[k] === "string" ? norm(d[k]) : d[k];
      return acc;
    }, {});
    return JSON.stringify({
      type: norm(r && r.type),
      teamKey: norm(r && r.teamKey),
      targetId: norm(r && r.targetId),
      targetName: norm(r && r.targetName),
      caption: norm(r && r.caption),
      imageUrl: String((r && r.imageUrl) || "").trim(),
      data: sortedData
    });
  }

  async submitPendingRequest(req, successMsg) {
    if (this._reqInFlight) return false;
    const fp = this.requestFingerprint(req);
    const localDup = (this.pending || []).some(r => r.id === req.id || (r.status === "pending" && this.requestFingerprint(r) === fp));
    if (localDup) {
      this.showToast("ℹ️ This request is already pending Admin review.");
      return false;
    }

    this._reqInFlight = true;
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", request: req })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        this.showToast("⚠️ " + (json.error || "Could not submit request. Please try again."));
        return false;
      }
      if (json.duplicate) {
        this.showToast("ℹ️ This request is already pending Admin review.");
        return false;
      }
      this.pending.unshift(req);
      this.savePending();
      this.updateAdminUI();
      if (successMsg) this.showToast(successMsg);
      return true;
    } catch (e) {
      this.showToast("⚠️ Could not reach server. Please try again.");
      return false;
    } finally {
      this._reqInFlight = false;
    }
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
    if (this.enc27Screen) this.enc27Screen.classList.remove("active");
    if (this.dailyUpdatesScreen) this.dailyUpdatesScreen.classList.remove("active");
    if (this.clubUpcomingScreen) this.clubUpcomingScreen.classList.remove("active");
    this.homeScreen.style.display = "flex";
    if (window.location.hash === "#daily-updates" || window.location.hash === "#enc27") {
      try { history.replaceState(null, null, " "); } catch(e) {}
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showGodlike() {
    this.homeScreen.style.display = "none";
    this.s8ulScreen.classList.remove("active");
    if (this.enc27Screen) this.enc27Screen.classList.remove("active");
    if (this.dailyUpdatesScreen) this.dailyUpdatesScreen.classList.remove("active");
    if (this.clubUpcomingScreen) this.clubUpcomingScreen.classList.remove("active");
    this.godlikeScreen.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showS8ul() {
    this.homeScreen.style.display = "none";
    this.godlikeScreen.classList.remove("active");
    if (this.enc27Screen) this.enc27Screen.classList.remove("active");
    if (this.dailyUpdatesScreen) this.dailyUpdatesScreen.classList.remove("active");
    if (this.clubUpcomingScreen) this.clubUpcomingScreen.classList.remove("active");
    this.s8ulScreen.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showEnc27() {
    this.homeScreen.style.display = "none";
    this.godlikeScreen.classList.remove("active");
    this.s8ulScreen.classList.remove("active");
    if (this.dailyUpdatesScreen) this.dailyUpdatesScreen.classList.remove("active");
    if (this.clubUpcomingScreen) this.clubUpcomingScreen.classList.remove("active");
    if (this.enc27Screen) this.enc27Screen.classList.add("active");
    this.renderEnc27Rosters();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showDailyUpdates(initialTab = null) {
    this.homeScreen.style.display = "none";
    this.godlikeScreen.classList.remove("active");
    this.s8ulScreen.classList.remove("active");
    if (this.enc27Screen) this.enc27Screen.classList.remove("active");
    if (this.clubUpcomingScreen) this.clubUpcomingScreen.classList.remove("active");
    if (this.dailyUpdatesScreen) this.dailyUpdatesScreen.classList.add("active");
    
    const dateEl = document.getElementById("daily-live-date-text");
    if (dateEl) {
      const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      dateEl.textContent = `${today} · LIVE DESK`;
    }

    if (initialTab) {
      this.switchDailyTab(initialTab);
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
        title: "Chennai Esports Global Championship (CEGC) 2026",
        game: "BGMI",
        organizer: "Skyesports & SDAT",
        startDate: "2026-11-03",
        endDate: "2026-12-13",
        time: "Grand Finals: 11–13 Dec (IST)",
        prize: "₹75,00,000 INR",
        teams: "Top Indian & Global Contenders",
        location: "Chennai, India",
        liquipediaUrl: "https://liquipedia.net/pubgmobile/Chennai_Esports_Global_Championship/2026"
      },
      {
        title: "FFWS Global Finals 2026",
        game: "Free Fire",
        organizer: "Garena (S-Tier)",
        startDate: "2026-11-06",
        endDate: "2026-11-28",
        time: "Last Chance: Nov 27, 15:45 IST · Finals: Nov 28, 15:30 IST",
        prize: "$1,200,000 USD",
        teams: "24 Teams · Team Apex Gaming (TAG) & Team Resurrection (Reg)",
        location: "Bangkok, Thailand",
        liquipediaUrl: "https://liquipedia.net/freefire/Free_Fire_World_Series/2026"
      },
      {
        title: "PUBG India Challenge 2026",
        game: "PUBG (PC)",
        organizer: "KRAFTON & Tesseract (A-Tier)",
        startDate: "2026-11-11",
        endDate: "2026-11-29",
        time: "18:30 IST (Matchdays)",
        prize: "₹25,00,000 INR",
        teams: "32 Indian Squads",
        location: "India (Online)",
        liquipediaUrl: "https://liquipedia.net/pubg/PUBG_India_Challenge/2026"
      },
      {
        title: "PUBG Mobile Global Championship (PMGC) 2026",
        game: "PUBG Mobile",
        organizer: "KRAFTON & Level Infinite (S-Tier)",
        startDate: "2026-11-26",
        endDate: "2026-12-13",
        time: "17:00 IST (12:00 UTC · 15:00 TRT)",
        prize: "$3,000,000 USD",
        teams: "39 Teams · Team SouL (India)",
        location: "İstanbul, Türkiye",
        liquipediaUrl: "https://liquipedia.net/pubgmobile/PUBG_Mobile_Global_Championship/2026"
      },
      {
        title: "Delta Force Invitational 2026",
        game: "Delta Force",
        organizer: "Team Jade & TiMi (S-Tier)",
        startDate: "2026-11-27",
        endDate: "2026-11-29",
        time: "16:30 IST (11:00 UTC · 12:00 CET)",
        prize: "$500,000 USD",
        teams: "12 Global Teams (Operations PC)",
        location: "Stockholm, Sweden",
        liquipediaUrl: "https://liquipedia.net/deltaforce/Delta_Force_Invitational/2026"
      },
      {
        title: "JioBLAST Gully Wars 2026 (Grand Finals)",
        game: "BGMI",
        organizer: "JioBLAST & KRAFTON (B-Tier)",
        startDate: "2026-11-27",
        endDate: "2026-11-29",
        time: "27–29 Nov (IST)",
        prize: "₹10,00,000 INR",
        teams: "16 Grand Finals Indian Squads",
        location: "India (Online)",
        liquipediaUrl: "https://liquipedia.net/pubgmobile/JioBLAST_Gully_Wars/2026"
      },
      {
        title: "FC Pro 27 Open",
        game: "EA SPORTS FC 27",
        organizer: "EA (S-Tier)",
        startDate: "2026-11-30",
        endDate: "2027-01-25",
        time: "Group Stage & Finals (UTC / CET)",
        prize: "$533,000 USD",
        teams: "24 Players (4 Groups of 6)",
        location: "Europe (Offline)",
        liquipediaUrl: "https://liquipedia.net/easportsfc/FC_Pro/27/Open"
      },
      {
        title: "Call of Duty: Mobile World Championship 2026",
        game: "COD Mobile",
        organizer: "Activision (S-Tier)",
        startDate: "2026-12-04",
        endDate: "2026-12-06",
        time: "4–6 Dec (CST / UTC)",
        prize: "$500,000 USD",
        teams: "16 Teams · GodLike Esports (India)",
        location: "Mexico City, Mexico",
        liquipediaUrl: "https://liquipedia.net/callofduty/Call_of_Duty_Mobile_World_Championship/2026"
      },
      {
        title: "Honor of Kings International Championship (KIC) 2026",
        game: "Honor of Kings",
        organizer: "Level Infinite (S-Tier)",
        startDate: "2026-12-26",
        endDate: "2027-01-10",
        time: "26 Dec – 10 Jan (WIB / UTC)",
        prize: "TBD (India Qualifier: ₹5,00,000 INR)",
        teams: "16 Global Teams (incl. India Qualifier)",
        location: "Jakarta, Indonesia",
        liquipediaUrl: "https://liquipedia.net/honorofkings/Honor_of_Kings_International_Championship/2026"
      },
      {
        title: "VCT 2027: Pacific Kickoff",
        game: "Valorant",
        organizer: "Riot Games (S-Tier)",
        startDate: "2027-01-11",
        endDate: "2027-01-31",
        time: "11–31 Jan (KST / IST)",
        prize: "Masters Qualification",
        teams: "VCT Pacific Teams · Global Esports (India)",
        location: "Seoul, South Korea",
        liquipediaUrl: "https://liquipedia.net/valorant/VCT/2027/Pacific/Kickoff"
      },
      {
        title: "Esports World Cup 2027 (EWC 2027)",
        game: "Multi-Title",
        organizer: "EWCF & ESL FACEIT (S-Tier)",
        startDate: "2027-07-20",
        endDate: "2027-08-01",
        time: "20 Jul – 1 Aug (AST / IST)",
        prize: "Club & Title Pools (CS2: $2,000,000 USD)",
        teams: "Global Partner Clubs (S8UL, GodLike & Qualifiers)",
        location: "Riyadh, Saudi Arabia",
        liquipediaUrl: "https://liquipedia.net/"
      }
    ].map((t, i) => ({ id: "maj-" + (i + 1), ...t }));
  }

  getClubUpcomingTournaments(clubKey) {
    const clubs = {
      s8ul: [
        {
          title: "PUBG India Challenge 2026 — Grand Finals",
          game: "PUBG (PC)",
          organizer: "KRAFTON & Tesseract (A-Tier)",
          startDate: "2026-11-11",
          endDate: "2026-11-29",
          time: "18:30 IST (Grand Finals: Nov 28–29)",
          prize: "₹25,00,000 INR",
          teams: "S8UL Esports (Qualified · 10 Bonus Pts)",
          location: "India (Online)",
          liquipediaUrl: "https://liquipedia.net/pubg/S8UL_Esports"
        },
        {
          title: "PUBG Mobile Global Championship (PMGC) 2026",
          game: "PUBG Mobile",
          organizer: "KRAFTON & Level Infinite (S-Tier)",
          startDate: "2026-11-26",
          endDate: "2026-12-13",
          time: "17:00 IST (12:00 UTC · 15:00 TRT)",
          prize: "$3,000,000 USD",
          teams: "Team SouL (The Gauntlet Invite)",
          location: "İstanbul, Türkiye",
          liquipediaUrl: "https://liquipedia.net/pubgmobile/PUBG_Mobile_Global_Championship/2026"
        },
        {
          title: "Google Play Arena 2026 — Free Fire",
          game: "Free Fire",
          organizer: "Google Play / Garena (B-Tier)",
          startDate: "2026-12-19",
          endDate: "2026-12-20",
          time: "19–20 Dec 2026 (IST)",
          prize: "₹21,00,000 INR",
          teams: "S8UL Esports (Invited Partner Club)",
          location: "Mumbai, India",
          liquipediaUrl: "https://liquipedia.net/freefire/Google_Play_Arena/2026"
        },
        {
          title: "Esports World Cup 2027 (EWC 2027)",
          game: "Multi-Title",
          organizer: "EWCF & ESL FACEIT (S-Tier)",
          startDate: "2027-07-20",
          endDate: "2027-08-01",
          time: "20 Jul – 1 Aug 2027 (AST / IST)",
          prize: "Club & Title Pools (CS2: $2,000,000 USD)",
          teams: "S8UL Esports (EWC Partner Club)",
          location: "Riyadh, Saudi Arabia",
          liquipediaUrl: "https://liquipedia.net/"
        }
      ],
      godlike: [
        {
          title: "Chennai Esports Global Championship (CEGC) 2026",
          game: "BGMI",
          organizer: "Skyesports & SDAT (B-Tier)",
          startDate: "2026-11-03",
          endDate: "2026-12-13",
          time: "Grand Finals: 11–13 Dec (IST)",
          prize: "₹75,00,000 INR",
          teams: "GodLike Esports (Active Participant)",
          location: "Chennai, India",
          liquipediaUrl: "https://liquipedia.net/pubgmobile/Chennai_Esports_Global_Championship/2026"
        },
        {
          title: "Delta Force Invitational 2026",
          game: "Delta Force",
          organizer: "Team Jade & TiMi (S-Tier)",
          startDate: "2026-11-27",
          endDate: "2026-11-29",
          time: "16:30 IST (11:00 UTC · 12:00 CET)",
          prize: "$500,000 USD",
          teams: "GodLike Esports (2nd · RISE Series Americas S2)",
          location: "Stockholm, Sweden",
          liquipediaUrl: "https://liquipedia.net/deltaforce/Delta_Force_Invitational/2026"
        },
        {
          title: "Call of Duty: Mobile World Championship 2026",
          game: "COD Mobile",
          organizer: "Activision (S-Tier)",
          startDate: "2026-12-04",
          endDate: "2026-12-06",
          time: "4–6 Dec 2026 (CST / UTC)",
          prize: "$500,000 USD",
          teams: "GodLike Esports (India Representative)",
          location: "Mexico City, Mexico",
          liquipediaUrl: "https://liquipedia.net/callofduty/Call_of_Duty_Mobile_World_Championship/2026"
        },
        {
          title: "Google Play Arena 2026 — BGMI",
          game: "BGMI",
          organizer: "Google Play / KRAFTON (B-Tier)",
          startDate: "2026-12-14",
          endDate: "2026-12-20",
          time: "14–20 Dec 2026 (IST)",
          prize: "₹28,00,000 INR",
          teams: "GodLike Esports (Invited Partner Club)",
          location: "India (Online & LAN)",
          liquipediaUrl: "https://liquipedia.net/pubgmobile/Google_Play_Arena/2026"
        },
        {
          title: "Google Play Arena 2026 — Free Fire",
          game: "Free Fire",
          organizer: "Google Play / Garena (B-Tier)",
          startDate: "2026-12-19",
          endDate: "2026-12-20",
          time: "19–20 Dec 2026 (IST)",
          prize: "₹21,00,000 INR",
          teams: "GodLike Esports (Grand Finals Partner Club)",
          location: "Mumbai, India",
          liquipediaUrl: "https://liquipedia.net/freefire/Google_Play_Arena/2026"
        },
        {
          title: "Esports World Cup 2027 (EWC 2027)",
          game: "Multi-Title",
          organizer: "EWCF & ESL FACEIT (S-Tier)",
          startDate: "2027-07-20",
          endDate: "2027-08-01",
          time: "20 Jul – 1 Aug 2027 (AST / IST)",
          prize: "Club & Title Pools (CS2: $2,000,000 USD)",
          teams: "GodLike Esports (EWC Partner Club)",
          location: "Riyadh, Saudi Arabia",
          liquipediaUrl: "https://liquipedia.net/"
        }
      ],
      tag: [
        {
          title: "Chennai Esports Global Championship (CEGC) 2026",
          game: "BGMI",
          organizer: "Skyesports & SDAT (B-Tier)",
          startDate: "2026-11-03",
          endDate: "2026-12-13",
          time: "Grand Finals: 11–13 Dec (IST)",
          prize: "₹75,00,000 INR",
          teams: "Team Apex Gaming (TAG · Group Stage Invite)",
          location: "Chennai, India",
          liquipediaUrl: "https://liquipedia.net/pubgmobile/Chennai_Esports_Global_Championship/2026"
        },
        {
          title: "FFWS Global Finals 2026",
          game: "Free Fire",
          organizer: "Garena (S-Tier)",
          startDate: "2026-11-06",
          endDate: "2026-11-28",
          time: "Last Chance: Nov 27, 15:45 IST · Finals: Nov 28, 15:30 IST",
          prize: "$1,200,000 USD",
          teams: "Team Apex Gaming (TAG · 24 Global Teams)",
          location: "Bangkok, Thailand",
          liquipediaUrl: "https://liquipedia.net/freefire/Free_Fire_World_Series/2026"
        },
        {
          title: "PUBG India Challenge 2026 — Grand Finals",
          game: "PUBG (PC)",
          organizer: "KRAFTON & Tesseract (A-Tier)",
          startDate: "2026-11-11",
          endDate: "2026-11-29",
          time: "18:30 IST (Grand Finals: Nov 28–29)",
          prize: "₹25,00,000 INR",
          teams: "Team Apex Gaming (TAG · Qualified for Grand Finals)",
          location: "India (Online)",
          liquipediaUrl: "https://liquipedia.net/pubg/PUBG_India_Challenge/2026"
        },
        {
          title: "Google Play Arena 2026 — BGMI",
          game: "BGMI",
          organizer: "Google Play & NODWIN Gaming (B-Tier)",
          startDate: "2026-12-14",
          endDate: "2026-12-20",
          time: "14–20 Dec 2026 (IST)",
          prize: "₹28,00,000 INR",
          teams: "Team Apex Gaming (TAG · Invited Partner Club)",
          location: "India (Online & LAN)",
          liquipediaUrl: "https://liquipedia.net/pubgmobile/Google_Play_Arena/2026"
        }
      ]
    };
    return (clubs[clubKey] || []).map((t, i) => ({ id: `${clubKey}-up-${i + 1}`, ...t }));
  }

  showClubUpcoming(clubKey) {
    this.homeScreen.style.display = "none";
    this.godlikeScreen.classList.remove("active");
    this.s8ulScreen.classList.remove("active");
    if (this.enc27Screen) this.enc27Screen.classList.remove("active");
    if (this.dailyUpdatesScreen) this.dailyUpdatesScreen.classList.remove("active");
    if (this.clubUpcomingScreen) this.clubUpcomingScreen.classList.add("active");

    const logoEl = document.getElementById("club-page-logo");
    const titleEl = document.getElementById("club-page-title");
    const subEl = document.getElementById("club-page-subtitle");
    const listEl = document.getElementById("club-upcoming-list");
    const s8ulBtn = document.getElementById("club-switch-s8ul");
    const godlBtn = document.getElementById("club-switch-godlike");
    const tagBtn = document.getElementById("club-switch-tag");

    const metaMap = {
      s8ul: {
        logo: "images/s8ul_logo.png",
        title: "S8UL Esports — Upcoming & Ongoing Tournaments",
        color: "var(--s8ul-blue)",
        sub: "Verified Liquipedia schedule for S8UL Esports & Team SouL across PUBG PC, PUBG Mobile, Free Fire & EWC 2027."
      },
      godlike: {
        logo: "images/godlike_logo.png",
        title: "GodLike Esports — Upcoming & Ongoing Tournaments",
        color: "var(--godl-gold)",
        sub: "Verified Liquipedia schedule for GodLike Esports across BGMI (CEGC), Delta Force, COD Mobile, Free Fire & EWC 2027."
      },
      tag: {
        logo: "images/team_apex_logo.avif",
        title: "Team Apex Gaming (TAG) — Upcoming & Ongoing Tournaments",
        color: "#fb923c",
        sub: "Verified Liquipedia schedule for Team Apex Gaming (TAG) across Free Fire (FFWS), BGMI (CEGC & GPA) & PUBG PC."
      }
    };
    const meta = metaMap[clubKey] || metaMap.s8ul;

    if (logoEl) {
      logoEl.src = meta.logo;
      logoEl.style.borderRadius = clubKey === "tag" ? "10px" : "0";
    }
    if (titleEl) {
      titleEl.textContent = meta.title;
      titleEl.style.color = meta.color;
    }
    if (subEl) subEl.textContent = meta.sub;
    if (s8ulBtn) s8ulBtn.classList.toggle("active", clubKey === "s8ul");
    if (godlBtn) godlBtn.classList.toggle("active", clubKey === "godlike");
    if (tagBtn) tagBtn.classList.toggle("active", clubKey === "tag");

    if (listEl) {
      const items = this.getClubUpcomingTournaments(clubKey);
      this.renderTournamentCards(listEl, items, 12, "No Upcoming Tournaments Found", false);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  extractPostGameTags(caption) {
    const text = String(caption || "").toLowerCase();
    const gameRules = [
      { label: "BGMI", patterns: ["bgmi", "battlegrounds mobile", "bmps", "bgis", "pmwc", "pubg mobile"] },
      { label: "Valorant", patterns: ["valorant", "vct", "val "] },
      { label: "League of Legends", patterns: ["league of legends", "lol"] },
      { label: "Chess", patterns: ["chess", "grandmaster", "fide"] },
      { label: "Free Fire", patterns: ["free fire", "ffws", "ffwc"] },
      { label: "COD Mobile", patterns: ["codm", "cod mobile", "call of duty"] },
      { label: "Apex Legends", patterns: ["apex", "algs"] },
      { label: "Tekken 8", patterns: ["tekken"] },
      { label: "Dota 2", patterns: ["dota"] },
      { label: "MLBB", patterns: ["mlbb", "mobile legends"] },
      { label: "EWC", patterns: ["ewc", "esports world cup"] }
    ];
    return gameRules
      .filter(r => r.patterns.some(p => text.includes(p)))
      .map(r => r.label);
  }

  renderDailyFilterToolbar(toolbarId, tabKey, items, getTagsFn, placeholder, onUpdate, skipToolbar = false) {
    const toolbar = document.getElementById(toolbarId);
    if (!toolbar) return;
    if (skipToolbar) {
      const clearBtn = toolbar.querySelector(".roster-search-clear");
      const qVal = this.dailyTabFilters[tabKey]?.q || "";
      if (clearBtn) clearBtn.style.display = qVal ? "inline-flex" : "none";
      return;
    }

    const filter = this.dailyTabFilters[tabKey] || { q: "", game: "ALL" };
    const tags = Array.from(new Set(items.flatMap(item => getTagsFn(item)).filter(Boolean)));
    if (filter.game !== "ALL" && !tags.includes(filter.game)) {
      filter.game = "ALL";
    }

    toolbar.innerHTML = `
      <div class="roster-controls-row">
        <div class="roster-search-wrap">
          <span class="roster-search-icon">🔍</span>
          <input type="text" class="roster-search-input" placeholder="${this.escapeHtml(placeholder)}" value="${this.escapeHtml(filter.q)}">
          <button type="button" class="roster-search-clear" title="Clear search" style="display:${filter.q ? "inline-flex" : "none"};">✕</button>
        </div>
        <div class="roster-cat-pills">
          <button type="button" class="roster-cat-pill ${filter.game === "ALL" ? "active" : ""}" data-game="ALL">All (${items.length})</button>
          ${tags.map(tag => `<button type="button" class="roster-cat-pill ${filter.game === tag ? "active" : ""}" data-game="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</button>`).join("")}
        </div>
      </div>
    `;

    const input = toolbar.querySelector(".roster-search-input");
    if (input) {
      input.addEventListener("input", (e) => {
        this.dailyTabFilters[tabKey].q = e.target.value;
        onUpdate(true);
      });
    }
    const clearBtn = toolbar.querySelector(".roster-search-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        this.dailyTabFilters[tabKey].q = "";
        onUpdate(false);
      });
    }
    toolbar.querySelectorAll(".roster-cat-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        this.dailyTabFilters[tabKey].game = btn.dataset.game;
        onUpdate(false);
      });
    });
  }

  getFilteredTournaments(list, tabKey, toolbarId, placeholder, onUpdate, skipToolbar = false) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const parseLocal = (iso) => {
      const [y, m, d] = String(iso || "").split("-").map(Number);
      return new Date(y, (m || 1) - 1, d || 1).getTime();
    };
    const activeUpcoming = (list || [])
      .filter(t => t.startDate && parseLocal(t.endDate || t.startDate) >= todayStart)
      .sort((a, b) => parseLocal(a.startDate) - parseLocal(b.startDate));

    this.renderDailyFilterToolbar(
      toolbarId,
      tabKey,
      activeUpcoming,
      t => (t.game ? [t.game.trim()] : []),
      placeholder,
      onUpdate,
      skipToolbar
    );

    const filter = this.dailyTabFilters[tabKey] || { q: "", game: "ALL" };
    const q = (filter.q || "").trim().toLowerCase();
    return activeUpcoming.filter(t => {
      if (filter.game !== "ALL" && (t.game || "").trim() !== filter.game) return false;
      if (!q) return true;
      return (t.title || "").toLowerCase().includes(q)
          || (t.game || "").toLowerCase().includes(q)
          || (t.organizer || "").toLowerCase().includes(q)
          || (t.location || "").toLowerCase().includes(q)
          || (t.teams || "").toLowerCase().includes(q)
          || (t.prize || "").toLowerCase().includes(q);
    });
  }

  renderUpcomingTournaments(skipToolbar = false) {
    const container = document.getElementById("upcoming-tournaments-list");
    if (!container) return;

    const customList = Array.isArray(this.data?.upcomingTournaments) && this.data.upcomingTournaments.length > 0
      ? this.data.upcomingTournaments
      : this.getDefaultMajorTournaments();

    const filtered = this.getFilteredTournaments(
      customList,
      "tournaments",
      "daily-tournaments-toolbar",
      "Search game, tournament, or location...",
      (skip) => this.renderUpcomingTournaments(skip),
      skipToolbar
    );

    const isFiltered = (this.dailyTabFilters.tournaments.q || "").trim() !== "" || this.dailyTabFilters.tournaments.game !== "ALL";
    this.renderTournamentCards(
      container,
      filtered,
      20,
      isFiltered ? "No Matching Major Tournaments Found" : "No Upcoming Major Tournaments Scheduled",
      "major"
    );
  }

  async deleteMajorTournament(id, title) {
    if (!this.checkAdminAuth()) return;
    if (!confirm(`⚠️ Permanently delete major tournament "${title}"?`)) return;
    const seedList = this.getDefaultMajorTournaments();
    const ok = await this.cloudOp(
      { op: "deleteMajorTournament", id, title, seedList },
      `🗑️ Major tournament "${title}" deleted.`
    );
    if (ok) {
      this.renderUpcomingTournaments();
      this.renderDailyMarquee();
    }
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
        title: "Chennai Esports Global Championship 2026 (CEGC 2026)",
        game: "BGMI",
        organizer: "Skyesports & SDAT (B-Tier)",
        startDate: "2026-11-03",
        endDate: "2026-12-13",
        time: "Grand Finals: 11–13 Dec (IST)",
        prize: "₹75,00,000 INR (~$80,246 USD)",
        teams: "33 Teams · GodLike Esports & Indian Pro Squads",
        location: "Chennai, India",
        liquipediaUrl: "https://liquipedia.net/pubgmobile/Chennai_Esports_Global_Championship/2026"
      },
      {
        id: "tp-2",
        title: "Free Fire India Campus Cup (FFICC) Season 2",
        game: "Free Fire",
        organizer: "Garena (B-Tier)",
        startDate: "2026-11-10",
        endDate: "2026-12-15",
        time: "Nov 10 – Dec 2026 (IST)",
        prize: "₹5,00,000 INR (~$5,350 USD)",
        teams: "49 Collegiate Squads",
        location: "India (Online & Offline)",
        liquipediaUrl: "https://liquipedia.net/freefire/Free_Fire_India_Campus_Cup/Season_2"
      },
      {
        id: "tp-3",
        title: "JioBLAST Gully Wars 2026",
        game: "BGMI",
        organizer: "JioBLAST & KRAFTON (B-Tier)",
        startDate: "2026-11-27",
        endDate: "2026-11-29",
        time: "27–29 Nov 2026 (IST)",
        prize: "₹10,00,000 INR (~$10,549 USD)",
        teams: "16 Grand Finals Indian Squads",
        location: "India (Online)",
        liquipediaUrl: "https://liquipedia.net/pubgmobile/JioBLAST_Gully_Wars/2026"
      },
      {
        id: "tp-4",
        title: "Battlin Open Season 1 — Track 2",
        game: "BGMI",
        organizer: "Battlin Open (B-Tier)",
        startDate: "2026-11-27",
        endDate: "2026-11-29",
        time: "27–29 Nov 2026 (IST)",
        prize: "$16,049 USD (~₹15,00,000 INR)",
        teams: "16 Indian Squads",
        location: "India (Online)",
        liquipediaUrl: "https://liquipedia.net/pubgmobile/Battlin_Open/Season_1/Track_2"
      },
      {
        id: "tp-5",
        title: "Google Play Arena 2026 — BGMI",
        game: "BGMI",
        organizer: "Google Play & NODWIN Gaming (B-Tier)",
        startDate: "2026-12-14",
        endDate: "2026-12-20",
        time: "14–20 Dec 2026 (IST)",
        prize: "₹28,00,000 INR (~$29,770 USD)",
        teams: "16 Teams · GodLike Esports & Qualifiers",
        location: "India (Online & LAN)",
        liquipediaUrl: "https://liquipedia.net/pubgmobile/Google_Play_Arena/2026"
      },
      {
        id: "tp-6",
        title: "Google Play Arena 2026 — Free Fire",
        game: "Free Fire",
        organizer: "Google Play & NODWIN Gaming (B-Tier)",
        startDate: "2026-12-19",
        endDate: "2026-12-20",
        time: "19–20 Dec 2026 (IST)",
        prize: "₹21,00,000 INR (~$22,659 USD)",
        teams: "18 Teams · S8UL Esports & GodLike Esports",
        location: "Mumbai, India",
        liquipediaUrl: "https://liquipedia.net/freefire/Google_Play_Arena/2026"
      }
    ];
  }

  getActiveThirdPartyList() {
    return Array.isArray(this.data?.thirdPartyTournaments) && this.data.thirdPartyTournaments.length > 0
      ? this.data.thirdPartyTournaments
      : this.getDefaultThirdPartyTournaments();
  }

  renderThirdPartyTournaments(skipToolbar = false) {
    const container = document.getElementById("thirdparty-tournaments-list");
    if (!container) return;
    const filtered = this.getFilteredTournaments(
      this.getActiveThirdPartyList(),
      "thirdparty",
      "daily-thirdparty-toolbar",
      "Search game, organizer, or tournament...",
      (skip) => this.renderThirdPartyTournaments(skip),
      skipToolbar
    );
    const isFiltered = (this.dailyTabFilters.thirdparty.q || "").trim() !== "" || this.dailyTabFilters.thirdparty.game !== "ALL";
    this.renderTournamentCards(
      container,
      filtered,
      25,
      isFiltered ? "No Matching 3rd-Party Tournaments Found" : "No Upcoming 3rd-Party Tournaments Scheduled",
      true
    );
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

    this.closeModal("tournament-modal");
    await this.submitPendingRequest(req, `📩 Tournament "${title}" sent to Admin for approval!`);
  }

  async deleteThirdPartyTournament(id) {
    if (!this.checkAdminAuth()) return;
    const item = this.getActiveThirdPartyList().find(t => t.id === id);
    if (!item) return;
    const seedList = this.getDefaultThirdPartyTournaments();

    if (confirm(`⚠️ Permanently delete tournament "${item.title}"?`)) {
      const ok = await this.cloudOp({ op: "deleteThirdPartyTournament", id, seedList }, `🗑️ Tournament "${item.title}" deleted.`);
      if (ok) {
        this.renderThirdPartyTournaments();
        this.renderDailyMarquee();
      }
    }
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
            <div class="tournament-meta-item"><span>📅 Date &amp; Time</span><strong>${formatRange(t.startDate, t.endDate || t.startDate)}${t.time ? `<br><small style="color:#38bdf8;font-weight:500;">🕒 ${this.escapeHtml(t.time)}</small>` : ""}</strong></div>
            <div class="tournament-meta-item"><span>💰 Prize / Stakes</span><strong>${this.escapeHtml(t.prize || "TBA")}</strong></div>
            <div class="tournament-meta-item"><span>📍 Region</span><strong>${this.escapeHtml(t.location || "India")}</strong></div>
            <div class="tournament-meta-item"><span>🛡️ Teams / Source</span><strong>${this.escapeHtml(t.teams || "Indian Pro Clubs")}${t.liquipediaUrl ? ` · <a href="${this.escapeHtml(t.liquipediaUrl)}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:underline;">Liquipedia ↗</a>` : ""}</strong></div>
          </div>
          ${(editable === true || editable === "thirdparty") && t.id ? `
          <div class="tournament-card-actions">
            <span class="tournament-updated-by">${t.updatedBy ? `👤 Added/Edited by ${this.escapeHtml(t.updatedBy)}` : "📅 Auto-sorted by Start Date"}</span>
            <div class="row-action-btns">
              <button type="button" class="btn-action-edit" onclick="window.cleanHub.openEditTournamentModal('${this.escapeHtml(t.id)}')">✏️ Edit</button>
              ${this.isAdmin ? `<button type="button" class="btn-action-delete" onclick="window.cleanHub.deleteThirdPartyTournament('${this.escapeHtml(t.id)}')" title="Delete Tournament (Admin)">🗑️</button>` : ""}
            </div>
          </div>` : (editable === "major" && this.isAdmin ? `
          <div class="tournament-card-actions">
            <span class="tournament-updated-by">🛡️ Admin Control</span>
            <div class="row-action-btns">
              <button type="button" class="btn-action-delete" onclick="window.cleanHub.deleteMajorTournament('${this.escapeHtml(t.id || "")}', '${this.escapeHtml(t.title)}')" title="Delete Major Tournament (Admin)">🗑️ Delete</button>
            </div>
          </div>` : "")}
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

    await this.submitPendingRequest(request, "📩 Post submitted! An admin will review and approve it.");

    // Reset form
    const form = document.getElementById("daily-post-form");
    if (form) form.reset();
    this.clearImagePreview();

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "📩 Submit Post for Admin Approval";
    }
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

    this.cachedApprovedPosts = approved;
    this.renderApprovedPostsList(approved, false);
  }

  renderApprovedPostsList(approvedInput = null, skipToolbar = false) {
    const container = document.getElementById("daily-posts-feed-container");
    const counter   = document.getElementById("daily-feed-counter");
    if (!container) return;

    const approved = approvedInput || this.cachedApprovedPosts || [];

    this.renderDailyFilterToolbar(
      "daily-updates-toolbar",
      "updates",
      approved,
      post => this.extractPostGameTags(post.caption),
      "Search game, update, or author...",
      (skip) => this.renderApprovedPostsList(null, skip),
      skipToolbar
    );

    const filter = this.dailyTabFilters.updates || { q: "", game: "ALL" };
    const q = (filter.q || "").trim().toLowerCase();
    const filteredPosts = approved.filter(post => {
      if (filter.game !== "ALL" && !this.extractPostGameTags(post.caption).includes(filter.game)) return false;
      if (!q) return true;
      return (post.caption || "").toLowerCase().includes(q)
          || (post.submittedBy || "").toLowerCase().includes(q);
    });

    const isFiltered = q !== "" || filter.game !== "ALL";
    if (counter) {
      if (approved.length === 0) {
        counter.textContent = "0 Posts";
      } else if (isFiltered) {
        counter.textContent = `Showing ${filteredPosts.length} of ${approved.length} Posts`;
      } else {
        counter.textContent = `Showing ${approved.length} Post${approved.length > 1 ? "s" : ""}`;
      }
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

    if (filteredPosts.length === 0) {
      container.innerHTML = `
        <div class="daily-empty-feed-card">
          <div style="font-size:2.2rem; margin-bottom:10px;">🔍</div>
          <h3 style="color:#fff; font-size:1.1rem; margin-bottom:6px;">No Matching Posts Found</h3>
          <p style="color:#94a3b8; font-size:0.88rem; margin:0 auto;">Try a different game filter or clear your search query.</p>
        </div>`;
      return;
    }

    container.innerHTML = filteredPosts.map(post => {
      const hasImage = post.imageUrl && post.imageUrl.length > 5;
      const imgHtml = hasImage ? `
        <div class="daily-post-image-box" onclick="window.cleanHub && window.cleanHub.openImageLightbox('${this.escapeHtml(post.imageUrl)}')" title="Click to view full image">
          <img src="${this.escapeHtml(post.imageUrl)}" alt="Daily Update Image" class="daily-post-main-img" loading="lazy" onerror="this.parentElement.style.display='none'" />
          <span class="daily-img-zoom-hint">🔍 View Full</span>
        </div>` : "";

      const likedSet = this.getLikedPostSet();
      const isLiked = likedSet.has(post.id);
      const likesCount = Number(post.likes) || 0;
      const comments = Array.isArray(post.comments) ? post.comments : [];
      const isCommentsOpen = this.openCommentPostIds && this.openCommentPostIds.has(post.id);
      const defaultAuthor = localStorage.getItem("last_updater_name") || (this.isAdmin ? "Pritesh Gehlot" : "");

      const commentsListHtml = comments.length > 0
        ? comments.map(c => `
            <div class="daily-comment-item">
              <div class="daily-comment-meta">
                <strong>👤 ${this.escapeHtml(c.author || "Fan")}</strong>
                <span>${this.escapeHtml(c.createdAt || "")}</span>
                ${this.isAdmin ? `<button type="button" class="btn-comment-del" onclick="window.cleanHub.deletePostComment('${this.escapeHtml(post.id)}', '${this.escapeHtml(c.id)}')" title="Delete Comment">🗑️</button>` : ""}
              </div>
              <p class="daily-comment-text">${this.escapeHtml(c.text || "")}</p>
            </div>
          `).join("")
        : `<div class="daily-comment-empty">No comments yet. Be the first to comment!</div>`;

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

          <div class="daily-post-actions-bar">
            <button type="button" class="btn-post-action btn-post-like ${isLiked ? "liked" : ""}" onclick="window.cleanHub.toggleLikePost('${this.escapeHtml(post.id)}')">
              <span>${isLiked ? "❤️" : "🤍"}</span>
              <span>Like</span>
              <strong>${likesCount}</strong>
            </button>
            <button type="button" class="btn-post-action btn-post-comment ${isCommentsOpen ? "active" : ""}" onclick="window.cleanHub.togglePostComments('${this.escapeHtml(post.id)}')">
              <span>💬</span>
              <span>Comments</span>
              <strong>${comments.length}</strong>
            </button>
            <button type="button" class="btn-post-action btn-post-share" onclick="window.cleanHub.shareDailyPost('${this.escapeHtml(post.id)}')" title="Share this post">
              <span>🔗</span>
              <span>Share</span>
            </button>
          </div>

          ${isCommentsOpen ? `
          <div class="daily-post-comments-drawer">
            <div class="daily-comments-list">${commentsListHtml}</div>
            <form class="daily-comment-form" onsubmit="window.cleanHub.handleAddPostComment(event, '${this.escapeHtml(post.id)}')">
              <input type="text" class="form-input daily-comment-author" placeholder="Your name" value="${this.escapeHtml(defaultAuthor)}" required />
              <input type="text" class="form-input daily-comment-input" placeholder="Write a comment..." maxlength="500" required />
              <button type="submit" class="btn-comment-submit">Post</button>
            </form>
          </div>` : ""}

          <div class="daily-post-card-footer">
            <span class="daily-post-timestamp">🕒 ${this.escapeHtml(post.submittedAt || "Recent")}</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="daily-post-tag">🇮🇳 India EWC Desk</span>
              ${this.isAdmin ? `<button type="button" class="btn-action-delete" onclick="window.cleanHub.deleteDailyPost('${this.escapeHtml(post.id)}')" title="Delete Post (Admin)">🗑️ Delete</button>` : ""}
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  getLikedPostSet() {
    try {
      const arr = JSON.parse(localStorage.getItem("igc_liked_posts") || "[]");
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
      return new Set();
    }
  }

  async toggleLikePost(postId) {
    const likedSet = this.getLikedPostSet();
    const alreadyLiked = likedSet.has(postId);
    const delta = alreadyLiked ? -1 : 1;

    if (alreadyLiked) likedSet.delete(postId);
    else likedSet.add(postId);
    try { localStorage.setItem("igc_liked_posts", JSON.stringify(Array.from(likedSet))); } catch (e) {}

    const updateLocal = (list) => {
      const item = (list || []).find(r => r.id === postId);
      if (item) item.likes = Math.max(0, (Number(item.likes) || 0) + delta);
    };
    updateLocal(this.pending);
    updateLocal(this.cachedApprovedPosts);
    this.savePending();
    this.renderApprovedPostsList(null, true);

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "like_post", id: postId, delta })
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok && typeof json.likes === "number") {
        [this.pending, this.cachedApprovedPosts].forEach(list => {
          const item = (list || []).find(r => r.id === postId);
          if (item) item.likes = json.likes;
        });
        this.savePending();
        this.renderApprovedPostsList(null, true);
      }
    } catch (e) {}
  }

  togglePostComments(postId) {
    if (!this.openCommentPostIds) this.openCommentPostIds = new Set();
    if (this.openCommentPostIds.has(postId)) this.openCommentPostIds.delete(postId);
    else this.openCommentPostIds.add(postId);
    this.renderApprovedPostsList(null, true);
  }

  async shareDailyPost(postId) {
    const post = (this.cachedApprovedPosts || this.pending || []).find(r => r.id === postId);
    const shareUrl = `${window.location.origin}/post/${encodeURIComponent(postId)}`;
    const shareTitle = "India EWC & ENC27 Hub — Daily IGC Update";
    const shareText = post && post.caption && post.caption.trim() !== "."
      ? `${String(post.caption).slice(0, 140)} — via India EWC Hub`
      : "Check out this update on India EWC & ENC27 Hub!";

    if (navigator.share) {
      try {
        // Attach the post image file when supported (mobile WhatsApp / X / Telegram)
        if (post && post.imageUrl) {
          const imgRes = await fetch(`/post-image/${encodeURIComponent(postId)}/cover.jpg`).catch(() => null);
          if (imgRes && imgRes.ok) {
            const blob = await imgRes.blob();
            const file = new File([blob], `${postId}.jpg`, { type: blob.type || "image/jpeg" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ title: shareTitle, text: `${shareText}\n${shareUrl}`, files: [file] });
              return;
            }
          }
        }
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      this.showToast("🔗 Post share link copied!");
    } catch (e) {
      prompt("Copy this link to share:", shareUrl);
    }
  }

  async handleAddPostComment(e, postId) {
    e.preventDefault();
    const form = e.target;
    const authorInput = form.querySelector(".daily-comment-author");
    const textInput   = form.querySelector(".daily-comment-input");
    const author = (authorInput?.value || "").trim() || "Community Fan";
    const text   = (textInput?.value || "").trim();
    if (!text) return;
    localStorage.setItem("last_updater_name", author);

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comment_post", id: postId, author, text })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        this.showToast("⚠️ " + (json.error || "Could not post comment."));
        return;
      }
      [this.pending, this.cachedApprovedPosts].forEach(list => {
        const item = (list || []).find(r => r.id === postId);
        if (item && Array.isArray(json.comments)) item.comments = json.comments;
      });
      this.savePending();
      if (!this.openCommentPostIds) this.openCommentPostIds = new Set();
      this.openCommentPostIds.add(postId);
      this.renderApprovedPostsList(null, true);
      this.showToast("💬 Comment posted!");
    } catch (err) {
      this.showToast("⚠️ Network error. Could not post comment.");
    }
  }

  async deletePostComment(postId, commentId) {
    if (!this.checkAdminAuth()) return;
    if (!confirm("⚠️ Delete this comment?")) return;
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_comment", id: postId, commentId })
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        [this.pending, this.cachedApprovedPosts].forEach(list => {
          const item = (list || []).find(r => r.id === postId);
          if (item && Array.isArray(json.comments)) item.comments = json.comments;
        });
        this.savePending();
        this.renderApprovedPostsList(null, true);
        this.showToast("🗑️ Comment deleted.");
      }
    } catch (e) {}
  }

  async deleteDailyPost(id) {
    if (!this.checkAdminAuth()) return;
    if (!confirm("⚠️ Permanently delete this Daily Update post?")) return;
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        alert("⚠️ " + (json.error || "Failed to delete post."));
        return;
      }
      this.pending = (this.pending || []).filter(r => r.id !== id);
      this.cachedApprovedPosts = (this.cachedApprovedPosts || []).filter(r => r.id !== id);
      this.savePending();
      this.updateAdminUI();
      this.renderApprovedPostsList();
      this.renderDailyMarquee();
      this.showToast("🗑️ Daily Update post deleted.");
    } catch (e) {
      alert("⚠️ Network error. Could not delete post.");
    }
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
    // Unlimited attempts without lockout.
    if (pin === this.adminPin) {
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
    this.renderEnc27Games();
    this.renderEwc27Games();
    this.renderEnc27Rosters();
    this.renderEWC("godlike", "godl-ewc-tbody", "var(--godl-gold)");
    this.renderEWC("s8ul",    "s8ul-ewc-tbody",  "var(--s8ul-blue)");
    this.renderRosters("godlike", "godl-roster-container", "var(--godl-gold)");
    this.renderRosters("s8ul",    "s8ul-roster-container",  "var(--s8ul-blue)");
  }

  // ─── Road to ENC27 — Indian Region Roster ─────────────────────────────────
  getDefaultEnc27Rosters() {
    return [
      { id: "enc-1", no: 1, title: "BGMI / PUBG Mobile", genre: "Mobile Battle Royale", roster: "TBA — India National Trials", coach: "", status: "Road to ENC27 — Qualifier Watch", updatedBy: "Pritesh Gehlot" },
      { id: "enc-2", no: 2, title: "Valorant", genre: "Tactical FPS", roster: "TBA — South Asia Trials", coach: "", status: "Road to ENC27 — Qualifier Watch", updatedBy: "Pritesh Gehlot" },
      { id: "enc-3", no: 3, title: "Chess", genre: "Strategy / Mind", roster: "TBA — Indian Grandmasters", coach: "", status: "Road to ENC27 — Invited", updatedBy: "Pritesh Gehlot" },
      { id: "enc-4", no: 4, title: "Tekken 8", genre: "Fighting (FGC)", roster: "TBA — India FGC Qualifiers", coach: "", status: "Road to ENC27 — Qualifier Watch", updatedBy: "Pritesh Gehlot" },
      { id: "enc-5", no: 5, title: "EA SPORTS FC", genre: "Sports Sim", roster: "TBA — India National Selection", coach: "", status: "Road to ENC27 — Qualifier Watch", updatedBy: "Pritesh Gehlot" },
      { id: "enc-6", no: 6, title: "Call of Duty: Mobile", genre: "Mobile FPS", roster: "TBA — India Regional Trials", coach: "", status: "Road to ENC27 — Qualifier Watch", updatedBy: "Pritesh Gehlot" },
      { id: "enc-7", no: 7, title: "Free Fire MAX", genre: "Mobile Battle Royale", roster: "TBA — India Regional Trials", coach: "", status: "Road to ENC27 — Qualifier Watch", updatedBy: "Pritesh Gehlot" },
      { id: "enc-8", no: 8, title: "MLBB", genre: "Mobile MOBA", roster: "TBA — South Asia Qualifiers", coach: "", status: "Road to ENC27 — Qualifier Watch", updatedBy: "Pritesh Gehlot" }
    ];
  }

  getActiveEnc27Rosters() {
    return Array.isArray(this.data?.enc27Rosters) && this.data.enc27Rosters.length > 0
      ? this.data.enc27Rosters
      : this.getDefaultEnc27Rosters();
  }

  openEnc27Game(title) {
    this.enc27Filter.q = title || "";
    this.enc27Filter.cat = "ALL";
    this.showEnc27();
    setTimeout(() => {
      const target = document.getElementById("enc27-roster-view") || document.getElementById("enc27-roster-toolbar");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }

  renderEnc27Games() {
    const track = document.getElementById("enc27-games-track");
    if (!track) return;
    const items = this.getActiveEnc27Rosters();
    track.innerHTML = items.map(r => `
      <div class="ewc27-game-card enc27-game-card-clickable" onclick="window.cleanHub && window.cleanHub.openEnc27Game('${this.escapeHtml(r.title)}')" title="View ${this.escapeHtml(r.title)} Roster on ENC27">
        <div class="ewc27-card-content">
          <h3 class="ewc27-game-name">${this.escapeHtml(r.title)}</h3>
          ${r.status ? `<span class="ewc27-game-sub">${this.escapeHtml(r.status)}</span>` : ""}
          ${r.genre ? `<span class="ewc27-game-genre">${this.escapeHtml(r.genre)}</span>` : ""}
        </div>
        ${this.isAdmin ? `<button class="ewc27-card-edit-btn" onclick="event.stopPropagation(); window.cleanHub.openEditEnc27RosterModal('${this.escapeHtml(r.id)}')" title="Edit ENC27 Game">✏️</button>` : ""}
      </div>
    `).join("");
  }

  renderEnc27Rosters(skipToolbar = false) {
    const tbody = document.getElementById("enc27-roster-tbody");
    if (!tbody) return;
    const allItems = this.getActiveEnc27Rosters();
    const themeColor = "#38bdf8";

    const toolbar = document.getElementById("enc27-roster-toolbar");
    if (toolbar && !skipToolbar) {
      const cats = Array.from(new Set(allItems.map(r => (r.genre || "").trim()).filter(Boolean)));
      if (this.enc27Filter.cat !== "ALL" && !cats.includes(this.enc27Filter.cat)) {
        this.enc27Filter.cat = "ALL";
      }
      toolbar.innerHTML = `
        <div class="roster-controls-row">
          <div class="roster-search-wrap">
            <span class="roster-search-icon">🔍</span>
            <input type="text" class="roster-search-input" placeholder="Search ENC27 game, player, or coach..." value="${this.escapeHtml(this.enc27Filter.q)}">
            ${this.enc27Filter.q ? `<button type="button" class="roster-search-clear" title="Clear search">✕</button>` : ""}
          </div>
          <div class="roster-cat-pills">
            <button type="button" class="roster-cat-pill ${this.enc27Filter.cat === "ALL" ? "active" : ""}" data-cat="ALL">All (${allItems.length})</button>
            ${cats.map(c => `<button type="button" class="roster-cat-pill ${this.enc27Filter.cat === c ? "active" : ""}" data-cat="${this.escapeHtml(c)}">${this.escapeHtml(c)}</button>`).join("")}
          </div>
        </div>
      `;
      const input = toolbar.querySelector(".roster-search-input");
      if (input) {
        input.addEventListener("input", (e) => {
          this.enc27Filter.q = e.target.value;
          this.renderEnc27Rosters(true);
        });
      }
      const clearBtn = toolbar.querySelector(".roster-search-clear");
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          this.enc27Filter.q = "";
          this.renderEnc27Rosters(false);
        });
      }
      toolbar.querySelectorAll(".roster-cat-pill").forEach(btn => {
        btn.addEventListener("click", () => {
          this.enc27Filter.cat = btn.dataset.cat;
          this.renderEnc27Rosters(false);
        });
      });
    } else if (toolbar && skipToolbar) {
      const clearBtn = toolbar.querySelector(".roster-search-clear");
      if (clearBtn) clearBtn.style.display = this.enc27Filter.q ? "inline-flex" : "none";
    }

    const q = (this.enc27Filter.q || "").trim().toLowerCase();
    const items = allItems.filter(r => {
      const cat = (r.genre || "").trim();
      if (this.enc27Filter.cat !== "ALL" && cat !== this.enc27Filter.cat) return false;
      if (!q) return true;
      return (r.title || "").toLowerCase().includes(q)
          || (r.roster || "").toLowerCase().includes(q)
          || (r.coach || "").toLowerCase().includes(q)
          || cat.toLowerCase().includes(q)
          || (r.status || "").toLowerCase().includes(q);
    });

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">No matching ENC27 rosters found.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map((r, idx) => {
      const coachHtml = r.coach
        ? `<span class="coach-badge-highlight" style="--team-accent:${themeColor};">${this.escapeHtml(r.coach)}</span>`
        : `<span class="coach-empty-text">—</span>`;
      return `
        <tr class="table-row-highlight">
          <td class="col-num" style="color:${themeColor};" data-label="#">${r.no || idx + 1}</td>
          <td class="col-title" data-label="Game">
            <span class="game-title-highlight" style="--team-accent:${themeColor};">${this.escapeHtml(r.title)}</span>
          </td>
          <td class="col-category" data-label="Category"><span class="cat-badge">${this.escapeHtml(r.genre || "")}</span></td>
          <td class="col-roster" data-label="Team India Roster / Athletes">
            ${this.formatRosterHtml(r.roster, themeColor)}
          </td>
          <td class="col-coach" data-label="Coach / Mentor">${coachHtml}</td>
          <td class="col-status" data-label="Status">
            <span class="status-badge-highlight" style="color:${themeColor}; border-color:${themeColor};">${this.escapeHtml(r.status || "Road to ENC27")}</span>
          </td>
          <td data-label="Edited By" class="col-edited-by">
            <div class="edited-by-cell">
              <span class="updater-pill">
                <span class="updater-icon">👤</span>
                <span class="updater-name">${this.escapeHtml(r.updatedBy || "Pritesh Gehlot")}</span>
              </span>
              <div class="row-action-btns">
                <button class="btn-action-edit" onclick="window.cleanHub.openEditEnc27RosterModal('${this.escapeHtml(r.id)}')" title="Edit ENC27 Roster">✏️ Edit</button>
                ${this.isAdmin ? `<button class="btn-action-delete" onclick="window.cleanHub.deleteEnc27Roster('${this.escapeHtml(r.id)}')" title="Delete ENC27 Roster (Admin)">🗑️</button>` : ""}
              </div>
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  openAddEnc27RosterModal() {
    if (!this.checkAdminAuth()) return;
    this.editingEnc27RosterId = null;
    const titleEl = document.getElementById("enc27-modal-title");
    const btnEl = document.getElementById("enc27-modal-submit-btn");
    if (titleEl) titleEl.textContent = "➕ Add ENC27 Roster (Admin)";
    if (btnEl) btnEl.textContent = "💾 Save ENC27 Roster Live";
    document.getElementById("enc27-no-input").value = this.getActiveEnc27Rosters().length + 1;
    document.getElementById("enc27-title-input").value = "";
    document.getElementById("enc27-genre-input").value = "";
    document.getElementById("enc27-roster-input").value = "";
    document.getElementById("enc27-coach-input").value = "";
    document.getElementById("enc27-status-input").value = "Road to ENC27 — Trials";
    document.getElementById("enc27-updater-input").value = localStorage.getItem("last_updater_name") || "Pritesh Gehlot";
    this.openModal("enc27-roster-modal");
  }

  openEditEnc27RosterModal(id) {
    const item = this.getActiveEnc27Rosters().find(r => r.id === id);
    if (!item) return;
    this.editingEnc27RosterId = id;
    const titleEl = document.getElementById("enc27-modal-title");
    const btnEl = document.getElementById("enc27-modal-submit-btn");
    if (titleEl) titleEl.textContent = this.isAdmin ? `✏️ Edit ENC27 Roster: ${item.title}` : `📝 Suggest ENC27 Roster Edit: ${item.title}`;
    if (btnEl) btnEl.textContent = this.isAdmin ? "💾 Save Changes Live" : "📩 Submit for Admin Approval";
    document.getElementById("enc27-no-input").value = item.no || 1;
    document.getElementById("enc27-title-input").value = item.title || "";
    document.getElementById("enc27-genre-input").value = item.genre || "";
    document.getElementById("enc27-roster-input").value = item.roster || "";
    document.getElementById("enc27-coach-input").value = item.coach || "";
    document.getElementById("enc27-status-input").value = item.status || "";
    document.getElementById("enc27-updater-input").value = item.updatedBy || localStorage.getItem("last_updater_name") || "";
    this.openModal("enc27-roster-modal");
  }

  async handleSaveEnc27Roster(e) {
    if (e) e.preventDefault();
    const no = parseInt(document.getElementById("enc27-no-input").value, 10) || 1;
    const title = document.getElementById("enc27-title-input").value.trim();
    const genre = document.getElementById("enc27-genre-input").value.trim();
    const roster = document.getElementById("enc27-roster-input").value.trim() || "TBA — National Trials";
    const coach = document.getElementById("enc27-coach-input").value.trim();
    const status = document.getElementById("enc27-status-input").value.trim() || "Road to ENC27 — Trials";
    const updatedBy = document.getElementById("enc27-updater-input").value.trim() || "Community Member";
    if (!title) { alert("Please enter Game Title."); return; }
    localStorage.setItem("last_updater_name", updatedBy);

    const seedList = this.getDefaultEnc27Rosters();
    const payload = { id: this.editingEnc27RosterId || null, no, title, genre, roster, coach, status, updatedBy };

    if (this.isAdmin) {
      this.closeModal("enc27-roster-modal");
      const ok = await this.cloudOp({ op: "saveEnc27Roster", roster: payload, seedList }, `✅ ENC27 roster "${title}" saved!`);
      if (ok) {
        this.renderEnc27Rosters();
        this.renderEnc27Games();
      }
      return;
    }

    const req = {
      id: "req-" + Date.now(),
      type: "enc27_roster",
      teamKey: "godlike",
      targetId: this.editingEnc27RosterId || null,
      targetName: title,
      submittedBy: updatedBy,
      submittedAt: new Date().toLocaleString(),
      status: "pending",
      seedList,
      data: payload
    };
    this.closeModal("enc27-roster-modal");
    await this.submitPendingRequest(req, `📩 ENC27 roster update for "${title}" sent to Admin for approval!`);
  }

  async deleteEnc27Roster(id) {
    if (!this.checkAdminAuth()) return;
    const item = this.getActiveEnc27Rosters().find(r => r.id === id);
    if (!item) return;
    if (!confirm(`⚠️ Permanently delete ENC27 roster "${item.title}"?`)) return;
    const ok = await this.cloudOp(
      { op: "deleteEnc27Roster", id, seedList: this.getDefaultEnc27Rosters() },
      `🗑️ ENC27 roster "${item.title}" deleted.`
    );
    if (ok) {
      this.renderEnc27Rosters();
      this.renderEnc27Games();
    }
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
        <div class="ewc27-game-card enc27-game-card-clickable ${highlightClass}" onclick="window.cleanHub && window.cleanHub.openEwc27ClubRoster('${this.escapeHtml(g.title)}')" title="View S8UL & GodLike rosters for ${this.escapeHtml(g.title)}">
          ${badgeHtml}
          <div class="ewc27-card-content">
            <h3 class="ewc27-game-name">${this.escapeHtml(g.title)}</h3>
            ${g.sub ? `<span class="ewc27-game-sub">${this.escapeHtml(g.sub)}</span>` : ""}
            ${g.genre ? `<span class="ewc27-game-genre">${this.escapeHtml(g.genre)}</span>` : ""}
          </div>
          ${this.isAdmin ? `<button class="ewc27-card-edit-btn" onclick="event.stopPropagation(); window.cleanHub.openEditEwc27GameModal('${g.id}')" title="Edit Game">✏️</button>` : ""}
        </div>
      `;
    }).join("");
  }

  matchTeamGamesForEwcTitle(teamKey, ewcTitle) {
    const games = this.data?.[teamKey]?.ewcGames || [];
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const q = norm(ewcTitle);
    const aliases = [
      ["pubg mobile", "bgmi", "pmwc", "pubg battlegrounds", "pubg pc"],
      ["ea sports fc", "fc 26", "fc 25", "fc 27", "fifa"],
      ["call of duty warzone", "warzone", "codm", "cod mobile", "call of duty"],
      ["teamfight tactics", "tft"],
      ["counter strike 2", "cs2", "counter strike"],
      ["mobile legends", "mlbb"],
      ["free fire", "free fire max", "fire fire"],
      ["street fighter 6", "sf6"],
      ["fatal fury", "city of the wolves"],
      ["honor of kings", "hok"]
    ];
    const group = aliases.find(arr => arr.some(a => q.includes(a) || a.includes(q))) || [q];
    return games.filter(g => {
      const gt = norm(g.title);
      if (!gt) return false;
      if (gt.includes(q) || q.includes(gt)) return true;
      return group.some(a => gt.includes(a));
    });
  }

  openEwc27ClubRoster(title) {
    const titleEl = document.getElementById("ewc27-club-modal-title");
    const bodyEl  = document.getElementById("ewc27-club-modal-body");
    if (!bodyEl) return;
    if (titleEl) titleEl.textContent = `🏆 ${title} — EWC Club Rosters`;

    const renderOrgPanel = (teamKey, label, logoSrc, themeColor, cls) => {
      const matches = this.matchTeamGamesForEwcTitle(teamKey, title);
      const rowsHtml = matches.length > 0
        ? matches.map(g => `
            <div class="ewc27-org-game-row">
              <div class="ewc27-org-game-head">
                <strong>${this.escapeHtml(g.title)}</strong>
                <span class="status-badge-highlight" style="color:${themeColor}; border-color:${themeColor}; font-size:0.75rem; padding:3px 9px;">${this.escapeHtml(g.status || "Active")}</span>
              </div>
              <div class="ewc27-org-roster-line">${this.formatRosterHtml(g.roster, themeColor)}</div>
              ${g.coach ? `<div class="ewc27-org-coach-line">🎓 Coach / Mentor: <strong>${this.escapeHtml(g.coach)}</strong></div>` : ""}
            </div>
          `).join("")
        : `<div class="ewc27-org-empty">No active ${this.escapeHtml(label)} roster listed for <strong>${this.escapeHtml(title)}</strong> yet.</div>`;

      return `
        <div class="ewc27-org-panel ${cls}">
          <div class="ewc27-org-panel-head">
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="${logoSrc}" alt="${this.escapeHtml(label)}" style="width:36px; height:36px; object-fit:contain; border-radius:8px;">
              <div>
                <h4 style="margin:0; color:${themeColor}; font-size:1.05rem; font-weight:900;">${this.escapeHtml(label)}</h4>
                <span style="font-size:0.75rem; color:#94a3b8;">${matches.length} matching roster${matches.length === 1 ? "" : "s"}</span>
              </div>
            </div>
            <button type="button" class="btn-ewc27-view-roster btn-view-${teamKey}" onclick="window.cleanHub.openTeamGameFromEwc('${teamKey}', '${this.escapeHtml(matches[0]?.title || title)}')">
              View Full Roster →
            </button>
          </div>
          <div class="ewc27-org-panel-body">${rowsHtml}</div>
        </div>
      `;
    };

    bodyEl.innerHTML = `
      <div class="ewc27-org-split">
        ${renderOrgPanel("s8ul", "S8UL Esports", "images/s8ul_logo.png", "var(--s8ul-blue)", "org-s8ul")}
        ${renderOrgPanel("godlike", "GodLike Esports", "images/godlike_logo.png", "var(--godl-gold)", "org-godlike")}
      </div>
    `;
    this.openModal("ewc27-club-roster-modal");
  }

  openTeamGameFromEwc(teamKey, filterQuery) {
    this.closeModal("ewc27-club-roster-modal");
    if (this.rosterFilter[teamKey]) {
      this.rosterFilter[teamKey].q = filterQuery || "";
      this.rosterFilter[teamKey].cat = "ALL";
    }
    const tbodyId = teamKey === "godlike" ? "godl-ewc-tbody" : "s8ul-ewc-tbody";
    const color   = teamKey === "godlike" ? "var(--godl-gold)" : "var(--s8ul-blue)";
    this.renderEWC(teamKey, tbodyId, color);
    if (teamKey === "godlike") this.showGodlike();
    else this.showS8ul();
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
          || (g.coach || "").toLowerCase().includes(q)
          || cat.toLowerCase().includes(q)
          || (g.status || "").toLowerCase().includes(q);
    });

    let html = "";

    games.forEach((g, index) => {
      const updaterName = g.updatedBy || "Pritesh Gehlot";
      const coachHtml = g.coach
        ? `<span class="coach-badge-highlight" style="--team-accent:${themeColor};">${this.escapeHtml(g.coach)}</span>`
        : `<span class="coach-empty-text">—</span>`;
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
          <td class="col-coach" data-label="Coach / Mentor">
            ${coachHtml}
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
                ${this.isAdmin ? `<button class="btn-action-delete" onclick="window.cleanHub.deleteGame('${teamKey}','${g.id}')" title="Delete Game Live (Admin)">🗑️</button>` : ""}
              </div>
            </div>
          </td>
        </tr>`;
    });

    if (games.length === 0) {
      html = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">${allGames.length === 0 ? "No EWC games listed yet." : "No matching games or players found."}</td></tr>`;
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
      this.submitPendingRequest(req, `📩 Edit request for "${ign}" submitted! It will reflect once approved by Admin.`);
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
    const addCoachInput = document.getElementById("game-coach-input");
    if (addCoachInput) addCoachInput.value = "";
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
      delBtn.style.display = this.isAdmin ? "inline-flex" : "none";
      delBtn.textContent = "🗑️ Delete Game Live";
    }

    document.getElementById("game-team-select").value = teamKey;
    document.getElementById("game-no-input").value     = game.no || 1;
    document.getElementById("game-title-input").value  = game.title || "";
    document.getElementById("game-genre-input").value  = game.genre || game.category || "";
    document.getElementById("game-roster-input").value = game.roster || "";
    const editCoachInput = document.getElementById("game-coach-input");
    if (editCoachInput) editCoachInput.value = game.coach || "";
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
    const coachEl   = document.getElementById("game-coach-input");
    const coach     = coachEl ? coachEl.value.trim() : "";
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
      const game = { no, title, genre, roster, coach, status, highlight: !!highlight, updatedBy, updatedAt };
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
      data: { no, title, genre, roster, coach, status, highlight, updatedBy, updatedAt }
    };

    this.closeModal("game-modal");
    this.submitPendingRequest(
      req,
      isNew ? `📩 New Game "${title}" sent to Admin for approval!` : `📩 Edit for "${title}" sent to Admin for approval!`
    );
  }

  handleDeleteFromGameModal() {
    if (!this.editingGameId || !this.currentGameTeam) return;
    const teamKey = this.currentGameTeam;
    const gameId = this.editingGameId;
    this.closeModal("game-modal");
    this.deleteGame(teamKey, gameId);
  }

  async deleteGame(teamKey, gameId) {
    if (!this.checkAdminAuth()) return;
    const game = (this.data[teamKey]?.ewcGames || []).find(g => g.id === gameId);
    if (!game) return;

    if (confirm(`⚠️ [ADMIN CONFIRMATION]\nAre you sure you want to permanently delete "${game.title}"?`)) {
      await this.cloudOp({ op: "deleteGame", teamKey, id: gameId }, `🗑️ Game "${game.title}" permanently deleted.`);
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
    ["req-ign","req-realname","req-role","req-game","req-desc","req-game-title","req-game-genre","req-game-roster","req-game-coach","req-delete-target","req-delete-reason"].forEach(id => {
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

    if (type.startsWith("delete_") && !this.isAdmin) {
      alert("🔒 Only Admin has access to delete items.");
      return;
    }
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
      const coachEl = document.getElementById("req-game-coach");
      const coach  = coachEl ? coachEl.value.trim() : "";
      if (!title) { alert("Please enter the game title."); return; }
      reqData = { title, genre, roster, coach };
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

    this.closeModal("request-modal");
    this.submitPendingRequest(request, "📨 Request submitted! An admin will review and accept it.");
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
