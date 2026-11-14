import type { CSSProperties, PointerEventHandler, RefObject } from 'react';
import type { GameState, Target, Tile } from '../game';
import { getTileColorName, TileFace } from './TileFace';
import { ScorePairSummary } from './ScorePairSummary';

export type HandSortMode = 'original' | 'color' | 'number';

const SORT_MENU_OPTIONS = [
  { mode: 'color', icon: 'color', label: 'Color' },
  { mode: 'number', icon: 'number', label: 'Número' },
  { mode: 'original', icon: 'original', label: 'Original' },
] as const;

type PlayerAreaProps = {
  game: GameState;
  playerAreaRef: RefObject<HTMLElement>;
  error: string;
  humanTurn: boolean;
  currentHandScores: [number, number] | null;
  hasPreviousRounds: boolean;
  shouldShowHandControls: boolean;
  playerHeaderText: string;
  sortMenuOpen: boolean;
  handSortMode: HandSortMode;
  onToggleSortMenu: () => void;
  onHandSortModeChange: (mode: HandSortMode) => void;
  displayedHand: Tile[];
  selection: string[];
  flightTileIds: Set<string>;
  draggedId: string | null;
  draggedTile?: Tile;
  touchDragPosition: { x: number; y: number } | null;
  canReorderHand: boolean;
  canFinishEmptyStock: boolean;
  recentlyChangedTileIdSet: Set<string>;
  onShowPoints: () => void;
  onNextRound: () => void;
  onPlayAgain: (target: Target) => void;
  onFinishEmptyStock: () => void;
  onHandTileClick: (tileId: string, openingChoiceTile: boolean) => void;
  onDraggedIdChange: (tileId: string | null) => void;
  onReorderHand: (fromId: string, toId: string) => void;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
};

