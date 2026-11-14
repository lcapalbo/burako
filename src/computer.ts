import {
  addToMeld,
  discardTile,
  drawFromStock,
  finishEmptyStock,
  getMeldKind,
  isCanasta,
  isWild,
  keepOpeningDraw,
  layMeld,
  takeDiscardPile,
  tilePoints,
  GameRuleError,
  type GameState,
  type Meld,
  type Tile,
} from './game.js';
import { logGameDebug, summarizeGameState } from './diagnostics.js';
import { DEFAULT_AI_PREFERENCES, type AiPreferences } from './aiProfiles.js';

const MAX_DISCARD_TILES_TO_EVALUATE = 10;
const MAX_MELD_CANDIDATE_SIZE = 4;

function canStillFormMeld(selected: Tile[], candidate: Tile): boolean {
  return selected.every((tile) => isWild(tile) || isWild(candidate) || tile.value === candidate.value || tile.color === candidate.color);
}

export function findBestMeld(
  hand: Tile[],
  isAllowed: (tiles: Tile[]) => boolean = () => true,
  preferences: AiPreferences = DEFAULT_AI_PREFERENCES,
): Tile[] | null {
  let best: Tile[] | null = null;
  let bestValue = 0;
  const selected: Tile[] = [];
  const search = (start: number) => {
    if (selected.length >= 3) {
      const kind = getMeldKind(selected);
      if (kind && isAllowed(selected)) {
        const preferenceBonus = kind === preferences.preferredMeldKind ? preferences.meldKindPreferenceBonus : 0;
        const value = selected.length * 10 + (selected.length >= 7 ? 100 : 0) + preferenceBonus;
        if (value > bestValue) {
          best = [...selected];
          bestValue = value;
        }
      }
    }
    if (selected.length === hand.length) return;
    for (let index = start; index < hand.length; index += 1) {
      if (!canStillFormMeld(selected, hand[index])) continue;
      selected.push(hand[index]);
      search(index + 1);
      selected.pop();
    }
  };
  search(0);
  return best;
}

type ChooseDiscardOptions = {
  opponentMelds?: Meld[];
  preferences?: AiPreferences;
};

export function chooseDiscard(
  hand: Tile[],
  excludedTileId: string | null = null,
  options: ChooseDiscardOptions = {},
): Tile {
  const preferences = options.preferences ?? DEFAULT_AI_PREFERENCES;
  const opponentMelds = options.opponentMelds ?? [];
  const score = (tile: Tile) => {
    const sameValue = hand.filter((other) => other.id !== tile.id && other.kind === 'number' && other.value === tile.value).length;
    const sameRun = tile.kind === 'number'
      ? hand.filter((other) => other.id !== tile.id && other.color === tile.color && Math.abs(other.value - tile.value) <= 2).length
      : 0;
    const completesOpponentCanasta = preferences.avoidOpponentCanastaDiscards
      && opponentMelds.some((meld) => meld.tiles.length === 6 && getMeldKind([...meld.tiles, tile]) === meld.kind);
    return (tile.kind === 'joker' ? 100 : tile.value === 2 ? 80 : 0)
      + sameValue * 12 + sameRun * 8 - tilePoints(tile)
      + (completesOpponentCanasta ? 1000 : 0);
  };
  const candidates = hand.filter((tile) => tile.id !== excludedTileId);
  const discard = [...candidates].sort((a, b) => score(a) - score(b))[0];
  if (!discard) throw new GameRuleError('No hay una ficha legal para descartar.');
  return discard;
}

function canCompleteWithDiscard(hand: Tile[], discard: Tile[], discardWindow: number): boolean {
  const discardTiles = discard.slice(-discardWindow);
  const discardIds = new Set(discardTiles.map((tile) => tile.id));
  const candidates = [...hand, ...discardTiles];
  const selected: Tile[] = [];
  let canComplete = false;

  const search = (start: number): void => {
    if (selected.length >= 3 && selected.some((tile) => discardIds.has(tile.id)) && getMeldKind(selected)) {
      canComplete = true;
      return;
    }
    if (canComplete || selected.length === MAX_MELD_CANDIDATE_SIZE) return;

    for (let index = start; index < candidates.length; index += 1) {
      const tile = candidates[index];
      if (!canStillFormMeld(selected, tile)) continue;
      selected.push(tile);
      search(index + 1);
      selected.pop();
      if (canComplete) return;
    }
  };

  search(0);
  return canComplete;
}

