// =============================================================================
// DEFAULT ESPORTS DATASET (GodLike Esports & S8UL Esports)
// Official EWC Games & Active Rosters
// Zero Fake Profile Pictures - Pure Verified Information
// =============================================================================

const INITIAL_HUB_DATA = {
  godlike: {
    name: "GodLike Esports",
    themeColor: "var(--godl-gold)",
    ewcGames: [
      { id: "gl-g1", no: 1, title: "Fatal Fury: City of the Wolves", genre: "Fighting Game (FGC)", roster: "GodLike FGC Division", status: "EWC 2026 Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "gl-g2", no: 2, title: "EA SPORTS FC 26", genre: "Sports Simulation", roster: "Charanjot (Charanjot Singh)", status: "EWC 2026 Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "gl-g3", no: 3, title: "Teamfight Tactics (TFT)", genre: "Strategy / Auto-Battler", roster: "BrosephTFT, dehua, Deisik, Gobosteur, Ryko", status: "EWC 2026 Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "gl-g4", no: 4, title: "Street Fighter 6", genre: "Fighting Game (FGC)", roster: "GodLike FGC Division", status: "EWC 2026 Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "gl-g5", no: 5, title: "Call of Duty: Warzone", genre: "Battle Royale / FPS", roster: "GodLike Warzone Squad", status: "EWC 2026 Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "gl-g6", no: 6, title: "Tekken 8", genre: "Fighting Game (FGC)", roster: "KEISUKE", status: "EWC 2026 Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "gl-g7", no: 7, title: "PUBG Mobile World Cup (PMWC)", genre: "Mobile Battle Royale", roster: "Manya, Jonathan, Admino, Spower, Saumay, Godz", status: "Core Flagship (Grand Finalists)", highlight: true, updatedBy: "Pritesh Gehlot" },
      { id: "gl-g8", no: 8, title: "Chess", genre: "Mind Sport / Strategy", roster: "GM Hans Moke Niemann", status: "Super Grandmaster", highlight: true, updatedBy: "Pritesh Gehlot" },
      { id: "gl-g9", no: 9, title: "Trackmania", genre: "Speed Racing / Time Attack", roster: "GodLike Trackmania Division", status: "EWC 2026 Official Title", highlight: false, updatedBy: "Pritesh Gehlot" }
    ],
    divisions: [
      {
        id: "godl-bgmi",
        name: "🎮 GodLike BGMI Division",
        players: [
          { id: "gl-p1", ign: "Jonathan", role: "Star Assaulter", name: "Jonathan Jude Amaral", stat1Label: "K/D", stat1Val: "3.85", stat2Label: "STATUS", stat2Val: "Active", desc: "Legendary fragger and face of Indian mobile esports." },
          { id: "gl-p2", ign: "Manya", role: "In-Game Leader (IGL)", name: "Mohammad Raja", stat1Label: "K/D", stat1Val: "2.80", stat2Label: "STATUS", stat2Val: "Active", desc: "Champion IGL leading team rotations and zone control." },
          { id: "gl-p3", ign: "ADMINO", role: "Star Assaulter", name: "Tanishk Singh", stat1Label: "K/D", stat1Val: "3.70", stat2Label: "STATUS", stat2Val: "Active", desc: "Breakout international performer at EWC in Riyadh." },
          { id: "gl-p4", ign: "Spower", role: "Main Assaulter", name: "Rudra Banswani", stat1Label: "K/D", stat1Val: "3.45", stat2Label: "STATUS", stat2Val: "Active", desc: "Prodigious clutch specialist and raw firepower." },
          { id: "gl-p5", ign: "Godz", role: "Assaulter", name: "Meghraj Jaat", stat1Label: "K/D", stat1Val: "2.85", stat2Label: "STATUS", stat2Val: "Active", desc: "Consistent damage dealer and perimeter flanker." },
          { id: "gl-p6", ign: "Saumay", role: "Support", name: "Saumay Anand", stat1Label: "K/D", stat1Val: "2.80", stat2Label: "STATUS", stat2Val: "Active", desc: "Reliable cover fire and end-game utility." }
        ]
      },
      {
        id: "godl-codm",
        name: "🎮 Call of Duty: Mobile (CODM) Division",
        players: [
          { id: "gl-p7", ign: "Learn", role: "Captain / IGL", name: "Jash Shah", stat1Label: "K/D", stat1Val: "3.10", stat2Label: "STATUS", stat2Val: "Active", desc: "Undisputed captain dominating national and international championships." },
          { id: "gl-p8", ign: "AbhizDada", role: "Slayer", name: "Abhishek Nagar", stat1Label: "K/D", stat1Val: "3.25", stat2Label: "STATUS", stat2Val: "Active", desc: "Lethal SMG and AR slayer in aggressive hardpoint holds." },
          { id: "gl-p9", ign: "SkullGuy", role: "Main Sniper", name: "Aniket Majumdar", stat1Label: "K/D", stat1Val: "3.05", stat2Label: "STATUS", stat2Val: "Active", desc: "Deadly sniper in Search & Destroy situations." },
          { id: "gl-p10", ign: "PreVail", role: "Anchor", name: "Gaurang Palav", stat1Label: "K/D", stat1Val: "2.95", stat2Label: "STATUS", stat2Val: "Active", desc: "Tactical anchor holding hardpoint spawns and defensive angles." },
          { id: "gl-p11", ign: "Viper", role: "Support", name: "Manas Dhruv Jani", stat1Label: "K/D", stat1Val: "2.85", stat2Label: "STATUS", stat2Val: "Active", desc: "Utility and map-control specialist during clutch rounds." }
        ]
      },
      {
        id: "godl-ff",
        name: "🔥 Free Fire MAX Division",
        players: [
          { id: "gl-p12", ign: "NOBITA", role: "IGL / Rusher", name: "GodLike Free Fire", stat1Label: "ROLE", stat1Val: "Captain", stat2Label: "STATUS", stat2Val: "Active", desc: "Captain orchestrating fast-paced close-quarter entries." },
          { id: "gl-p13", ign: "NANCY", role: "Rusher", name: "GodLike Free Fire", stat1Label: "ROLE", stat1Val: "Entry Fragger", stat2Label: "STATUS", stat2Val: "Active", desc: "Explosive entry rusher securing immediate first-bloods." },
          { id: "gl-p14", ign: "MARCO", role: "Assaulter", name: "GodLike Free Fire", stat1Label: "ROLE", stat1Val: "Flanker", stat2Label: "STATUS", stat2Val: "Active", desc: "Primary damage dealer with superior recoil control." },
          { id: "gl-p15", ign: "YOGI", role: "Sniper", name: "GodLike Free Fire", stat1Label: "ROLE", stat1Val: "Long Range", stat2Label: "STATUS", stat2Val: "Active", desc: "Precision sniper picking off targets at extended distances." },
          { id: "gl-p16", ign: "ECOECO", role: "Support", name: "GodLike Free Fire", stat1Label: "ROLE", stat1Val: "Utility", stat2Label: "STATUS", stat2Val: "Active", desc: "Tactical gloo wall placement and team revives." }
        ]
      },
      {
        id: "godl-chess",
        name: "♟️ Chess Grandmaster (EWC Mind Sports)",
        players: [
          { id: "gl-p17", ign: "GM Hans Niemann", role: "Super Grandmaster", name: "Hans Moke Niemann", stat1Label: "FIDE RATING", stat1Val: "2730+", stat2Label: "STATUS", stat2Val: "Active", desc: "International Super Grandmaster representing GodLike Esports in EWC Chess." }
        ]
      }
    ]
  },
  s8ul: {
    name: "S8UL Esports",
    themeColor: "var(--s8ul-blue)",
    ewcGames: [
      { id: "s8-g1", no: 1, title: "Apex Legends", genre: "Battle Royale", roster: "Sharky (Rick Wirth), Jesko, Legacy", status: "EWC Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "s8-g2", no: 2, title: "BGMI (Team SouL)", genre: "Battle Royale", roster: "NakuL, Goblin, LEGIT, Thunder, Jokerr", status: "Flagship Team SouL", highlight: true, updatedBy: "Pritesh Gehlot" },
      { id: "s8-g3", no: 3, title: "Call of Duty: Warzone", genre: "Battle Royale", roster: "Knight (Aidan Provenzano), Clumziy, Rxul", status: "EWC Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "s8-g4", no: 4, title: "Chess (Mind Sports)", genre: "Mind Sport", roster: "GM Nihal Sarin, GM Aravindh, GM Pranesh M", status: "Super Grandmasters", highlight: true, updatedBy: "Pritesh Gehlot" },
      { id: "s8-g5", no: 5, title: "EA Sports FC", genre: "Sports Sim", roster: "Krusher (Aditya Chadha), Jonny, Fouma", status: "EWC Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "s8-g6", no: 6, title: "Fighting Games (Fatal Fury & SF6)", genre: "FGC", roster: "Closing Regent (Ansh Arora), B Haunt, Prince", status: "Talent Hunt Reps", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "s8-g7", no: 7, title: "Fortnite", genre: "Battle Royale", roster: "Faded (David Ciubotariu), Kaan (Kaan Tafli)", status: "EWC Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "s8-g8", no: 8, title: "Honor of Kings", genre: "MOBA", roster: "Darkness, Meruem, Xtreme, Kyurem, Kong", status: "EWC Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "s8-g9", no: 9, title: "MOBA Legends 5v5 (MLBB)", genre: "MOBA", roster: "Bobe (Bikash Tamang), Radium, Anti, J, Apex", status: "EWC Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "s8-g10", no: 10, title: "Tekken 8", genre: "FGC", roster: "Tetsu (Akhil Kakar), Soul, AK Arhaan", status: "EWC Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "s8-g11", no: 11, title: "Trackmania", genre: "Speed Racing", roster: "Whizzy (Alexander Page), Spark, Neal", status: "EWC Official Title", highlight: false, updatedBy: "Pritesh Gehlot" },
      { id: "s8-g12", no: 12, title: "PUBG: Battlegrounds", genre: "Battle Royale", roster: "Team Question Mark Partnership", status: "Club Partner Title", highlight: false, updatedBy: "Pritesh Gehlot" }
    ],
    divisions: [
      {
        id: "s8ul-soul",
        name: "🎮 Team SouL (BGMI Division)",
        players: [
          { id: "s8-p1", ign: "NakuL", role: "IGL", name: "Nakul Sharma", stat1Label: "K/D", stat1Val: "2.85", stat2Label: "STATUS", stat2Val: "Active", desc: "Tactical IGL orchestrating macro rotations for Team SouL." },
          { id: "s8-p2", ign: "Goblin", role: "Star Assaulter", name: "Harsh Paudwal", stat1Label: "K/D", stat1Val: "3.52", stat2Label: "STATUS", stat2Val: "Active", desc: "Decorated aggressive assaulter with explosive mechanics." },
          { id: "s8-p3", ign: "LEGIT", role: "Finisher", name: "Yash Choudhary", stat1Label: "K/D", stat1Val: "2.98", stat2Label: "STATUS", stat2Val: "Active", desc: "Clutch specialist with razor-sharp recoil control." },
          { id: "s8-p4", ign: "Thunder", role: "Support", name: "Aaryaman Seth", stat1Label: "K/D", stat1Val: "2.70", stat2Label: "STATUS", stat2Val: "Active", desc: "Backbone providing tactical smoke screens and support." },
          { id: "s8-p5", ign: "Jokerr", role: "Flex", name: "Khush Singh", stat1Label: "K/D", stat1Val: "2.75", stat2Label: "STATUS", stat2Val: "Active", desc: "Versatile fragger adept at perimeter control." }
        ]
      },
      {
        id: "s8ul-chess",
        name: "♟️ S8UL Chess Division (Super Grandmasters)",
        players: [
          { id: "s8-p6", ign: "GM Nihal Sarin", role: "Super Grandmaster", name: "Nihal Sarin", stat1Label: "FIDE RATING", stat1Val: "2680+", stat2Label: "STATUS", stat2Val: "Active", desc: "World-class Indian chess prodigy representing S8UL at EWC." },
          { id: "s8-p7", ign: "GM Pranesh M", role: "Grandmaster", name: "Pranesh M", stat1Label: "FIDE RATING", stat1Val: "2600+", stat2Label: "STATUS", stat2Val: "Active", desc: "India's 79th Grandmaster and tactical calculation specialist." },
          { id: "s8-p8", ign: "GM Aravindh", role: "Grandmaster", name: "Aravindh Chithambaram", stat1Label: "FIDE RATING", stat1Val: "2700+", stat2Label: "STATUS", stat2Val: "Active", desc: "Reigning national champion and top international grandmaster." }
        ]
      }
    ]
  },
  ewc27Meta: {
    title: "EWC27 Games",
    subtitle: "Every game brings a new battle to the global stage. Keep watch here as we reveal the games that will set the stage for our next chapter."
  },
  ewc27Games: [
    { id: "e27-1", title: "COUNTER STRIKE 2", genre: "Tactical FPS", sub: "Valve", isNewlyAdded: false },
    { id: "e27-2", title: "VALORANT", genre: "Hero Tactical Shooter", sub: "Riot Games", isNewlyAdded: false },
    { id: "e27-3", title: "FATAL FURY", genre: "Fighting Game (FGC)", sub: "City of the Wolves", isNewlyAdded: false },
    { id: "e27-4", title: "CHESS", genre: "Mind Sport / Strategy", sub: "Classical & Blitz", isNewlyAdded: false },
    { id: "e27-5", title: "DOTA 2", genre: "MOBA", sub: "Valve", isNewlyAdded: false },
    { id: "e27-6", title: "LEAGUE OF LEGENDS", genre: "MOBA", sub: "Riot Games", isNewlyAdded: false },
    { id: "e27-7", title: "TEKKEN 8", genre: "Fighting Game (FGC)", sub: "Bandai Namco", isNewlyAdded: false },
    { id: "e27-8", title: "PUBG MOBILE / BGMI", genre: "Battle Royale", sub: "Krafton", isNewlyAdded: false },
    { id: "e27-9", title: "APEX LEGENDS", genre: "Battle Royale / Hero", sub: "Respawn", isNewlyAdded: false },
    { id: "e27-10", title: "EA SPORTS FC", genre: "Sports Simulation", sub: "EA Sports", isNewlyAdded: false }
  ],
  dailyUpdates: []
};

const INITIAL_DAILY_UPDATES = [];
