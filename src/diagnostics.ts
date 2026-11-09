import type { GameState } from './game';

declare global {
  interface Window {
    __BURAKO_DEBUG__?: boolean;
  }
}

export function logGameDebug(event: string, details?: unknown): void {
  if (typeof window === 'undefined' || window.__BURAKO_DEBUG__ !== true) return;
  console.info(`[Burako] ${event}`, details ?? '');
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