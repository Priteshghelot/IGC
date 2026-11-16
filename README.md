# 🏆 India x EWC Hub | S8UL & GodLike Esports Official Tracker

Official esports web application tracking India's premier **Esports World Cup (EWC) Club Partner** organizations:
- **S8UL Esports** (Team SouL BGMI, Pokemon Unite, 2-Year Consecutive Partner Club)
- **GodLike Esports** (BGMI, Call of Duty Mobile, EWC PMWC Grand Finalists)

---

## 🌟 Key Features

1. **EWC Club Partner Program Spotlight**:
   - Covers the $20,000,000 global EWC Club Support funding program where **S8UL** and **GodLike** represent India among only 40 elite clubs globally.
   - Highlights of GodLike's historic PMWC Grand Finals run in Boulevard Riyadh City and S8UL's Club Championship campaign.

2. **Active Multi-Title Lineups**:
   - **S8UL**: Nakul (IGL), Goblin (Star Assaulter), Legit, Thunder, Rony, Coach Mayavi, Mortal, Snow (Pokemon Unite).
   - **GodLike**: Manya (IGL), Admino (Star Assaulter / Fragger), Spower, Saumay, Godz, Mentor Ghatak, Learn (CODM), Kronten.
   - Real-time player stats: K/D ratios, role badges, fav weapons, and interactive athlete modals.

3. **Live X (Twitter) & Official Handles Stream**:
   - Filterable stream tracking verified posts directly from `@S8UL_esports` and `@GodLike_in`.
   - Authentic embedded card design with verified badges, metrics, and media photos.

4. **In-Browser Publishing Studio (Live CMS)**:
   - **Post Official Announcements**: Add new tweets, PR updates, and bootcamp photos on the fly.
   - **Update Lineup**: Add new players or modify existing active rosters as transfer news breaks.
   - **Record EWC Match Results**: Log scores, MVPs, and maps.
   - **Persistent Storage**: All changes persist in `localStorage` across page refreshes.
   - **Export / Import**: Easily export data as JSON or restore defaults with one click.

5. **El Clásico Derby Matrix**:
   - S8UL vs GodLike head-to-head comparison with firepower, tactical zone play, clutch ratings, and trophies.

6. **Cyberpunk & Riyadh EWC Theme**:
   - Ultra-sleek glassmorphism, responsive grid for mobile & desktop, and synthesized cyber audio sound effects (Web Audio API).

---

## 🚀 How to Run the Website

### Option 1: Using Node.js (Recommended)
In the project directory, run:
```bash
npm start
```
Then open your browser at:
`http://localhost:3000`

### Option 2: Direct Browser Launch
Simply double-click or open `index.html` in Google Chrome, Microsoft Edge, or any modern web browser! Zero build setup required.

---

## 📁 Directory Structure
```
├── index.html          # Main application page
├── server.js           # Lightweight zero-dependency Node static server
├── package.json        # Project metadata and start script
├── README.md           # Documentation
├── css/
│   └── style.css       # Esports & Riyadh EWC styling
└── js/
    ├── data.js         # Official data for S8UL & GodLike, EWC, and posts
    └── app.js          # App state, rendering, sound, and CMS logic
```
