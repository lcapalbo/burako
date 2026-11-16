import {
  COLORS,
  addToMeld,
  discardTile,
  drawFromStock,
  finishEmptyStock,
  getMeldKind,
  isCanasta,
  isCleanMeld,
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

const MAX_DISCARD_TILES_TO_EVALUATE = 20;
const MAX_MELD_CANDIDATE_SIZE = 4;
const RUN_SEQUENCE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];

function canStillFormMeld(selected: Tile[], candidate: Tile): boolean {
  let legValue: number | null = null;
  let legHasNatural = false;
  let legWilds = 0;
  let legIsPossible = true;
  let runColor: Tile['color'] | undefined;
  let runIsPossible = selected.length + 1 <= RUN_SEQUENCE_VALUES.length;
  let runValues = 0;
  let runOnes = 0;
  let twos = 0;
  let coloredTwos = 0;
  let jokers = 0;
  const tiles = [...selected, candidate];

  for (const tile of tiles) {
    if (tile.kind === 'joker') {
      legWilds += 1;
      jokers += 1;
      continue;
    }

    if (tile.value === 2) {
      twos += 1;
      if (tile.color !== null) coloredTwos += 1;
      continue;
    }

    if (tile.color === null || tile.value < 1 || tile.value > 13) {
      legIsPossible = false;
      runIsPossible = false;
      continue;
    }

    if (legValue === null) {
      legValue = tile.value;
    } else if (legValue !== tile.value) {
      legIsPossible = false;
    }
    legHasNatural = true;

    if (runColor === undefined) {
      runColor = tile.color;
    } else if (runColor !== tile.color) {
      runIsPossible = false;
    }
    if (tile.value === 1) {
      runOnes += 1;
      if (runOnes > 2) runIsPossible = false;
    } else {
      const valueBit = 1 << tile.value;
      if ((runValues & valueBit) !== 0) runIsPossible = false;
      runValues |= valueBit;
    }
  }

  legWilds += legHasNatural ? twos : twos - coloredTwos;
  legIsPossible = legIsPossible && legWilds <= 1;
  if (!legHasNatural && jokers > 1) legIsPossible = false;

  const naturalTwoCount = runColor === undefined
    ? Number(coloredTwos > 0)
    : Number(tiles.some((tile) =>
      tile.kind === 'number' && tile.value === 2 && tile.color === runColor));
  runIsPossible = runIsPossible && jokers + twos - naturalTwoCount <= 1;

  return legIsPossible || runIsPossible;
}

function canMeldHandCompletely(hand: Tile[], requireCanasta = false): boolean {
  if (requireCanasta && !canFormCanastaFromHand(hand)) return false;

  const tileMasks = hand.map((_, index) => 1n << BigInt(index));
  const meldKinds = new Map<bigint, ReturnType<typeof getMeldKind>>();
  const meldSupport = hand.map(() => 0);
  for (let first = 0; first < hand.length - 2; first += 1) {
    for (let second = first + 1; second < hand.length - 1; second += 1) {
      for (let third = second + 1; third < hand.length; third += 1) {
        const tiles = [hand[first], hand[second], hand[third]];
        if (!canStillFormMeld(tiles.slice(0, 2), tiles[2])) continue;
        const kind = getMeldKind(tiles);
        const mask = tileMasks[first] | tileMasks[second] | tileMasks[third];
        meldKinds.set(mask, kind);
        if (kind) {
          meldSupport[first] += 1;
          meldSupport[second] += 1;
          meldSupport[third] += 1;
        }
      }
    }
  }
  if (meldSupport.some((count) => count === 0)) return false;

  const results = new Map<string, boolean>();
  const canMeldRemaining = (remainingMask: bigint, hasCanasta: boolean): boolean => {
    if (remainingMask === 0n) return !requireCanasta || hasCanasta;
    const key = `${hasCanasta ? 1 : 0}|${remainingMask}`;
    const cached = results.get(key);
    if (cached !== undefined) return cached;

    let anchorIndex = -1;
    let anchorSupport = Number.POSITIVE_INFINITY;
    for (let index = 0; index < hand.length; index += 1) {
      if ((remainingMask & tileMasks[index]) === 0n) continue;
      if (meldSupport[index] < anchorSupport) {
        anchorIndex = index;
        anchorSupport = meldSupport[index];
      }
    }

    const selected = [hand[anchorIndex]];
    const search = (start: number, selectedMask: bigint): boolean => {
      if (selected.length >= 3) {
        let kind: ReturnType<typeof getMeldKind>;
        if (meldKinds.has(selectedMask)) {
          kind = meldKinds.get(selectedMask) ?? null;
        } else {
          kind = getMeldKind(selected);
          meldKinds.set(selectedMask, kind);
        }
        if (
          kind &&
          canMeldRemaining(
            remainingMask ^ selectedMask,
            hasCanasta || selected.length >= 7,
          )
        ) return true;
      }
      for (let index = start; index < hand.length; index += 1) {
        if (index === anchorIndex || (remainingMask & tileMasks[index]) === 0n) continue;
        const tile = hand[index];
        if (!canStillFormMeld(selected, tile)) continue;
        selected.push(tile);
        const canFinish = search(index + 1, selectedMask | tileMasks[index]);
        selected.pop();
        if (canFinish) return true;
      }
      return false;
    };

    const canFinish = search(0, tileMasks[anchorIndex]);
    results.set(key, canFinish);
    return canFinish;
  };

  return canMeldRemaining((1n << BigInt(hand.length)) - 1n, false);
}

