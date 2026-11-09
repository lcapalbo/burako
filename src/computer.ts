import {
  addToMeld,
  chooseDiscard,
  discardTile,
  drawFromStock,
  findBestMeld,
  finishEmptyStock,
  getMeldKind,
  keepOpeningDraw,
  layMeld,
  takeDiscardPile,
  GameRuleError,
  type GameState,
  type Tile,
} from './game.js';
import { logGameDebug, summarizeGameState } from './diagnostics.js';

function canCompleteWithDiscard(hand: Tile[], discard: Tile[]): boolean {
  for (const tile of discard.slice(-4)) {
    for (let first = 0; first < hand.length; first += 1) {
      for (let second = first + 1; second < hand.length; second += 1) {
        if (getMeldKind([tile, hand[first], hand[second]])) return true;
      }
    }
  }
  return false;
}

function mayExtendMeld(meld: GameState['melds'][number], tile: Tile): boolean {
  if (tile.kind === 'joker' || tile.value === 2) return true;
  return meld.tiles.some((existing) => existing.kind === 'number' && (
    meld.kind === 'leg' ? existing.value === tile.value : existing.color === tile.color
  ));
}

function tryRuleAction(action: () => GameState): GameState | null {
  try {
    return action();
  } catch (error) {
    if (error instanceof GameRuleError) return null;
    throw error;
  }
}

function leavesOnlyRestrictedTile(state: GameState): boolean {
  if (state.phase !== 'play' || state.currentPlayer !== 1 || state.players[1].hand.length !== 1) return false;
  return state.players[1].hand[0].id === state.restrictedDiscardTileId;
}

export function runComputerTurnSteps(state: GameState): GameState[] {
  let next = state;
  const steps: GameState[] = [];
  logGameDebug('computer:turn-start', { state: summarizeGameState(state) });
  const applyAction = (description: string, action: (current: GameState) => GameState) => {
    next = action(next);
    steps.push(next);
    logGameDebug('computer:step-applied', { action: description, state: summarizeGameState(next) });
  };
  const hand = next.players[1].hand;
  const canLift = next.discard.length > 0 && hand.length + next.discard.length >= 5;
  const shouldLift = canLift && next.discard.length <= 4 && canCompleteWithDiscard(hand, next.discard);

  if (next.phase === 'draw') {
    if (next.stock.length === 0) {
      if (shouldLift) applyAction('levantar-pozo', (current) => takeDiscardPile(current, 1));
      else applyAction('terminar-mano-por-monton-vacio', (current) => finishEmptyStock(current, 1));
    } else if (shouldLift) {
      applyAction('levantar-pozo', (current) => takeDiscardPile(current, 1));
    } else {
      applyAction('robar-del-monton', (current) => drawFromStock(current, 1));
    }
    logGameDebug('computer:draw-decision', {
      shouldLift,
      stockCount: state.stock.length,
      discardCount: state.discard.length,
      action: steps[steps.length - 1]?.phase === 'round-over' ? 'terminar-mano' : shouldLift ? 'levantar-pozo' : 'robar-del-monton',
    });
  }

  if (next.phase === 'opening-choice' && next.currentPlayer === 1) {
    logGameDebug('computer:opening-decision', { action: 'conservar-ficha-inicial' });
    applyAction('conservar-ficha-inicial', (current) => keepOpeningDraw(current, 1));
  }

  while (next.phase === 'play' && next.currentPlayer === 1) {
    const currentHand = next.players[1].hand;
    let extended = false;

    for (const meld of next.melds) {
      if (meld.team !== 1) continue;
      for (const tile of currentHand) {
        if (!mayExtendMeld(meld, tile)) continue;
        if (getMeldKind([...meld.tiles, tile]) !== meld.kind) continue;
        const candidate = tryRuleAction(() => addToMeld(next, 1, meld.id, [tile.id]));
        if (!candidate || leavesOnlyRestrictedTile(candidate)) continue;
        next = candidate;
        steps.push(next);
        logGameDebug('computer:meld-decision', { action: 'agregar-a-juego', meldId: meld.id, tileIds: [tile.id] });
        logGameDebug('computer:step-applied', { action: 'agregar-a-juego', state: summarizeGameState(next) });
        extended = true;
        break;
      }
      if (extended) break;
    }
    if (extended) continue;

    const best = findBestMeld(currentHand, (tiles) => {
      const candidate = tryRuleAction(() => layMeld(next, 1, tiles.map((tile) => tile.id)));
      return candidate !== null && !leavesOnlyRestrictedTile(candidate);
    });
    if (!best) break;

    const candidate = tryRuleAction(() => layMeld(next, 1, best.map((tile) => tile.id)));
    if (!candidate || leavesOnlyRestrictedTile(candidate)) break;
    next = candidate;
    steps.push(next);
    logGameDebug('computer:meld-decision', { action: 'bajar-juego', tileIds: best.map((tile) => tile.id) });
    logGameDebug('computer:step-applied', { action: 'bajar-juego', state: summarizeGameState(next) });
  }

  if (next.phase === 'play' && next.currentPlayer === 1 && next.players[1].hand.length > 0) {
    const tile = chooseDiscard(next.players[1].hand, next.restrictedDiscardTileId);
    logGameDebug('computer:discard-decision', { tileId: tile.id, color: tile.color, value: tile.value, kind: tile.kind });
    applyAction('descartar', (current) => discardTile(current, 1, tile.id));
  }
  logGameDebug('computer:turn-plan-complete', {
    stepCount: steps.length,
    noProgress: steps.length === 0 && state.currentPlayer === 1 && state.phase !== 'round-over' && state.phase !== 'match-over',
    state: summarizeGameState(next),
  });
  return steps;
}

export function runComputerTurn(state: GameState): GameState {
  const steps = runComputerTurnSteps(state);
  return steps.length ? steps[steps.length - 1] : state;
}