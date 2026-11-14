import { Fragment } from 'react';
import type { MouseEvent, RefObject } from 'react';
import {
  addToMeld,
  COLORS,
  GameRuleError,
  isCanasta,
  isCleanMeld,
  layMeld,
  sortTiles,
  type GameState,
  type Meld,
  type Tile,
} from '../game';
import { TileFace } from './TileFace';
import { getAiProfileById } from '../aiProfiles';

export type MeldDensity = 'normal' | 'compact' | 'minimum';

type GameTableProps = {
  game: GameState;
  feltTableRef: RefObject<HTMLElement>;
  computerTurnInProgress: boolean;
  roundClosed: boolean;
  revealAllHands: boolean;
  humanTurn: boolean;
  showAvatarNames: boolean;
  onToggleAvatarNames: () => void;
  meldDensity: MeldDensity;
  discardDensity: MeldDensity;
  selection: string[];
  selectedTiles: Tile[];
  canLaySelectedMeld: boolean;
  canDrawFromStock: boolean;
  canFinishEmptyStock: boolean;
  canUseDiscardPile: boolean;
  canDiscard: boolean;
  openingChoice: boolean;
  discardPreviewTile?: Tile;
  flightTileIds: Set<string>;
  recentlyChangedTileIdSet: Set<string>;
  recentlyDiscardedTileIdSet: Set<string>;
  onFinishEmptyStock: () => void;
  onDrawFromStock: () => void;
  onDiscardOpeningDrawAndRedraw: () => void;
  onDiscardTile: (tileId: string) => void;
  onTakeDiscardPile: () => void;
  onLayMeld: (tileIds: string[]) => void;
  onAddToMeld: (meldId: string, tileIds: string[]) => void;
};

function sortLegTiles(tiles: Tile[]): Tile[] {
  const wildcards = tiles.filter((tile) => tile.kind === 'joker' || tile.value === 2);
  const naturalTiles = tiles.filter((tile) => tile.kind !== 'joker' && tile.value !== 2);
  return [...sortTiles(wildcards), ...sortTiles(naturalTiles)];
}

function getLegNumber(tiles: Tile[]): number {
  return tiles.find((tile) => tile.kind !== 'joker' && tile.value !== 2)?.value
    ?? tiles.find((tile) => tile.kind !== 'joker')?.value
    ?? 14;
}

function compareMelds(first: Pick<Meld, 'kind' | 'tiles'>, second: Pick<Meld, 'kind' | 'tiles'>): number {
  if (first.kind !== second.kind) return first.kind === 'run' ? -1 : 1;
  if (first.kind === 'run' && second.kind === 'run') {
    const firstColor = first.tiles.find((tile) => tile.kind !== 'joker' && tile.value !== 2)?.color ?? null;
    const secondColor = second.tiles.find((tile) => tile.kind !== 'joker' && tile.value !== 2)?.color ?? null;
    return COLORS.indexOf(firstColor as (typeof COLORS)[number]) - COLORS.indexOf(secondColor as (typeof COLORS)[number]);
  }
  return getLegNumber(first.tiles) - getLegNumber(second.tiles);
}

function previewMeldAddition(state: GameState, meldId: string, tileIds: string[]): Tile[] | null {
  try {
    const preview = addToMeld(state, 0, meldId, tileIds);
    return preview.melds.find((meld) => meld.id === meldId)?.tiles ?? null;
  } catch (issue) {
    if (issue instanceof GameRuleError) return null;
    throw issue;
  }
}