export function PlayerArea({
  game,
  playerAreaRef,
  error,
  humanTurn,
  currentHandScores,
  hasPreviousRounds,
  shouldShowHandControls,
  playerHeaderText,
  sortMenuOpen,
  handSortMode,
  onToggleSortMenu,
  onHandSortModeChange,
  displayedHand,
  selection,
  flightTileIds,
  draggedId,
  draggedTile,
  touchDragPosition,
  canReorderHand,
  canFinishEmptyStock,
  recentlyChangedTileIdSet,
  onShowPoints,
  onNextRound,
  onPlayAgain,
  onFinishEmptyStock,
  onHandTileClick,
  onDraggedIdChange,
  onReorderHand,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: PlayerAreaProps) {
  return (
    <section ref={playerAreaRef} className="player-area" aria-label="Tu atril">
      {game.result && <section className={`result-banner ${game.phase === 'match-over' ? 'is-final' : ''}`} role="status">
        <strong>{game.result}</strong>
        {(game.phase === 'match-over' || (game.target !== 'cut' && game.phase === 'round-over')) && <span className="result-score-summary">
          {currentHandScores
            ? <ScorePairSummary label="Puntos" scores={currentHandScores} />
            : <>Puntaje de la mano no disponible para esta partida guardada.</>}
          {hasPreviousRounds && <>
            {' · '}
            <ScorePairSummary label="Partida" scores={[game.scores[0], game.scores[1]]} />
          </>}
        </span>}
        <div className="result-actions">
          <button className="points-detail-button" type="button" onClick={onShowPoints}>Ver detalle de puntos</button>
          {game.phase === 'round-over' && <button type="button" onClick={onNextRound}>Repartir la próxima mano <span aria-hidden="true">→</span></button>}
          {game.phase === 'match-over' && <button type="button" onClick={() => onPlayAgain(game.target)}>Jugar de nuevo</button>}
        </div>
      </section>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {shouldShowHandControls && <div className="player-heading">
        <div className="player-header-meta">
          <span className={`hand-count ${humanTurn ? 'is-turn-hint' : ''}`}>{playerHeaderText}</span>
        </div>
        <div className="hand-tools sort-menu-container">
          <button
            className="sort-button sort-trigger"
            type="button"
            aria-expanded={sortMenuOpen}
            aria-haspopup="menu"
            onClick={onToggleSortMenu}
          >Ordenar</button>
          {sortMenuOpen && (
            <div className="sort-menu" role="menu" aria-label="Orden del atril">
              {SORT_MENU_OPTIONS.map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  className={`sort-menu-option ${handSortMode === mode ? 'is-active' : ''}`}
                  type="button"
                  role="menuitemradio"
                  aria-checked={handSortMode === mode}
                  onClick={() => onHandSortModeChange(mode)}
                >
                  <span className="sort-menu-icon" aria-hidden="true">
                    {icon === 'color' && (
                      <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="5.5" fill="currentColor" /></svg>
                    )}
                    {icon === 'number' && (
                      <svg viewBox="0 0 18 18" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><path d="M7 3.5 5.5 14.5M12.5 3.5 11 14.5M3.5 7h11M2.5 11h11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                    {icon === 'original' && (
                      <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M12.5 4.2A5.6 5.6 0 1 0 14.5 9H12.7A3.7 3.7 0 1 1 9 5.4c1.1 0 2.1.5 2.8 1.3L9.5 8.4H15V3l-2.5 1.2Z" fill="currentColor" /></svg>
                    )}
                  </span>
                  <span className="sort-menu-label">{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>}
      <div
        className="hand-tiles"
        data-animation-zone="hand-0"
        onDragOver={(event) => event.preventDefault()}
        onClick={(event) => {
          if (canFinishEmptyStock && !(event.target as HTMLElement).closest('[data-hand-tile-id]')) {
            onFinishEmptyStock();
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {displayedHand.map((tile, index) => {
          const openingChoiceTile = game.phase === 'opening-choice' && game.openingDrawTileId === tile.id;
          return (
            <button
              className={`hand-tile ${canReorderHand ? 'is-reorderable' : ''} ${selection.includes(tile.id) ? 'selected' : ''} ${flightTileIds.has(tile.id) ? 'is-flight-arrival' : ''} ${draggedId === tile.id ? 'is-touch-dragging' : ''}`}
              type="button"
              key={tile.id}
              data-hand-tile-id={tile.id}
              draggable={canReorderHand}
              disabled={(!humanTurn && !canReorderHand) || (game.phase === 'opening-choice' && !openingChoiceTile)}
              aria-disabled={!humanTurn || (game.phase === 'opening-choice' && !openingChoiceTile)}
              aria-pressed={selection.includes(tile.id)}
              aria-label={`${tile.kind === 'joker' ? 'Comodín' : `${tile.value} ${getTileColorName(tile.color)}`}${selection.includes(tile.id) ? ', seleccionada' : ''}`}
              onClick={() => { if (humanTurn) onHandTileClick(tile.id, openingChoiceTile); }}
              onDragStart={(event) => { if (!canReorderHand) event.preventDefault(); else onDraggedIdChange(tile.id); }}
              onDragEnd={() => onDraggedIdChange(null)}
              onDrop={(event) => { event.preventDefault(); if (canReorderHand && draggedId) onReorderHand(draggedId, tile.id); onDraggedIdChange(null); }}
              style={{ '--tile-index': index } as CSSProperties}
            ><TileFace
              tile={tile}
              selected={selection.includes(tile.id)}
              className={openingChoiceTile ? 'is-preview' : recentlyChangedTileIdSet.has(tile.id) && !selection.includes(tile.id) ? 'is-recent' : ''}
            />{openingChoiceTile && <span className="preview-action-badge" aria-hidden="true">Conservá</span>}</button>
          );
        })}
      </div>
      {draggedTile && touchDragPosition && <div
        className="touch-drag-ghost"
        aria-hidden="true"
        style={{ left: touchDragPosition.x, top: touchDragPosition.y }}
      ><TileFace tile={draggedTile} /></div>}
    </section>
  );
}