function canFormCanastaFromHand(hand: Tile[]): boolean {
  for (let value = 1; value <= 13; value += 1) {
    const naturalCount = hand.filter((tile) =>
      tile.kind === 'number' && tile.value === value && tile.color !== null).length;
    const wildCount = hand.filter((tile) =>
      tile.kind === 'joker'
      || (tile.kind === 'number' && tile.value === 2 && (value !== 2 || tile.color === null))).length;
    if (naturalCount >= 7 || (naturalCount >= 6 && wildCount > 0)) return true;
  }

  for (const color of COLORS) {
    for (let start = 0; start <= RUN_SEQUENCE_VALUES.length - 7; start += 1) {
      const positions = RUN_SEQUENCE_VALUES.slice(start, start + 7);
      let missing = 0;
      for (const value of positions) {
        if (!hand.some((tile) => tile.kind === 'number' && tile.color === color && tile.value === value)) {
          missing += 1;
        }
      }
      if (missing > 1) continue;

      const naturalTwoCount = Number(positions.includes(2)
        && hand.some((tile) => tile.kind === 'number' && tile.color === color && tile.value === 2));
      const wildCount = hand.filter((tile) => isWild(tile)).length - naturalTwoCount;
      if (missing === 0 || wildCount > 0) return true;
    }
  }
  return false;
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
        const preferenceBonus = preferences.preferredMeldKind === 'none' || kind === preferences.preferredMeldKind
          ? preferences.meldKindPreferenceBonus
          : 0;
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

function findMeldToRetain(
  hand: Tile[],
  isValidMeld: (tiles: Tile[]) => boolean,
  isAllowedToLay: (tiles: Tile[]) => boolean,
  preferences: AiPreferences,
): Tile[] | null {
  let best: Tile[] | null = null;
  let bestValue = 0;
  const selected: Tile[] = [];
  const search = (start: number) => {
    if (selected.length >= 5 && getMeldKind(selected) && isValidMeld(selected)) {
      const retainedIds = new Set(selected.map((tile) => tile.id));
      const otherMeld = findBestMeld(hand.filter((tile) => !retainedIds.has(tile.id)), isAllowedToLay, preferences);
      if (otherMeld) {
        const kind = getMeldKind(selected);
        const preferenceBonus = preferences.preferredMeldKind === 'none' || kind === preferences.preferredMeldKind
          ? preferences.meldKindPreferenceBonus
          : 0;
        const value = selected.length * 10 + (selected.length >= 7 ? 100 : 0) + preferenceBonus;
        if (value > bestValue) {
          best = [...selected];
          bestValue = value;
        }
      }
    }
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
  opponentPlayers?: Array<Pick<GameState['players'][number], 'deadTaken' | 'hand'>>;
  discardPile?: Tile[];
  preferences?: AiPreferences;
};

export function chooseDiscard(
  hand: Tile[],
  excludedTileId: string | null = null,
  options: ChooseDiscardOptions = {},
): Tile {
  const preferences = options.preferences ?? DEFAULT_AI_PREFERENCES;
  const opponentMelds = options.opponentMelds ?? [];
  const opponentPlayers = options.opponentPlayers ?? [];
  const discardPile = options.discardPile ?? [];
  const opponentHasTakenDead = opponentPlayers.some((player) => player.deadTaken);
  const opponentNearCut = isOpponentNearCut(opponentMelds, opponentPlayers);
  const score = (tile: Tile) => {
    const sameValue = hand.filter((other) => other.id !== tile.id && other.kind === 'number' && other.value === tile.value).length;
    const sameRun = tile.kind === 'number'
      ? hand.filter((other) => {
        const distance = Math.abs(other.value - tile.value);
        const wrapsThroughOne = distance >= 11;
        return other.id !== tile.id && other.kind === 'number' && other.color === tile.color && (distance <= 2 || wrapsThroughOne);
      }).length
      : 0;
    const discardPileAfterTile = [...discardPile, tile];
    const helpsOpponentCanasta = preferences.avoidOpponentCanastaDiscards
      && opponentMelds.some((meld) => canCompleteCanastaFromDiscardPile(meld, discardPileAfterTile));
    const extendsOpponentMeld = preferences.avoidOpponentMeldExtensions
      && !opponentMelds.some(isCanasta)
      && opponentMelds.some((meld) => [5, 6].some((targetSize) =>
        canExtendOpponentMeldToSize(meld, discardPileAfterTile, targetSize)));
    const tilePointsScore = opponentNearCut ? -tilePoints(tile) : opponentHasTakenDead ? 0 : tilePoints(tile);
    return (tile.kind === 'joker' ? 120 : tile.value === 2 ? 80 : 0)
      + sameValue * 12 + sameRun * 12 + tilePointsScore
      + (helpsOpponentCanasta || extendsOpponentMeld ? 1000 : 0);
  };
  const candidates = hand.filter((tile) => tile.id !== excludedTileId);
  const discard = [...candidates].sort((a, b) => score(a) - score(b))[0];
  if (!discard) throw new GameRuleError('No hay una ficha legal para descartar.');
  return discard;
}

function canCompleteWithDiscard(hand: Tile[], discard: Tile[], discardWindow: number): boolean {
  const discardTiles = discard.slice(-discardWindow);
  const discardIds = new Set(discardTiles.map((tile) => tile.id));
  const candidates = [...discardTiles, ...hand];
  const selected: Tile[] = [];
  let canComplete = false;

  const search = (start: number): void => {
    if (selected.length >= 3 && selected.some((tile) => discardIds.has(tile.id)) && getMeldKind(selected)) {
      canComplete = true;
      return;
    }
    if (canComplete || selected.length === MAX_MELD_CANDIDATE_SIZE) return;

    const end = selected.length === 0 ? discardTiles.length : candidates.length;
    for (let index = start; index < end; index += 1) {
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

function canExtendMeldWithDiscard(state: GameState, playerId: number, discardWindow: number): boolean {
  const team = state.players[playerId].team;
  if (state.melds.some((meld) => meld.team === team && isCanasta(meld))) return false;
  const lifted = tryRuleAction(() => takeDiscardPile(state, playerId));
  if (!lifted) return false;
  const discardIds = new Set(state.discard.slice(-discardWindow).map((tile) => tile.id));
  const candidates = lifted.players[playerId].hand;

  for (const meld of state.melds) {
    if (meld.team !== team) continue;
    const targetLength = meld.tiles.length < 6 ? 6 : 7;
    const needed = targetLength - meld.tiles.length;
    const selected: Tile[] = [];
    let canExtend = false;

    const search = (start: number): void => {
      if (selected.length === needed) {
        if (
          selected.some((tile) => discardIds.has(tile.id)) &&
          getMeldKind([...meld.tiles, ...selected]) === meld.kind &&
          tryRuleAction(() => addToMeld(lifted, playerId, meld.id, selected.map((tile) => tile.id)))
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

function canExtendMeldWithDiscardTiles(
  meld: Meld,
  candidates: Tile[],
  count: number,
  isAllowed: (tiles: Tile[]) => boolean,
  firstSelectionLimit = candidates.length,
): boolean {
  const selected: Tile[] = [];
  const search = (start: number): boolean => {
    if (selected.length === count) {
      const tiles = [...meld.tiles, ...selected];
      return getMeldKind(tiles) === meld.kind && isAllowed(tiles);
    }

    const end = selected.length === 0 ? firstSelectionLimit : candidates.length;
    for (let index = start; index < end; index += 1) {
      const tile = candidates[index];
      if (!canStillFormMeld([...meld.tiles, ...selected], tile)) continue;
      selected.push(tile);
      const canExtend = search(index + 1);
      selected.pop();
      if (canExtend) return true;
    }
    return false;
  };
  return search(0);
}

function getCompatibleDiscardTiles(meld: Meld, discardPile: Tile[]): Tile[] {
  return discardPile.filter((tile) =>
    !meld.tiles.some((existing) => existing.id === tile.id) && mayExtendMeld(meld, tile));
}

function canExtendOpponentMeldToSize(meld: Meld, discardPile: Tile[], targetSize: number): boolean {
  const needed = targetSize - meld.tiles.length;
  if (needed <= 0) return false;
  const candidates = getCompatibleDiscardTiles(meld, discardPile);
  return canExtendMeldWithDiscardTiles(meld, candidates, needed, () => true);
}

function canFormMeldOfSizeWithDiscardTile(tiles: Tile[], size: number, discardIds: Set<string>): boolean {
  const discardTiles = tiles.filter((tile) => discardIds.has(tile.id));
  const candidates = [...discardTiles, ...tiles.filter((tile) => !discardIds.has(tile.id))];
  const selected: Tile[] = [];
  const search = (start: number): boolean => {
    if (selected.length === size) {
      return selected.some((tile) => discardIds.has(tile.id)) && getMeldKind(selected) !== null;
    }
    if (tiles.length - start < size - selected.length) return false;

    const end = selected.length === 0 ? discardTiles.length : candidates.length;
    for (let index = start; index < end; index += 1) {
      const tile = candidates[index];
      if (!canStillFormMeld(selected, tile)) continue;
      selected.push(tile);
      const canForm = search(index + 1);
      selected.pop();
      if (canForm) return true;
    }
    return false;
  };
  return search(0);
}

function canFormCanastaWithDiscard(state: GameState, playerId: number): boolean {
  const team = state.players[playerId].team;
  const discardIds = new Set(state.discard.map((tile) => tile.id));
  const available = [...state.discard, ...state.players[playerId].hand];
  if (canFormMeldOfSizeWithDiscardTile(available, 7, discardIds)) return true;

  for (const meld of state.melds) {
    if (meld.team !== team) continue;
    const needed = 7 - meld.tiles.length;
    if (needed <= 0) continue;
    const candidates = getCompatibleDiscardTiles(meld, available);
    const firstSelectionLimit = candidates.filter((tile) => discardIds.has(tile.id)).length;
    if (canExtendMeldWithDiscardTiles(meld, candidates, needed, (tiles) =>
      tiles.some((tile) => discardIds.has(tile.id)) && isCanasta({ ...meld, tiles }), firstSelectionLimit)) {
      return true;
    }
  }
  return false;
}

function canCompleteCanastaFromDiscardPile(meld: Meld, discardPile: Tile[]): boolean {
  const candidates = getCompatibleDiscardTiles(meld, discardPile);

  const canExtendWith = (count: number, predicate: (tiles: Tile[]) => boolean): boolean => {
    return canExtendMeldWithDiscardTiles(meld, candidates, count, predicate);
  };

  const needed = 7 - meld.tiles.length;
  if (needed > 0 && canExtendWith(needed, (tiles) => isCanasta({ ...meld, tiles }))) return true;

  if (!isCanasta(meld) || isCleanMeld(meld) || meld.tiles.some((tile) => tile.kind === 'joker')) return false;
  for (let count = 1; count <= Math.min(2, candidates.length); count += 1) {
    if (canExtendWith(count, (tiles) => isCleanMeld({ ...meld, tiles }))) return true;
  }
  return false;
}

function isOpponentNearCut(
  opponentMelds: Meld[],
  opponentPlayers: Array<Pick<GameState['players'][number], 'deadTaken' | 'hand'>>,
): boolean {
  return opponentMelds.some(isCanasta)
    && opponentPlayers.some((player) => player.deadTaken)
    && opponentPlayers.some((player) => player.hand.length === 1 || player.hand.length === 2);
}

function meldActionClosesRound(candidate: GameState, playerId: number): boolean {
  if (candidate.phase === 'round-over' || candidate.phase === 'match-over') return true;
  const [lastTile] = candidate.players[playerId].hand;
  if (candidate.phase !== 'play' || !lastTile) return false;
  const discarded = tryRuleAction(() => discardTile(candidate, playerId, lastTile.id));
  return discarded?.phase === 'round-over' || discarded?.phase === 'match-over';
}

function wildActionTakesDead(state: GameState, candidate: GameState, playerId: number): boolean {
  const team = state.players[playerId].team;
  const teamHadTakenDead = state.players.some((player) => player.team === team && player.deadTaken);
  const teamHasTakenDead = candidate.players.some((player) => player.team === team && player.deadTaken);
  return !teamHadTakenDead && teamHasTakenDead;
}

function canTakeDeadAfterMeldSequence(state: GameState, candidate: GameState, playerId: number): boolean {
  const team = state.players[playerId].team;
  if (
    state.players.some((player) => player.team === team && player.deadTaken)
    || !candidate.deadPiles[team]?.length
  ) return false;
  if (candidate.players.some((player) => player.team === team && player.deadTaken)) return true;

  const visited = new Set<string>();
  const canPlayOut = (current: GameState): boolean => {
    const hand = current.players[playerId].hand;
    if (canMeldHandCompletely(hand)) return true;
    if (hand.some((tile) =>
      tile.id !== current.restrictedDiscardTileId
      && canMeldHandCompletely(hand.filter((handTile) => handTile.id !== tile.id)))) return true;

    const key = [
      hand.map((tile) => tile.id).sort().join(','),
      ...current.melds
        .filter((meld) => meld.team === team)
        .map((meld) => `${meld.id}:${meld.tiles.map((tile) => tile.id).join(',')}`),
    ].join('|');
    if (visited.has(key)) return false;
    visited.add(key);

    for (const meld of current.melds) {
      if (meld.team !== team) continue;
      for (const tile of hand) {
        if (!mayExtendMeld(meld, tile) || getMeldKind([...meld.tiles, tile]) !== meld.kind) continue;
        const extended = tryRuleAction(() => addToMeld(current, playerId, meld.id, [tile.id]));
        if (!extended) continue;
        if (extended.players[playerId].deadTaken || canPlayOut(extended)) return true;
      }
    }
    return false;
  };

  return canPlayOut(candidate);
}

function canCloseAfterMeldSequence(state: GameState, playerId: number): boolean {
  const player = state.players[playerId];
  const team = player.team;
  const teamHasTakenDead = state.players.some((member) => member.team === team && member.deadTaken);
  if (!teamHasTakenDead && state.deadPiles[team]?.length) return false;

  const needsCanasta = !state.melds.some((meld) => meld.team === team && isCanasta(meld));
  const canPlayOut = (hand: Tile[]) => canMeldHandCompletely(hand, needsCanasta);
  if (canPlayOut(player.hand)) return true;
  return player.hand.some((tile) =>
    tile.id !== state.restrictedDiscardTileId &&
    canPlayOut(player.hand.filter((handTile) => handTile.id !== tile.id)));
}

function getRunWildcardPosition(meld: Meld): { index: number; start: number } | null {
  const runColor = meld.tiles.find((tile) => tile.kind === 'number' && tile.value !== 2)?.color;
  if (meld.kind !== 'run' || !runColor) return null;

  for (let start = 0; start <= RUN_SEQUENCE_VALUES.length - meld.tiles.length; start += 1) {
    let wildcardIndex: number | null = null;
    let valid = true;
    for (let index = 0; index < meld.tiles.length; index += 1) {
      const tile = meld.tiles[index];
      if (tile.kind === 'number' && tile.color === runColor && tile.value === RUN_SEQUENCE_VALUES[start + index]) continue;
      if (!isWild(tile) || wildcardIndex !== null) {
        valid = false;
        break;
      }
      wildcardIndex = index;
    }
    if (valid && wildcardIndex !== null) return { index: wildcardIndex, start };
  }
  return null;
}

function getRunWildcardIndex(meld: Meld): number | null {
  return getRunWildcardPosition(meld)?.index ?? null;
}

function canHelpPurifyRunCanasta(meld: Meld, tile: Tile): boolean {
  if (!isCanasta(meld) || meld.kind !== 'run') return false;
  const runColor = meld.tiles.find((tile) => tile.kind === 'number' && tile.value !== 2)?.color;
  const wildcardTwoIndex = meld.tiles.findIndex((meldTile) =>
    meldTile.kind === 'number' && meldTile.value === 2 && meldTile.color === runColor);
  const wildcardPosition = getRunWildcardPosition(meld);
  if (
    runColor === null
    || runColor === undefined
    || wildcardTwoIndex < 0
    || wildcardPosition?.index !== wildcardTwoIndex
    || wildcardPosition.index !== 0
    || RUN_SEQUENCE_VALUES[wildcardPosition.start] < 6
  ) return false;

  return tile.kind === 'number'
    && tile.color === runColor
    && tile.value === RUN_SEQUENCE_VALUES[wildcardPosition.start];
}

function canPurifyCanastaByExtending(meld: Meld, candidate: GameState, meldId: string): boolean {
  const updatedMeld = candidate.melds.find((candidateMeld) => candidateMeld.id === meldId);
  return Boolean(updatedMeld && !isCleanMeld(meld) && isCleanMeld(updatedMeld));
}

function canSupportCanastaWithWild(state: GameState, meld: Meld, tile: Tile, playerId: number): boolean {
  const team = state.players[playerId].team;
  return state.mode === 'pairs'
    && isWild(tile)
    && meld.team === team
    && isCleanMeld(meld)
    && (meld.tiles.length === 5 || meld.tiles.length === 6)
    && !state.melds.some((ownMeld) => ownMeld.team === team && isCanasta(ownMeld))
    && state.players.some((player) => player.team !== team && player.deadTaken);
}

function getWildExtensionPenalty(meld: Meld, tile: Tile): number {
  if (!isWild(tile)) return 0;
  if (!isCanasta(meld)) return -meld.tiles.length;
  const updatedMeld = { ...meld, tiles: [...meld.tiles, tile] };
  const dirtiesCanasta = isCleanMeld(meld) && !isCleanMeld(updatedMeld);
  return 100 + Number(dirtiesCanasta) * 100;
}

function canLayPairsRunWithWild(state: GameState, candidate: GameState): boolean {
  if (state.mode !== 'pairs') return false;
  const meld = candidate.melds[candidate.melds.length - 1];
  if (!meld || meld.kind !== 'run') return false;
  const wildcardIndex = getRunWildcardIndex(meld);
  return wildcardIndex !== null
    && (meld.tiles.length === 3 || (wildcardIndex > 0 && wildcardIndex < meld.tiles.length - 1));
}

function canKeepPairsRunWithWild(state: GameState, candidate: GameState, meldId: string): boolean {
  if (state.mode !== 'pairs') return true;
  const meld = candidate.melds.find((candidateMeld) => candidateMeld.id === meldId);
  if (!meld || meld.kind !== 'run') return true;
  const wildcardIndex = getRunWildcardIndex(meld);
  return wildcardIndex === null
    || meld.tiles.length === 3
    || (wildcardIndex > 0 && wildcardIndex < meld.tiles.length - 1);
}

function tryRuleAction(action: () => GameState): GameState | null {
  try {
    return action();
  } catch (error) {
    if (error instanceof GameRuleError) return null;
    throw error;
  }
}

function leavesOnlyRestrictedTile(state: GameState, playerId: number): boolean {
  if (state.phase !== 'play' || state.currentPlayer !== playerId || state.players[playerId].hand.length !== 1) return false;
  return state.players[playerId].hand[0].id === state.restrictedDiscardTileId;
}

export function runComputerTurnSteps(
  state: GameState,
  preferences: AiPreferences = DEFAULT_AI_PREFERENCES,
  random = Math.random,
  playerId = state.currentPlayer,
): GameState[] {
  if (!state.players[playerId]?.aiProfileId || state.currentPlayer !== playerId) return [];
  const player = state.players[playerId];
  const team = player.team;
  let next = state;
  const steps: GameState[] = [];
  logGameDebug('computer:turn-start', { state: summarizeGameState(state) });
  const applyAction = (description: string, action: (current: GameState) => GameState) => {
    next = action(next);
    steps.push(next);
    logGameDebug('computer:step-applied', { action: description, state: summarizeGameState(next) });
  };
  const hand = next.players[playerId].hand;
  const canLift = next.discard.length > 0 && hand.length + next.discard.length >= 5;
  const discardWindow = Math.min(MAX_DISCARD_TILES_TO_EVALUATE, preferences.discardPileWindow);
  const canEvaluateDiscard = next.phase === 'draw'
    && canLift
    && next.discard.length <= MAX_DISCARD_TILES_TO_EVALUATE;
  const completesMeldFromDiscard = canEvaluateDiscard
    && canCompleteWithDiscard(hand, next.discard, discardWindow);
  const liftedForDead = canEvaluateDiscard
    ? tryRuleAction(() => takeDiscardPile(next, playerId))
    : null;
  const canTakeDeadFromDiscard = liftedForDead !== null
    && canTakeDeadAfterMeldSequence(liftedForDead, liftedForDead, playerId);
  const opponentPlayers = next.players.filter((otherPlayer) => otherPlayer.team !== team);
  const opponentMelds = next.melds.filter((meld) => meld.team !== team);
  const opponentNearCut = isOpponentNearCut(opponentMelds, opponentPlayers);
  const ownTeamHasCanasta = next.melds.some((meld) => meld.team === team && isCanasta(meld));
  const shouldAvoidDiscardPile = canEvaluateDiscard && opponentNearCut && !ownTeamHasCanasta
    && !canFormCanastaWithDiscard(next, playerId);
  const shouldEvaluateOwnMelds = canEvaluateDiscard && !shouldAvoidDiscardPile && !completesMeldFromDiscard
    && (preferences.ownMeldDiscardPileEvaluationProbability >= 1
      || (preferences.ownMeldDiscardPileEvaluationProbability > 0
        && random() < preferences.ownMeldDiscardPileEvaluationProbability));
  const shouldLift = !shouldAvoidDiscardPile && (canTakeDeadFromDiscard || completesMeldFromDiscard
    || (shouldEvaluateOwnMelds && canExtendMeldWithDiscard(next, playerId, discardWindow)));

  if (next.phase === 'draw') {
    if (next.stock.length === 0) {
      if (shouldLift) applyAction('levantar-pozo', (current) => takeDiscardPile(current, playerId));
      else applyAction('terminar-mano-por-monton-vacio', (current) => finishEmptyStock(current, playerId));
    } else if (shouldLift) {
      applyAction('levantar-pozo', (current) => takeDiscardPile(current, playerId));
    } else {
      applyAction('robar-del-monton', (current) => drawFromStock(current, playerId));
    }
    logGameDebug('computer:draw-decision', {
      shouldLift,
      stockCount: state.stock.length,
      discardCount: state.discard.length,
      action: steps[steps.length - 1]?.phase === 'round-over' ? 'terminar-mano' : shouldLift ? 'levantar-pozo' : 'robar-del-monton',
    });
  }

  if (next.phase === 'opening-choice' && next.currentPlayer === playerId) {
    logGameDebug('computer:opening-decision', { action: 'conservar-ficha-inicial' });
    applyAction('conservar-ficha-inicial', (current) => keepOpeningDraw(current, playerId));
  }

  let retainedForManipulation: Set<string> | null = null;
  while (next.phase === 'play' && next.currentPlayer === playerId) {
    const currentHand = next.players[playerId].hand;
    const ownMelds = next.melds.filter((meld) => meld.team === team);
    const hasGuaranteedDeadTakingSequence = canTakeDeadAfterMeldSequence(next, next, playerId);
    const prioritizeDeadTakingWilds = hasGuaranteedDeadTakingSequence && currentHand.some(isWild);
    const extendMelds = (
      meldsToTry: Meld[],
      isPreferredExtension: (meld: Meld, tile: Tile, candidate: GameState) => boolean = () => true,
      allowPenalizedCanastaWilds = true,
    ): boolean => {
      const extensionHand = retainedForManipulation
        ? currentHand.filter((tile) => !retainedForManipulation?.has(tile.id))
        : currentHand;
      const canSupportMeld = (meld: Meld) => extensionHand.some((tile) =>
        canSupportCanastaWithWild(next, meld, tile, playerId)
        && mayExtendMeld(meld, tile)
        && getMeldKind([...meld.tiles, tile]) === meld.kind);
      const getMeldPenalty = (meld: Meld) => {
        const penalties = extensionHand
          .filter((tile) => mayExtendMeld(meld, tile) && getMeldKind([...meld.tiles, tile]) === meld.kind)
          .map((tile) => getWildExtensionPenalty(meld, tile));
        return penalties.length ? Math.min(...penalties) : Number.POSITIVE_INFINITY;
      };
      const sortedMelds = prioritizeDeadTakingWilds
        ? [...meldsToTry].sort((a, b) => {
          const penaltyA = getMeldPenalty(a);
          const penaltyB = getMeldPenalty(b);
          return penaltyA === penaltyB ? 0 : penaltyA - penaltyB;
        })
        : meldsToTry;
      const orderedMelds = sortedMelds.some(canSupportMeld)
        ? [...sortedMelds].sort((a, b) => {
          const supportsA = canSupportMeld(a);
          const supportsB = canSupportMeld(b);
          const supportDifference = Number(supportsB) - Number(supportsA);
          if (supportDifference !== 0) return supportDifference;
          if (!supportsA || !supportsB) return 0;
          return Number(b.kind === 'run') - Number(a.kind === 'run');
        })
        : sortedMelds;

      for (const meld of orderedMelds) {
        const meldHand = canSupportMeld(meld)
          ? [...extensionHand].sort((a, b) => Number(canSupportCanastaWithWild(next, meld, b, playerId)) - Number(canSupportCanastaWithWild(next, meld, a, playerId)))
          : prioritizeDeadTakingWilds
            ? [...extensionHand].sort((a, b) => getWildExtensionPenalty(meld, a) - getWildExtensionPenalty(meld, b))
            : extensionHand;
        for (const tile of meldHand) {
          if (!mayExtendMeld(meld, tile)) continue;
          if (getMeldKind([...meld.tiles, tile]) !== meld.kind) continue;
          const candidate = tryRuleAction(() => addToMeld(next, playerId, meld.id, [tile.id]));
          if (
            !candidate
            || leavesOnlyRestrictedTile(candidate, playerId)
            || (!allowPenalizedCanastaWilds
              && prioritizeDeadTakingWilds
              && isCanasta(meld)
              && isWild(tile)
              && !isPreferredExtension(meld, tile, candidate))
            || (isCanasta(meld)
              && !isPreferredExtension(meld, tile, candidate)
              && !(hasGuaranteedDeadTakingSequence
                && canTakeDeadAfterMeldSequence(next, candidate, playerId)))
            || (!canSupportCanastaWithWild(next, meld, tile, playerId)
              && !canKeepPairsRunWithWild(next, candidate, meld.id))
            || (isWild(tile)
              && !canSupportCanastaWithWild(next, meld, tile, playerId)
              && !meldActionClosesRound(candidate, playerId)
              && !wildActionTakesDead(next, candidate, playerId)
              && !canTakeDeadAfterMeldSequence(next, candidate, playerId))
          ) continue;
          next = candidate;
          steps.push(next);
          logGameDebug('computer:meld-decision', { action: 'agregar-a-juego', meldId: meld.id, tileIds: [tile.id] });
          logGameDebug('computer:step-applied', { action: 'agregar-a-juego', state: summarizeGameState(next) });
          return true;
        }
      }
      return false;
    };

    const canastaMelds = ownMelds.filter(isCanasta);
    const nonCanastaMelds = ownMelds.filter((meld) => !isCanasta(meld));
    const isPreferredCanastaExtension = (meld: Meld, tile: Tile, candidate: GameState) =>
      canPurifyCanastaByExtending(meld, candidate, meld.id)
      || canHelpPurifyRunCanasta(meld, tile);
    if (extendMelds(canastaMelds, isPreferredCanastaExtension, false)) continue;

    if (prioritizeDeadTakingWilds) {
      if (extendMelds(ownMelds, (meld, tile, candidate) =>
        !isCanasta(meld) || isPreferredCanastaExtension(meld, tile, candidate))) continue;
    } else if (extendMelds(nonCanastaMelds)) {
      continue;
    }

    const hasGuaranteedRoundClosingSequence = canCloseAfterMeldSequence(next, playerId);
    const hasGuaranteedMeldSequence = hasGuaranteedDeadTakingSequence || hasGuaranteedRoundClosingSequence;
    const isAllowedMeld = (tiles: Tile[]) => {
      const candidate = tryRuleAction(() => layMeld(next, playerId, tiles.map((tile) => tile.id)));
      return candidate !== null
        && !leavesOnlyRestrictedTile(candidate, playerId)
        && (!hasGuaranteedDeadTakingSequence
          || candidate.phase === 'round-over'
          || candidate.phase === 'match-over'
          || wildActionTakesDead(next, candidate, playerId)
          || canTakeDeadAfterMeldSequence(next, candidate, playerId))
        && (!hasGuaranteedRoundClosingSequence
          || candidate.phase === 'round-over'
          || candidate.phase === 'match-over'
          || canCloseAfterMeldSequence(candidate, playerId))
        && (!tiles.some(isWild)
          || meldActionClosesRound(candidate, playerId)
          || wildActionTakesDead(next, candidate, playerId)
          || canTakeDeadAfterMeldSequence(next, candidate, playerId)
          || canCloseAfterMeldSequence(candidate, playerId)
          || canLayPairsRunWithWild(next, candidate));
    };
    if (
      !hasGuaranteedMeldSequence
      && retainedForManipulation === null
      && next.mode === 'individual'
      && preferences.manipulateOpponentOnSinglePlay
    ) {
      const retained = findMeldToRetain(
        currentHand,
        (tiles) => tryRuleAction(() => layMeld(next, playerId, tiles.map((tile) => tile.id))) !== null,
        isAllowedMeld,
        preferences,
      );
      if (retained) {
        retainedForManipulation = new Set(retained.map((tile) => tile.id));
        logGameDebug('computer:meld-decision', {
          action: 'retener-juego-para-manipular',
          tileIds: retained.map((tile) => tile.id),
        });
      }
    }
    const availableHand = retainedForManipulation
      ? currentHand.filter((tile) => !retainedForManipulation?.has(tile.id))
      : currentHand;
    const best = findBestMeld(availableHand, isAllowedMeld, preferences);
    if (best) {
      const layMeldProbability = next.mode === 'pairs'
        ? preferences.layMeldProbabilityForPairs
        : preferences.layMeldProbability;
      const candidate = tryRuleAction(() => layMeld(next, playerId, best.map((tile) => tile.id)));
      if (!candidate || leavesOnlyRestrictedTile(candidate, playerId)) break;
      const closesRound = meldActionClosesRound(candidate, playerId);
      if (
        !hasGuaranteedMeldSequence
        && !closesRound
        && layMeldProbability < 1
        && random() >= layMeldProbability
      ) break;
      next = candidate;
      steps.push(next);
      logGameDebug('computer:meld-decision', { action: 'bajar-juego', tileIds: best.map((tile) => tile.id) });
      logGameDebug('computer:step-applied', { action: 'bajar-juego', state: summarizeGameState(next) });
      continue;
    }

    if (extendMelds(ownMelds.filter((meld) => isCanasta(meld)))) continue;
    break;
  }

  if (next.phase === 'play' && next.currentPlayer === playerId && next.players[playerId].hand.length > 0) {
    const tile = chooseDiscard(next.players[playerId].hand, next.restrictedDiscardTileId, {
      opponentMelds: next.melds.filter((meld) => meld.team !== team),
      opponentPlayers: next.players.filter((otherPlayer) => otherPlayer.team !== team),
      discardPile: next.discard,
      preferences,
    });
    logGameDebug('computer:discard-decision', { tileId: tile.id, color: tile.color, value: tile.value, kind: tile.kind });
    applyAction('descartar', (current) => discardTile(current, playerId, tile.id));
  }
  logGameDebug('computer:turn-plan-complete', {
    stepCount: steps.length,
    noProgress: steps.length === 0 && state.currentPlayer === playerId && state.phase !== 'round-over' && state.phase !== 'match-over',
    state: summarizeGameState(next),
  });
  return steps;
}

export function runComputerTurn(
  state: GameState,
  preferences: AiPreferences = DEFAULT_AI_PREFERENCES,
  random = Math.random,
  playerId = state.currentPlayer,
): GameState {
  const steps = runComputerTurnSteps(state, preferences, random, playerId);
  return steps.length ? steps[steps.length - 1] : state;
}