export function GameTable({
  game,
  feltTableRef,
  computerTurnInProgress,
  roundClosed,
  revealAllHands,
  humanTurn,
  showAvatarNames,
  onToggleAvatarNames,
  meldDensity,
  discardDensity,
  selection,
  selectedTiles,
  canLaySelectedMeld,
  canDrawFromStock,
  canFinishEmptyStock,
  canUseDiscardPile,
  canDiscard,
  openingChoice,
  discardPreviewTile,
  flightTileIds,
  recentlyChangedTileIdSet,
  recentlyDiscardedTileIdSet,
  onFinishEmptyStock,
  onDrawFromStock,
  onDiscardOpeningDrawAndRedraw,
  onDiscardTile,
  onTakeDiscardPile,
  onLayMeld,
  onAddToMeld,
}: GameTableProps) {
  const topPlayer = game.players[1];
  const topProfile = getAiProfileById(topPlayer.aiProfileId);
  if (!topProfile) throw new Error('El jugador superior no tiene un perfil de IA válido.');
  const meldsForTeam = (team: number) => game.melds
    .filter((meld) => meld.team === team)
    .sort(compareMelds);
  const handleDiscardPileClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (openingChoice
      && event.detail !== 0
      && !(event.target instanceof Element && event.target.closest('.discard-preview-tile'))) return;
    if (openingChoice) onDiscardOpeningDrawAndRedraw();
    else if (canDiscard) onDiscardTile(selection[0]);
    else onTakeDiscardPile();
  };

  return (
    <>
      <section className="top-player-bar" aria-label={`Atril de ${topPlayer.name}`}>
        {revealAllHands
          ? <div className="top-player-rack" data-animation-zone="hand-1" aria-label={`Fichas del atril de ${topPlayer.name}`}>{topPlayer.hand.map((tile) => <TileFace tile={tile} key={tile.id} className={flightTileIds.has(tile.id) ? 'is-flight-arrival' : ''} />)}</div>
          : !roundClosed && <div className="hidden-tiles" data-animation-zone="hand-1" aria-hidden="true">{topPlayer.hand.map((tile) => <span key={tile.id} data-tile-id={tile.id} className={flightTileIds.has(tile.id) ? 'is-flight-arrival' : ''} />)}</div>}
      </section>

      <section
        ref={feltTableRef}
        className={`felt-table ${meldDensity === 'compact' ? 'is-compact-melds' : ''} ${meldDensity === 'minimum' ? 'is-minimum-melds' : ''} ${discardDensity === 'compact' ? 'is-compact-discard' : ''} ${discardDensity === 'minimum' ? 'is-minimum-discard' : ''} ${game.phase === 'round-over' || game.phase === 'match-over' ? '' : computerTurnInProgress || game.currentPlayer === topPlayer.id ? 'is-top-player-turn' : 'is-bottom-player-turn'}`}
        aria-label="Mesa de juego"
      >
        <button
          className={`table-avatar table-avatar-top-player ${!roundClosed && (game.currentPlayer === topPlayer.id || computerTurnInProgress) ? 'is-turn' : ''}`}
          type="button"
          aria-label="Mostrar nombre de jugadores"
          aria-expanded={showAvatarNames}
          onClick={onToggleAvatarNames}
        >
          <img className="top-player-avatar" src={topProfile.avatar} alt="" aria-hidden="true" />
          {showAvatarNames && <span className="avatar-tooltip">{topPlayer.name}</span>}
        </button>
        <button
          className={`table-avatar table-avatar-bottom-player ${humanTurn ? 'is-turn' : ''}`}
          type="button"
          aria-label="Mostrar nombre de jugadores"
          aria-expanded={showAvatarNames}
          onClick={onToggleAvatarNames}
        >
          <img className="bottom-player-avatar" src="/avatars/player.svg" alt="" aria-hidden="true" />
          {showAvatarNames && <span className="avatar-tooltip">Vos</span>}
        </button>
        <div className="meld-area">
          {([1, 0] as const).map((team) => {
            const teamMelds = meldsForTeam(team);
            const deadTaken = game.players.find((player) => player.team === team)?.deadTaken ?? false;
            const teamName = team === 1 ? 'Mesa oponente' : 'Tu mesa';
            const canLaySelection = team === 0 && humanTurn && game.phase === 'play' && canLaySelectedMeld;
            const previewMeld = canLaySelection ? layMeld(game, 0, selection).melds.slice(-1)[0] ?? null : null;
            const previewMeldKind = previewMeld?.kind ?? null;
            const previewMeldTiles = previewMeld?.tiles ?? selectedTiles;
            const nextMeldIndex = previewMeld
              ? teamMelds.findIndex((meld) => compareMelds(previewMeld, meld) < 0)
              : -1;
            const previewMeldIndex = nextMeldIndex < 0 ? teamMelds.length : nextMeldIndex;
            const isTurnTeam = game.phase !== 'round-over'
              && game.phase !== 'match-over'
              && game.players.find((player) => player.id === game.currentPlayer)?.team === team;
            const newMeldPreview = canLaySelection && <button
              className="meld-group meld-target meld-new-preview"
              type="button"
              aria-label={`Bajar juego de ${selectedTiles.length} fichas`}
              onClick={() => onLayMeld(selection)}
            ><span className="meld-tiles" key={selection.join(':')}>{(previewMeldKind === 'run' ? previewMeldTiles : sortLegTiles(previewMeldTiles)).map((tile) => <TileFace tile={tile} key={tile.id} className="is-preview" />)}<span className="preview-action-badge" aria-hidden="true">Bajá acá</span></span></button>;
            return (
              <Fragment key={team}>
                {team === 0 && <div className="piles-row">
                  <button
                    className="stock-pile pile-action"
                    data-animation-anchor="stock"
                    type="button"
                    disabled={!canDrawFromStock && !canFinishEmptyStock}
                    aria-label={canFinishEmptyStock ? 'Terminar la mano porque se agotó el montón' : `Robar ficha del montón (${game.stock.length} restantes)`}
                    title={canFinishEmptyStock ? 'Terminar la mano' : 'Robar ficha del montón'}
                    onClick={() => canFinishEmptyStock ? onFinishEmptyStock() : onDrawFromStock()}
                  >
                    {game.stock.length > 0
                      ? <span className="stack-back"><i /><i /><i /></span>
                      : <span className="empty-stock">Montón vacío</span>}
                    <span className="pile-count">{game.stock.length}</span>
                  </button>
                  <div className="discard-pile">
                    {game.discard.length > 0 ? (
                      <button
                        className={`meld-tiles discard-stack pile-action ${discardDensity === 'minimum' ? 'is-minimum-density' : discardDensity === 'compact' ? 'is-compact-density' : ''}`}
                        data-animation-zone="discard"
                        type="button"
                        disabled={!canUseDiscardPile && !openingChoice}
                        aria-label={openingChoice ? 'Descartar la ficha inicial y robar otra del montón' : canDiscard ? 'Descartar ficha seleccionada en el pozo' : `Levantar todo el pozo (${game.discard.length} fichas)`}
                        title={openingChoice ? 'Descartar la ficha inicial y robar otra' : canDiscard ? 'Descartar ficha seleccionada' : 'Levantar todo el pozo'}
                        onClick={handleDiscardPileClick}
                      >
                        {game.discard.map((tile, index) => {
                          const tileFace = <TileFace tile={tile} className={`${recentlyChangedTileIdSet.has(tile.id) ? recentlyDiscardedTileIdSet.has(tile.id) ? 'is-recent is-recent-discard' : 'is-recent' : ''} ${flightTileIds.has(tile.id) ? 'is-flight-arrival' : ''}`} />;
                          return index === game.discard.length - 1
                            ? <span className="discard-final-tile" key={tile.id}>{tileFace}{!discardPreviewTile && <span className="pile-count tile-count-badge" aria-hidden="true">{game.discard.length}</span>}</span>
                            : <TileFace tile={tile} key={tile.id} className={`${recentlyChangedTileIdSet.has(tile.id) ? recentlyDiscardedTileIdSet.has(tile.id) ? 'is-recent is-recent-discard' : 'is-recent' : ''} ${flightTileIds.has(tile.id) ? 'is-flight-arrival' : ''}`} />;
                        })}
                        {discardPreviewTile && <span className="discard-preview-tile">
                          <TileFace tile={discardPreviewTile} className="is-preview" />
                          {game.discard.length > 0 && <span className="pile-count tile-count-badge" aria-hidden="true">{game.discard.length}</span>}
                        </span>}
                        {discardPreviewTile && <span className="preview-action-badge discard-action-badge" aria-hidden="true">Descartá</span>}
                      </button>
                    ) : canDiscard || openingChoice
                      ? <button className={`empty-discard pile-action ${discardPreviewTile ? 'has-discard-preview' : ''}`} data-animation-zone="discard" type="button" aria-label={openingChoice ? 'Descartar la ficha inicial y robar otra del montón' : 'Descartar ficha seleccionada en el pozo vacío'} title={openingChoice ? 'Descartar la ficha inicial y robar otra' : 'Descartar ficha seleccionada'} onClick={handleDiscardPileClick}>{discardPreviewTile ? <span className="discard-preview-tile"><TileFace tile={discardPreviewTile} className="is-preview" /><span className="preview-action-badge" aria-hidden="true">Descartá</span></span> : 'Pozo vacío'}</button>
                      : <span className="empty-discard">Pozo vacío</span>}
                  </div>
                </div>}
                <section className={`meld-team ${isTurnTeam ? 'is-turn' : ''}`} data-animation-zone={`meld-${team}`} aria-label={`Juegos de ${teamName}`}>
                  <header className="meld-team-header">
                    <h3 className="meld-team-heading">{teamName}</h3>
                    <span className={`meld-dead-status ${deadTaken ? 'is-taken' : ''}`}>Muerto {deadTaken ? 'levantado' : 'pendiente'}</span>
                  </header>
                  {teamMelds.length === 0 && !canLaySelection
                    ? <p className="empty-team-melds">Sin juegos bajados</p>
                    : <div className="meld-games">{teamMelds.map((meld, index) => (
                      <Fragment key={meld.id}>
                        {canLaySelection && previewMeldIndex === index && newMeldPreview}
                        {(() => {
                          const previewTiles = selection.length > 0 && game.phase === 'play' && game.currentPlayer === 0 && meld.team === 0
                            ? previewMeldAddition(game, meld.id, selection)
                            : null;
                          const canAddSelection = previewTiles !== null;
                          const addSelection = () => onAddToMeld(meld.id, selection);
                          const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
                            if (!canAddSelection || (event.key !== 'Enter' && event.key !== ' ')) return;
                            event.preventDefault();
                            addSelection();
                          };
                          const tilesToDisplay = previewTiles ?? meld.tiles;
                          const shownTiles = meld.kind === 'leg' ? sortLegTiles(tilesToDisplay) : tilesToDisplay;
                          const runColor = meld.kind === 'run'
                            ? shownTiles.find((tile) => tile.kind === 'number' && tile.value !== 2)?.color ?? null
                            : null;
                          const jokerIndex = meld.kind === 'run'
                            ? shownTiles.findIndex((tile) => tile.kind === 'joker' || (tile.value === 2 && runColor !== null && tile.color !== runColor))
                            : -1;
                          return <div
                            className={`meld-group ${canAddSelection ? 'meld-target' : ''}`}
                            key={meld.id}
                            role={canAddSelection ? 'button' : undefined}
                            tabIndex={canAddSelection ? 0 : undefined}
                            aria-label={canAddSelection ? `Agregar ${selection.length} fichas seleccionadas a este juego` : undefined}
                            onClick={canAddSelection ? addSelection : undefined}
                            onKeyDown={canAddSelection ? handleKeyDown : undefined}
                          >
                            <div className="meld-tiles" key={canAddSelection ? selection.join(':') : undefined}>
                              {shownTiles.map((tile, tileIndex) => {
                                const selectedForPreview = canAddSelection && selection.includes(tile.id);
                                const normalOverlapInMinimum = meldDensity === 'minimum' && meld.kind === 'run'
                                  && (tileIndex === 0 || (jokerIndex >= 0 && (tileIndex === jokerIndex - 1 || tileIndex === jokerIndex + 1)));
                                return <TileFace
                                  tile={tile}
                                  key={tile.id}
                                  className={selectedForPreview
                                    ? `is-preview ${normalOverlapInMinimum ? 'is-normal-minimum-overlap' : ''}`
                                    : `${recentlyChangedTileIdSet.has(tile.id) ? 'is-recent' : ''} ${flightTileIds.has(tile.id) ? 'is-flight-arrival' : ''} ${normalOverlapInMinimum ? 'is-normal-minimum-overlap' : ''}`}
                                />;
                              })}
                              {canAddSelection && <span className="preview-action-badge" aria-hidden="true">Bajá acá</span>}
                              {isCanasta(meld) && <strong className="canasta-badge canasta-overlay">{isCleanMeld(meld) ? 'Canasta limpia' : 'Canasta sucia'}</strong>}
                            </div>
                          </div>;
                        })()}
                      </Fragment>
                    ))}{canLaySelection && previewMeldIndex === teamMelds.length && newMeldPreview}</div>}
                </section>
              </Fragment>
            );
          })}
        </div>
      </section>
    </>
  );
}
