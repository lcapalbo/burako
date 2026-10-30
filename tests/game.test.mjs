import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGame, discardTile, drawFromStock, finishEmptyStock, getMeldKind, isCleanMeld, layMeld, takeDiscardPile } from '../.test-build/game.js';

const tile = (id, color, value, kind = 'number') => ({ id, color, value, kind });

describe('validación de combinaciones', () => {
  it('acepta piernas del mismo número con colores distintos', () => {
    assert.equal(getMeldKind([tile('a', 'red', 8), tile('b', 'blue', 8), tile('c', 'green', 8)]), 'leg');
  });

  it('rechaza colores repetidos en una pierna', () => {
    assert.equal(getMeldKind([tile('a', 'red', 8), tile('b', 'red', 8), tile('c', 'green', 8)]), null);
  });

  it('acepta escaleras naturales y el 1 después del 13', () => {
    assert.equal(getMeldKind([tile('a', 'blue', 6), tile('b', 'blue', 7), tile('c', 'blue', 8)]), 'run');
    assert.equal(getMeldKind([tile('d', 'red', 13), tile('e', 'red', 1), tile('f', 'red', 12)]), 'run');
  });

  it('acepta un comodín en una escalera y rechaza dos comodines', () => {
    assert.equal(getMeldKind([tile('a', 'green', 4), tile('b', null, 0, 'joker'), tile('c', 'green', 6)]), 'run');
    assert.equal(getMeldKind([tile('a', 'green', 4), tile('b', null, 0, 'joker'), tile('c', null, 0, 'joker')]), null);
  });

  it('cuenta el #2 natural como ficha limpia', () => {
    const tiles = [2, 3, 4, 5, 6, 7, 8].map((value) => tile(`run-${value}`, 'green', value));
    const meld = { id: 'natural-two', kind: 'run', tiles, team: 0 };
    assert.equal(isCleanMeld(meld), true);
    assert.equal(isCleanMeld({ ...meld, tiles: [tile('x', 'green', 4), tile('wild', null, 0, 'joker'), tile('y', 'green', 6)] }), false);
  });

  it('crea las 106 fichas sin duplicar identificadores', () => {
    const game = createGame(2000, () => 0.5);
    const allTiles = [...game.stock, ...game.discard, ...game.deadPiles.flat(), ...game.players.flatMap((player) => player.hand)];
    assert.equal(allTiles.length, 106);
    assert.equal(new Set(allTiles.map((item) => item.id)).size, 106);
    assert.deepEqual(game.players.map((player) => player.hand.length), [11, 11]);
    assert.equal(game.stock.length, 62);
  });

  it('roba una ficha y alterna al siguiente jugador al descartar', () => {
    const initial = createGame(2000, () => 0.5);
    const drawn = drawFromStock(initial, 0);
    assert.equal(drawn.players[0].hand.length, 12);
    const afterDiscard = discardTile(drawn, 0, drawn.players[0].hand[0].id);
    assert.equal(afterDiscard.currentPlayer, 1);
    assert.equal(afterDiscard.phase, 'draw');
    assert.equal(afterDiscard.discard.length, 1);
  });

  it('levanta el pozo completo cuando se alcanza el mínimo de cinco fichas', () => {
    const initial = createGame(2000, () => 0.5);
    const pile = initial.stock.slice(0, 3);
    const state = { ...initial, discard: pile, stock: initial.stock.slice(3) };
    const lifted = takeDiscardPile(state, 0);
    assert.equal(lifted.discard.length, 0);
    assert.equal(lifted.players[0].hand.length, 14);
  });

  it('toma el muerto directamente al bajar la última ficha del atril', () => {
    const initial = createGame(2000, () => 0.5);
    const hand = [tile('a', 'red', 5), tile('b', 'red', 6), tile('c', 'red', 7)];
    const players = [...initial.players];
    players[0] = { ...players[0], hand };
    const state = { ...initial, players, phase: 'play' };
    const next = layMeld(state, 0, hand.map((item) => item.id));
    assert.equal(next.players[0].deadTaken, true);
    assert.equal(next.players[0].indirectDead, false);
    assert.equal(next.players[0].hand.length, 11);
  });

  it('toma el muerto indirectamente al quedarse sin fichas al descartar', () => {
    const initial = createGame(2000, () => 0.5);
    const lastTile = tile('last', 'blue', 9);
    const players = [...initial.players];
    players[0] = { ...players[0], hand: [lastTile] };
    const next = discardTile({ ...initial, players, phase: 'play' }, 0, lastTile.id);
    assert.equal(next.players[0].deadTaken, true);
    assert.equal(next.players[0].indirectDead, true);
    assert.equal(next.players[0].hand.length, 0);
    assert.equal(next.currentPlayer, 1);
  });

  it('ignora el atril si se tomó el muerto indirectamente y no se jugó después', () => {
    const initial = createGame(2000, () => 0.5);
    const meldTiles = [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`run-${value}`, 'red', value));
    const meld = { id: 'canasta', kind: 'run', tiles: meldTiles, team: 0 };
    const players = [...initial.players];
    players[0] = { ...players[0], hand: [tile('held', 'blue', 9)], deadTaken: true, indirectDead: true };
    players[1] = { ...players[1], hand: [] };
    const state = { ...initial, players, melds: [meld], stock: [], deadPiles: [[], []], phase: 'draw' };
    const ended = finishEmptyStock(state, 0);
    assert.equal(ended.scores[0], 145);
  });

  it('suma bono de canasta y cierre al cerrar legalmente', () => {
    const initial = createGame(2000, () => 0.5);
    const meldTiles = [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`run-${value}`, 'red', value));
    const meld = { id: 'canasta', kind: 'run', tiles: meldTiles, team: 0 };
    const lastTile = tile('last', 'blue', 9);
    const players = [...initial.players];
    players[0] = { ...players[0], hand: [lastTile], deadTaken: true };
    players[1] = { ...players[1], hand: [] };
    const state = { ...initial, players, melds: [meld], deadPiles: [[], []], phase: 'play' };
    const ended = discardTile(state, 0, lastTile.id);
    assert.equal(ended.phase, 'round-over');
    assert.equal(ended.scores[0], 445);
  });
});