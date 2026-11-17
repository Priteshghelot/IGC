// =============================================================================
// SERVER-SIDE ATOMIC OPERATIONS
// Every change is applied on the server to the LATEST database copy.
// Browsers never upload the whole database anymore, so a stale browser tab
// (old localStorage) can never bring back deleted rows or undo edits.
// =============================================================================

const DATA_KEY = 'igc:hub_data';
const REQ_KEY = 'igc:pending_requests';

const today = () =>
  new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const norm = (s) => String(s || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();

function ensureTeam(data, teamKey) {
  if (!teamKey || !['godlike', 's8ul'].includes(teamKey)) throw new Error('Invalid team');
  if (!data[teamKey]) data[teamKey] = {};
  if (!Array.isArray(data[teamKey].ewcGames)) data[teamKey].ewcGames = [];
  if (!Array.isArray(data[teamKey].divisions)) data[teamKey].divisions = [];
  return data[teamKey];
}

const sortGames = (games) => games.sort((a, b) => (a.no || 0) - (b.no || 0));
const nextNo = (games) => (games.length ? Math.max(...games.map(g => g.no || 0)) + 1 : 1);

function cleanGame(g, fallback = {}) {
  return {
    id: g.id || fallback.id || 'game-' + Date.now(),
    no: Number.isFinite(+g.no) && +g.no > 0 ? +g.no : fallback.no,
    title: String(g.title || fallback.title || '').trim(),
    genre: String(g.genre ?? g.category ?? fallback.genre ?? ''),
    roster: String(g.roster ?? fallback.roster ?? ''),
    status: String(g.status || fallback.status || 'EWC 2026 Official Title'),
    highlight: g.highlight !== undefined ? !!g.highlight : !!fallback.highlight,
    updatedBy: String(g.updatedBy || fallback.updatedBy || 'Admin'),
    updatedAt: g.updatedAt || today()
  };
}

// Returns a short message describing what happened. Throws on invalid input.
function applyOp(data, op) {
  switch (op && op.op) {
    case 'addGame': {
      const team = ensureTeam(data, op.teamKey);
      if (!op.game || !String(op.game.title || '').trim()) throw new Error('Game title required');
      const g = cleanGame({ ...op.game, id: 'game-' + Date.now() }, { no: nextNo(team.ewcGames) });
      team.ewcGames.push(g);
      sortGames(team.ewcGames);
      return `Added "${g.title}"`;
    }
    case 'updateGame': {
      // Only edits an EXISTING row. Never re-creates a deleted game.
      const team = ensureTeam(data, op.teamKey);
      const idx = team.ewcGames.findIndex(g => g.id === op.id);
      if (idx === -1) throw new Error('This game no longer exists (it was deleted). Nothing was changed.');
      team.ewcGames[idx] = cleanGame({ ...op.game, id: op.id }, team.ewcGames[idx]);
      sortGames(team.ewcGames);
      return `Updated "${team.ewcGames.find(g => g.id === op.id).title}"`;
    }
    case 'deleteGame': {
      const team = ensureTeam(data, op.teamKey);
      const before = team.ewcGames.length;
      if (op.id && team.ewcGames.some(g => g.id === op.id)) {
        team.ewcGames = team.ewcGames.filter(g => g.id !== op.id);
      } else if (op.title) {
        team.ewcGames = team.ewcGames.filter(g => norm(g.title) !== norm(op.title));
      }
      const removed = before - team.ewcGames.length;
      if (!removed) throw new Error('No matching game found to delete.');
      team.ewcGames.forEach((g, i) => { g.no = i + 1; }); // keep numbering clean
      return `Deleted ${removed} game(s)`;
    }
    case 'savePlayer': {
      const team = ensureTeam(data, op.teamKey);
      const p = op.player || {};
      if (!String(p.ign || '').trim()) throw new Error('Player IGN required');
      let div = null;
      if (op.newDivisionName) {
        div = team.divisions.find(d => norm(d.name) === norm(op.newDivisionName));
        if (!div) { div = { id: 'div-' + Date.now(), name: op.newDivisionName.trim(), players: [] }; team.divisions.push(div); }
      } else {
        div = team.divisions.find(d => d.id === op.divisionId);
      }
      if (!div) throw new Error('Lineup not found');
      const id = p.id || 'p-' + Date.now();
      if (p.id) {
        const exists = team.divisions.some(d => (d.players || []).some(x => x.id === p.id));
        if (!exists) throw new Error('This player no longer exists (it was deleted). Nothing was changed.');
        team.divisions.forEach(d => { d.players = (d.players || []).filter(x => x.id !== p.id); });
      }
      div.players = div.players || [];
      div.players.push({
        id, ign: p.ign.trim(), name: p.name || '', role: p.role || '',
        stat1Label: p.stat1Label || 'ROLE', stat1Val: p.stat1Val || '-',
        stat2Label: 'STATUS', stat2Val: p.stat2Val || 'Active', desc: p.desc || ''
      });
      return `Saved player "${p.ign}"`;
    }
    case 'deletePlayer': {
      const team = ensureTeam(data, op.teamKey);
      let removed = 0;
      team.divisions.forEach(d => {
        const before = (d.players || []).length;
        d.players = (d.players || []).filter(x => {
          if (op.id && x.id === op.id) return false;
          if (op.name && (norm(x.ign) === norm(op.name) || norm(x.name) === norm(op.name))) return false;
          return true;
        });
        removed += before - d.players.length;
      });
      if (!removed) throw new Error('No matching player found to delete.');
      return `Deleted ${removed} player(s)`;
    }
    case 'deleteDivision': {
      const team = ensureTeam(data, op.teamKey);
      const before = team.divisions.length;
      team.divisions = team.divisions.filter(d => !((op.id && d.id === op.id) || (op.name && norm(d.name) === norm(op.name))));
      if (before === team.divisions.length) throw new Error('No matching lineup found to delete.');
      return 'Lineup deleted';
    }
    case 'saveEwc27Game': {
      if (!Array.isArray(data.ewc27Games)) data.ewc27Games = [];
      const g = op.game || {};
      if (!String(g.title || '').trim()) throw new Error('Title required');
      if (g.id) {
        const item = data.ewc27Games.find(x => x.id === g.id);
        if (!item) throw new Error('This EWC27 game no longer exists.');
        Object.assign(item, { title: g.title, genre: g.genre || '', sub: g.sub || '', isNewlyAdded: !!g.isNewlyAdded });
      } else {
        data.ewc27Games.push({ id: 'e27-' + Date.now(), title: g.title, genre: g.genre || '', sub: g.sub || '', isNewlyAdded: g.isNewlyAdded !== false });
      }
      return 'EWC27 games updated';
    }
    case 'setEwc27Meta': {
      data.ewc27Meta = { title: String(op.meta?.title || 'EWC27 Games'), subtitle: String(op.meta?.subtitle || '') };
      return 'EWC27 text updated';
    }
    case 'saveThirdPartyTournament': {
      if (!Array.isArray(data.thirdPartyTournaments)) {
        data.thirdPartyTournaments = Array.isArray(op.seedList) ? op.seedList : [];
      }
      const t = op.tournament || {};
      if (!String(t.title || '').trim() || !String(t.startDate || '').trim()) {
        throw new Error('Tournament title and start date are required');
      }
      const cleanT = {
        id: t.id || 'tp-' + Date.now(),
        title: String(t.title).trim(),
        game: String(t.game || 'Esports').trim(),
        organizer: String(t.organizer || 'Community / 3rd Party').trim(),
        startDate: String(t.startDate).trim(),
        endDate: String(t.endDate || t.startDate).trim(),
        prize: String(t.prize || 'TBA').trim(),
        location: String(t.location || 'India').trim(),
        teams: String(t.teams || 'Open / Invited Indian Squads').trim(),
        updatedBy: String(t.updatedBy || 'Admin').trim(),
        updatedAt: t.updatedAt || today()
      };
      if (t.id) {
        const idx = data.thirdPartyTournaments.findIndex(x => x.id === t.id);
        if (idx !== -1) {
          data.thirdPartyTournaments[idx] = cleanT;
        } else {
          data.thirdPartyTournaments.push(cleanT);
        }
      } else {
        data.thirdPartyTournaments.push(cleanT);
      }
      data.thirdPartyTournaments.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
      return `Saved tournament "${cleanT.title}"`;
    }
    case 'deleteThirdPartyTournament': {
      if (!Array.isArray(data.thirdPartyTournaments)) {
        data.thirdPartyTournaments = Array.isArray(op.seedList) ? op.seedList : [];
      }
      const before = data.thirdPartyTournaments.length;
      data.thirdPartyTournaments = data.thirdPartyTournaments.filter(x => {
        if (op.id && x.id === op.id) return false;
        if (op.title && norm(x.title) === norm(op.title)) return false;
        return true;
      });
      if (data.thirdPartyTournaments.length === before) throw new Error('Tournament not found to delete.');
      return 'Tournament deleted';
    }
    default:
      throw new Error('Unknown operation');
  }
}

// Convert an approved community request into an operation.
function requestToOp(req) {
  const d = req.data || {};
  switch (req.type) {
    case 'edit_game':
      if (!req.targetId) return { op: 'addGame', teamKey: req.teamKey, game: { ...d, updatedBy: d.updatedBy || req.submittedBy } };
      return { op: 'updateGame', teamKey: req.teamKey, id: req.targetId, game: { ...d, updatedBy: d.updatedBy || req.submittedBy } };
    case 'game':
      return { op: 'addGame', teamKey: req.teamKey, game: { ...d, updatedBy: d.updatedBy || req.submittedBy } };
    case 'delete_game':
      return { op: 'deleteGame', teamKey: req.teamKey, id: req.targetId || null, title: d.target || req.targetName };
    case 'delete_player':
      return { op: 'deletePlayer', teamKey: req.teamKey, id: req.targetId || null, name: d.target || req.targetName };
    case 'delete_lineup':
      return { op: 'deleteDivision', teamKey: req.teamKey, id: req.targetId || null, name: d.target || req.targetName };
    case 'edit_player':
      return { op: 'savePlayer', teamKey: req.teamKey, divisionId: d.divisionId, player: { ...d, id: req.targetId } };
    case 'player':
      return { op: 'savePlayer', teamKey: req.teamKey, newDivisionName: 'Community Submissions',
        player: { ign: d.ign, name: d.name, role: d.role, stat1Label: 'GAME', stat1Val: d.game || '-', desc: d.desc } };
    case 'ewc27_game':
      return { op: 'saveEwc27Game', game: { id: req.targetId || null, title: d.title, genre: d.genre, sub: d.sub, isNewlyAdded: true } };
    case 'ewc27_text':
      return { op: 'setEwc27Meta', meta: d };
    case 'thirdparty_tournament':
      return { op: 'saveThirdPartyTournament', tournament: { ...d, id: req.targetId || d.id || null, updatedBy: d.updatedBy || req.submittedBy }, seedList: req.seedList };
    case 'delete_thirdparty_tournament':
      return { op: 'deleteThirdPartyTournament', id: req.targetId || null, title: d.target || req.targetName, seedList: req.seedList };
    default:
      return null; // e.g. daily_post: approval only, no data change
  }
}

async function readJSON(redis, key, fallback) {
  const raw = await redis.get(key);
  return raw ? JSON.parse(raw) : fallback;
}

module.exports = { DATA_KEY, REQ_KEY, applyOp, requestToOp, readJSON };
