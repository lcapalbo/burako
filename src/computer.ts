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

export function runComputerTurn(state: GameState): GameState {
  let next = state;
  const hand = next.players[1].hand;
  const canLift = next.discard.length > 0 && hand.length + next.discard.length >= 5;
  const shouldLift = canLift && next.discard.length <= 4 && canCompleteWithDiscard(hand, next.discard);

  if (next.phase === 'draw') {
    if (next.stock.length === 0) {
      if (shouldLift) next = takeDiscardPile(next, 1);
      else return finishEmptyStock(next, 1);
    } else if (shouldLift) {
      next = takeDiscardPile(next, 1);
    } else {
      next = drawFromStock(next, 1);
    }
  }

  if (next.phase === 'opening-choice' && next.currentPlayer === 1) {
    next = keepOpeningDraw(next, 1);
  }

  while (next.phase === 'play' && next.currentPlayer === 1) {
    const currentHand = next.players[1].hand;
    let extended = false;

    for (const meld of next.melds) {
      if (meld.team !== 1) continue;
      for (const tile of currentHand) {
        if (getMeldKind([...meld.tiles, tile]) !== meld.kind) continue;
        const candidate = tryRuleAction(() => addToMeld(next, 1, meld.id, [tile.id]));
        if (!candidate || leavesOnlyRestrictedTile(candidate)) continue;
        next = candidate;
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
  }

  if (next.phase === 'play' && next.currentPlayer === 1 && next.players[1].hand.length > 0) {
    const tile = chooseDiscard(next.players[1].hand, next.restrictedDiscardTileId);
    next = discardTile(next, 1, tile.id);
  }
  return next;
}