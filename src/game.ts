export const COLORS = ['red', 'blue', 'green', 'yellow'] as const;
export type TileColor = (typeof COLORS)[number];
export type Tile = {
  id: string;
  color: TileColor | null;
  value: number;
  kind: 'number' | 'joker';
};
export type MeldKind = 'leg' | 'run';
export type Meld = { id: string; kind: MeldKind; tiles: Tile[]; team: number };
export type Player = {
  id: number;
  name: string;
  team: number;
  hand: Tile[];
  deadTaken: boolean;
  indirectDead: boolean;
  playedAfterDead: boolean;
};
export type Target = 'cut' | 2000 | 3000 | 5000;
export type GameState = {
  stock: Tile[];
  discard: Tile[];
  deadPiles: Tile[][];
  players: Player[];
  melds: Meld[];
  scores: number[];
  currentPlayer: number;
  roundStarter: number;
  target: Target;
  phase: 'draw' | 'play' | 'round-over' | 'match-over';
  winner: number | null;
  result: string | null;
  round: number;
  turnNumber: number;
};

const RUN_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];
const isWild = (tile: Tile) => tile.kind === 'joker' || tile.value === 2;

function canFormRun(tiles: Tile[], allowWilds = true): boolean {
  if (tiles.length > RUN_VALUES.length) return false;
  for (const color of COLORS) {
    for (let start = 0; start <= RUN_VALUES.length - tiles.length; start += 1) {
      const positions = RUN_VALUES.slice(start, start + tiles.length);
      const used = new Set<string>();
      const assign = (index: number, wilds: number): boolean => {
        if (index === positions.length) return true;
        const value = positions[index];
        for (const tile of tiles) {
          if (used.has(tile.id)) continue;
          const natural = tile.kind === 'number' && tile.color === color && tile.value === value;
          if (natural) {
            used.add(tile.id);
            if (assign(index + 1, wilds)) return true;
            used.delete(tile.id);
          }
          if (!natural && allowWilds && isWild(tile) && wilds < 1) {
            used.add(tile.id);
            if (assign(index + 1, wilds + 1)) return true;
            used.delete(tile.id);
          }
        }
        return false;
      };
      if (assign(0, 0)) return true;
    }
  }
  return false;
}

function canFormLeg(tiles: Tile[], allowWilds = true): boolean {
  if (tiles.length > COLORS.length) return false;
  for (let value = 1; value <= 13; value += 1) {
    const used = new Set<TileColor>();
    let wilds = 0;
    let valid = true;
    for (const tile of tiles) {
      if (tile.kind === 'joker') {
        if (!allowWilds) {
          valid = false;
          break;
        }
        wilds += 1;
        continue;
      }
      if (tile.value === value && tile.color !== null && !used.has(tile.color)) {
        used.add(tile.color);
        continue;
      }
      if (tile.value === 2) {
        if (!allowWilds) {
          valid = false;
          break;
        }
        wilds += 1;
        continue;
      }
      valid = false;
      break;
    }
    if (valid && wilds <= 1 && used.size + wilds === tiles.length) return true;
  }
  return false;
}

export function getMeldKind(tiles: Tile[]): MeldKind | null {
  if (tiles.length < 3 || new Set(tiles.map((tile) => tile.id)).size !== tiles.length) return null;
  if (canFormLeg(tiles)) return 'leg';
  if (canFormRun(tiles)) return 'run';
  return null;
}

export function isCanasta(meld: Meld): boolean {
  return meld.tiles.length >= 7;
}

export function isCleanMeld(meld: Meld): boolean {
  return canFormLeg(meld.tiles, false) || canFormRun(meld.tiles, false);
}

export function tilePoints(tile: Tile): number {
  if (tile.kind === 'joker') return 50;
  if (tile.value === 1) return 15;
  if (tile.value === 2) return 20;
  return tile.value <= 7 ? 5 : 10;
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => {
    const colorOrder = COLORS.indexOf(a.color ?? 'yellow') - COLORS.indexOf(b.color ?? 'yellow');
    return colorOrder || a.value - b.value || a.id.localeCompare(b.id);
  });
}