function canExtendMeldWithDiscard(state: GameState, discardWindow: number): boolean {
  if (state.melds.some((meld) => meld.team === 1 && isCanasta(meld))) return false;
  const lifted = tryRuleAction(() => takeDiscardPile(state, 1));
  if (!lifted) return false;
  const discardIds = new Set(state.discard.slice(-discardWindow).map((tile) => tile.id));
  const candidates = lifted.players[1].hand;

  for (const meld of state.melds) {
    if (meld.team !== 1) continue;
    const targetLength = meld.tiles.length < 6 ? 6 : 7;
    const needed = targetLength - meld.tiles.length;
    const selected: Tile[] = [];
    let canExtend = false;

    const search = (start: number): void => {
      if (selected.length === needed) {
        if (
          selected.some((tile) => discardIds.has(tile.id)) &&
          getMeldKind([...meld.tiles, ...selected]) === meld.kind &&
          tryRuleAction(() => addToMeld(lifted, 1, meld.id, selected.map((tile) => tile.id)))
        ) {
          canExtend = true;
        }
        return;
      }

      for (let index = start; index < candidates.length; index += 1) {
        const tile = candidates[index];
        if (!canStillFormMeld([...meld.tiles, ...selected], tile)) continue;
        selected.push(tile);
        search(index + 1);
        selected.pop();
        if (canExtend) return;
      }
    };

    search(0);
    if (canExtend) return true;
  }
  return false;
}

function mayExtendMeld(meld: GameState['melds'][number], tile: Tile): boolean {
  if (isWild(tile)) return true;
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

export function runComputerTurnSteps(
  state: GameState,
  preferences: AiPreferences = DEFAULT_AI_PREFERENCES,
  random = Math.random,
): GameState[] {
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
  const discardWindow = Math.min(MAX_DISCARD_TILES_TO_EVALUATE, preferences.discardPileWindow);
  const canEvaluateDiscard = next.phase === 'draw'
    && canLift
    && next.discard.length <= MAX_DISCARD_TILES_TO_EVALUATE;
  const completesMeldFromDiscard = canEvaluateDiscard
    && canCompleteWithDiscard(hand, next.discard, discardWindow);
  const shouldEvaluateOwnMelds = canEvaluateDiscard && !completesMeldFromDiscard
    && (preferences.ownMeldPozoEvaluationProbability >= 1
      || (preferences.ownMeldPozoEvaluationProbability > 0
        && random() < preferences.ownMeldPozoEvaluationProbability));
  const shouldLift = completesMeldFromDiscard
    || (shouldEvaluateOwnMelds && canExtendMeldWithDiscard(next, discardWindow));

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
    }, preferences);
    if (!best) break;
    console.log(preferences);
    if (preferences.layMeldProbability < 1 && random() >= preferences.layMeldProbability) break;

    const candidate = tryRuleAction(() => layMeld(next, 1, best.map((tile) => tile.id)));
    if (!candidate || leavesOnlyRestrictedTile(candidate)) break;
    next = candidate;
    steps.push(next);
    logGameDebug('computer:meld-decision', { action: 'bajar-juego', tileIds: best.map((tile) => tile.id) });
    logGameDebug('computer:step-applied', { action: 'bajar-juego', state: summarizeGameState(next) });
  }

  if (next.phase === 'play' && next.currentPlayer === 1 && next.players[1].hand.length > 0) {
    const tile = chooseDiscard(next.players[1].hand, next.restrictedDiscardTileId, {
      opponentMelds: next.melds.filter((meld) => meld.team !== 1),
      preferences,
    });
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

export function runComputerTurn(
  state: GameState,
  preferences: AiPreferences = DEFAULT_AI_PREFERENCES,
  random = Math.random,
): GameState {
  const steps = runComputerTurnSteps(state, preferences, random);
  return steps.length ? steps[steps.length - 1] : state;
}