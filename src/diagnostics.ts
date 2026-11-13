import type { GameState } from './game';

export type BurakoDebugHelper = {
  enableLogging(): void;
  disableLogging(): void;
  revealOpponentHand(): void;
  hideOpponentHand(): void;
  undo(): boolean;
  redo(): boolean;
  resumeComputerTurn(): void;
};

declare global {
  interface Window {
    burakoDebug?: BurakoDebugHelper;
  }
}

let gameDebugEnabled = false;

export function setGameDebugEnabled(enabled: boolean): void {
  gameDebugEnabled = enabled;
}

export function logGameDebug(event: string, details?: unknown): void {
  if (!gameDebugEnabled) return;
  console.info(`[Burako] ${event}`, details ?? '');
}

export function logGameError(message: string, state: GameState | null, cause?: unknown): void {
  console.error('[Burako] Error', { message, state, cause });
}

export function summarizeGameState(state: GameState) {
  return {
    round: state.round,
    turnNumber: state.turnNumber,
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    roundStarter: state.roundStarter,
    stockCount: state.stock.length,
    discardCount: state.discard.length,
    handCounts: state.players.map((player) => player.hand.length),
    meldCounts: state.players.map((player) => state.melds.filter((meld) => meld.team === player.team).length),
    scores: state.scores,
  };
}