function createDeck(): Tile[] {
  const tiles: Tile[] = [];
  for (let copy = 0; copy < 2; copy += 1) {
    for (const color of COLORS) {
      for (let value = 1; value <= 13; value += 1) {
        tiles.push({ id: `${color}-${value}-${copy}`, color, value, kind: 'number' });
      }
    }
  }
  tiles.push(
    { id: 'joker-a', color: null, value: 0, kind: 'joker' },
    { id: 'joker-b', color: null, value: 0, kind: 'joker' },
  );
  return tiles;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createGame(target: Target = 2000, random = Math.random, scores = [0, 0], round = 1, starter = 0): GameState {
  const deck = shuffle(createDeck(), random);
  const players: Player[] = [0, 1].map((id) => ({
    id,
    name: id === 0 ? 'Vos' : 'La computadora',
    team: id,
    hand: deck.splice(0, 11),
    deadTaken: false,
    indirectDead: false,
    playedAfterDead: false,
  }));
  return {
    stock: deck.slice(22),
    discard: [],
    deadPiles: [deck.slice(0, 11), deck.slice(11, 22)],
    players,
    melds: [],
    scores: [...scores],
    currentPlayer: starter,
    roundStarter: starter,
    target,
    phase: 'draw',
    winner: null,
    result: null,
    round,
    turnNumber: 0,
  };
}

function playerFor(state: GameState, playerId = state.currentPlayer): Player {
  const player = state.players[playerId];
  if (!player) throw new Error('No existe ese jugador.');
  return player;
}

function assertTurn(state: GameState, playerId: number, phase: GameState['phase']): Player {
  if (state.phase !== phase || state.currentPlayer !== playerId) throw new Error('No es el momento de esa jugada.');
  return playerFor(state, playerId);
}

function replacePlayer(state: GameState, updated: Player): GameState {
  const players = [...state.players];
  players[updated.id] = updated;
  return { ...state, players };
}

export function drawFromStock(state: GameState, playerId: number): GameState {
  const player = assertTurn(state, playerId, 'draw');
  if (state.stock.length === 0) throw new Error('El montón está vacío; levantá el pozo o terminá la mano.');
  const stock = [...state.stock];
  const tile = stock.pop()!;
  return { ...replacePlayer(state, { ...player, hand: [...player.hand, tile] }), stock, phase: 'play' };
}

export function takeDiscardPile(state: GameState, playerId: number): GameState {
  const player = assertTurn(state, playerId, 'draw');
  if (state.discard.length === 0) throw new Error('El pozo está vacío.');
  if (player.hand.length + state.discard.length < 5) throw new Error('Necesitás reunir cinco fichas entre el atril y el pozo.');
  return {
    ...replacePlayer(state, { ...player, hand: [...player.hand, ...state.discard] }),
    discard: [],
    phase: 'play',
  };
}

function removeFromHand(hand: Tile[], ids: string[]): Tile[] {
  const wanted = new Set(ids);
  if (wanted.size !== ids.length || ids.some((id) => !hand.some((tile) => tile.id === id))) {
    throw new Error('Seleccioná fichas que estén en tu atril.');
  }
  return hand.filter((tile) => !wanted.has(tile.id));
}

function teamHasCanasta(state: GameState, team: number, extraMelds: Meld[] = []): boolean {
  return [...state.melds, ...extraMelds].some((meld) => meld.team === team && isCanasta(meld));
}

function takeDeadIfNeeded(state: GameState, player: Player, indirect: boolean): { state: GameState; player: Player } {
  const teamTaken = state.players.some((member) => member.team === player.team && member.deadTaken);
  if (teamTaken) return { state, player };
  const deadIndex = player.team;
  const dead = state.deadPiles[deadIndex];
  if (!dead?.length) return { state, player };
  const deadPiles = [...state.deadPiles];
  deadPiles[deadIndex] = [];
  return {
    state: { ...state, deadPiles },
    player: {
      ...player,
      hand: indirect ? player.hand : [...player.hand, ...dead],
      deadTaken: true,
      indirectDead: indirect,
      playedAfterDead: false,
    },
  };
}

function scoreRound(state: GameState, closureWinner: number | null): GameState {
  const handScores = [0, 0];
  for (const team of [0, 1]) {
    const hasCanasta = teamHasCanasta(state, team);
    const meldPoints = state.melds
      .filter((meld) => meld.team === team)
      .reduce((sum, meld) => sum + meld.tiles.reduce((meldSum, tile) => meldSum + tilePoints(tile), 0), 0);
    const canastaBonus = state.melds
      .filter((meld) => meld.team === team && isCanasta(meld))
      .reduce((sum, meld) => sum + (isCleanMeld(meld) ? 200 : 100), 0);
    const ignoredHandPlayer = state.players.find((member) => member.team === team && member.indirectDead && !member.playedAfterDead);
    const handPoints = state.players
      .filter((player) => player.team === team && player.id !== ignoredHandPlayer?.id)
      .flatMap((player) => player.hand)
      .reduce((sum, tile) => sum + tilePoints(tile), 0);
    const player = state.players.find((member) => member.team === team && member.deadTaken)
      ?? state.players.find((member) => member.team === team)!;
    const deadBonus = player.deadTaken
      ? player.indirectDead && !player.playedAfterDead ? -100 : 100
      : -100;
    const closureBonus = closureWinner !== null && state.players[closureWinner].team === team ? 100 : 0;
    handScores[team] = (hasCanasta ? meldPoints + canastaBonus - handPoints : -meldPoints - handPoints) + deadBonus + closureBonus;
  }
  if (state.target === 'cut') {
    return closureWinner === null
      ? { ...state, phase: 'match-over', winner: null, result: 'Se agotaron las fichas sin que nadie pudiera cerrar.' }
      : { ...state, phase: 'match-over', winner: closureWinner, result: `¡${state.players[closureWinner].name} cortó la mano!` };
  }
  const scores = state.scores.map((score, team) => score + handScores[team]);
  const targetScore = typeof state.target === 'number' ? state.target : Number.POSITIVE_INFINITY;
  const reached = scores.map((score) => score >= targetScore);
  let matchWinner: number | null = null;
  let result: string | null = null;
  if (reached[0] && reached[1]) {
    matchWinner = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;
    result = matchWinner === null ? 'La partida termina en empate.' : `¡${state.players[matchWinner].name} gana por puntaje!`;
  } else if (reached[0] || reached[1]) {
    matchWinner = reached[0] ? 0 : 1;
    result = `¡${state.players[matchWinner].name} alcanza el objetivo!`;
  }
  return {
    ...state,
    scores,
    phase: result ? 'match-over' : 'round-over',
    winner: matchWinner,
    result: result ?? 'Terminó la mano.',
  };
}

function closeRound(state: GameState, winner: number): GameState {
  return scoreRound(state, winner);
}

function afterHandEmpties(state: GameState, player: Player, nextHand: Tile[]): GameState {
  let next = { ...state, players: [...state.players] };
  let updated = { ...player, hand: nextHand };
  const teamTaken = state.players.some((member) => member.team === player.team && member.deadTaken);
  if (!teamTaken && state.deadPiles[player.team]?.length) {
    const received = takeDeadIfNeeded(next, updated, false);
    next = received.state;
    updated = received.player;
  } else if (teamHasCanasta(next, player.team)) {
    next = replacePlayer(next, updated);
    return closeRound(next, player.id);
  } else {
    throw new Error('Para cerrar necesitás una canasta de tu equipo.');
  }
  return replacePlayer({ ...next, phase: 'play' }, updated);
}

export function layMeld(state: GameState, playerId: number, tileIds: string[]): GameState {
  const player = assertTurn(state, playerId, 'play');
  const tiles = player.hand.filter((tile) => tileIds.includes(tile.id));
  if (tiles.length !== tileIds.length) throw new Error('Seleccioná fichas que estén en tu atril.');
  const kind = getMeldKind(tiles);
  if (!kind) throw new Error('Esa combinación no es válida.');
  const meld: Meld = { id: `meld-${state.round}-${state.melds.length}`, kind, tiles, team: player.team };
  let next = { ...state, melds: [...state.melds, meld] };
  const remaining = removeFromHand(player.hand, tileIds);
  const updated = { ...player, hand: remaining, playedAfterDead: player.deadTaken ? true : player.playedAfterDead };
  if (remaining.length === 0) return afterHandEmpties(next, updated, remaining);
  return replacePlayer(next, updated);
}

export function addToMeld(state: GameState, playerId: number, meldId: string, tileIds: string[]): GameState {
  const player = assertTurn(state, playerId, 'play');
  const index = state.melds.findIndex((meld) => meld.id === meldId);
  const meld = state.melds[index];
  if (!meld || meld.team !== player.team) throw new Error('Solo podés agregar a juegos de tu equipo.');
  const added = player.hand.filter((tile) => tileIds.includes(tile.id));
  if (added.length !== tileIds.length || added.length === 0) throw new Error('Seleccioná fichas de tu atril.');
  const tiles = [...meld.tiles, ...added];
  if (getMeldKind(tiles) !== meld.kind) throw new Error('Las fichas no encajan en ese juego.');
  const melds = [...state.melds];
  melds[index] = { ...meld, tiles };
  const remaining = removeFromHand(player.hand, tileIds);
  const updated = { ...player, hand: remaining, playedAfterDead: player.deadTaken ? true : player.playedAfterDead };
  const next = { ...state, melds };
  if (remaining.length === 0) return afterHandEmpties(next, updated, remaining);
  return replacePlayer(next, updated);
}

export function discardTile(state: GameState, playerId: number, tileId: string): GameState {
  const player = assertTurn(state, playerId, 'play');
  const hand = removeFromHand(player.hand, [tileId]);
  const tile = player.hand.find((item) => item.id === tileId)!;
  const discard = [...state.discard, tile];
  let next: GameState = { ...state, discard, phase: 'draw', turnNumber: state.turnNumber + 1 };
  let updated = { ...player, hand };
  if (hand.length === 0) {
    const teamTaken = state.players.some((member) => member.team === player.team && member.deadTaken);
    if (!teamTaken && state.deadPiles[player.team]?.length) {
      const received = takeDeadIfNeeded(next, updated, true);
      next = received.state;
      updated = received.player;
    } else if (teamHasCanasta(next, player.team)) {
      next = replacePlayer(next, updated);
      return closeRound(next, player.id);
    } else {
      throw new Error('Para cerrar necesitás una canasta de tu equipo.');
    }
  }
  next = replacePlayer(next, updated);
  return { ...next, currentPlayer: (playerId + 1) % state.players.length };
}

export function finishEmptyStock(state: GameState, playerId: number): GameState {
  assertTurn(state, playerId, 'draw');
  if (state.stock.length > 0) throw new Error('Todavía quedan fichas en el montón.');
  return scoreRound(state, null);
}

export function nextRound(state: GameState): GameState {
  if (state.phase !== 'round-over') throw new Error('La partida no está lista para una nueva mano.');
  return createGame(state.target, Math.random, state.scores, state.round + 1, (state.roundStarter + 1) % 2);
}

export function findBestMeld(hand: Tile[]): Tile[] | null {
  let best: Tile[] | null = null;
  let bestValue = 0;
  const selected: Tile[] = [];
  const search = (start: number) => {
    if (selected.length >= 3) {
      const kind = getMeldKind(selected);
      if (kind) {
        const value = selected.length * 10 + (selected.length >= 7 ? 100 : 0) + (kind === 'run' ? 2 : 0);
        if (value > bestValue) {
          best = [...selected];
          bestValue = value;
        }
      }
    }
    if (selected.length === hand.length) return;
    for (let index = start; index < hand.length; index += 1) {
      selected.push(hand[index]);
      search(index + 1);
      selected.pop();
    }
  };
  search(0);
  return best;
}

export function chooseDiscard(hand: Tile[]): Tile {
  const score = (tile: Tile) => {
    const sameValue = hand.filter((other) => other.id !== tile.id && other.kind === 'number' && other.value === tile.value).length;
    const sameRun = tile.kind === 'number'
      ? hand.filter((other) => other.id !== tile.id && other.color === tile.color && Math.abs(other.value - tile.value) <= 2).length
      : 0;
    return (tile.kind === 'joker' ? 100 : tile.value === 2 ? 80 : 0) + sameValue * 12 + sameRun * 8 - tilePoints(tile);
  };
  return [...hand].sort((a, b) => score(a) - score(b))[0];
}