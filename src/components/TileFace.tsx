import type { Tile } from '../game';

const COLOR_NAMES: Record<string, string> = {
  red: 'rojo',
  blue: 'azul',
  green: 'verde',
  yellow: 'amarillo',
};

type TileFaceProps = {
  tile: Tile;
  selected?: boolean;
  className?: string;
};

export function getTileColorName(color: Tile['color']): string {
  return COLOR_NAMES[color ?? ''];
}

export function TileFace({ tile, selected = false, className = '' }: TileFaceProps) {
  const isWildTwo = tile.kind === 'number' && tile.value === 2;
  const label = tile.kind === 'joker'
    ? 'comodín especial'
    : `${tile.value} ${getTileColorName(tile.color)}${isWildTwo ? ', comodín' : ''}`;
  return (
    <span className={`tile-face ${tile.kind === 'joker' ? 'tile-joker' : `tile-${tile.color}`} ${isWildTwo ? 'tile-two-wild' : ''} ${selected ? 'is-selected' : ''} ${className}`} data-tile-id={tile.id} role="img" aria-label={label}>
      {tile.kind !== 'joker' && <span className="tile-mark" aria-hidden="true" />}
      <strong>{tile.kind === 'joker' ? '★' : tile.value}</strong>
      {tile.kind === 'joker' && <small>COMODÍN</small>}
    </span>
  );
}
