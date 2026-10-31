import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addToMeld, createGame, discardOpeningDrawAndRedraw, discardTile, drawFromStock, finishEmptyStock, getMeldKind, isCleanMeld, keepOpeningDraw, layMeld, nextRound, takeDiscardPile } from '../.test-build/game.js';

const tile = (id, color, value, kind = 'number') => ({ id, color, value, kind });
const stateWithHand = (hand, melds = []) => {
  const initial = createGame(2000, () => 0.5);
  const players = [...initial.players];
  players[0] = { ...players[0], hand };
  return { ...initial, players, melds, deadPiles: [[], []], phase: 'play' };
};
const stateAfterDead = (hand, melds = []) => {
  const state = stateWithHand(hand, melds);
  const players = [...state.players];
  players[0] = { ...players[0], deadTaken: true };
  return { ...state, players };
};

describe('validación de combinaciones', () => {
  it('acepta piernas del mismo número con colores distintos', () => {
    assert.equal(getMeldKind([tile('a', 'red', 8), tile('b', 'blue', 8), tile('c', 'green', 8)]), 'leg');
  });

  it('acepta colores repetidos en una pierna', () => {
    assert.equal(getMeldKind([tile('a', 'red', 8), tile('b', 'red', 8), tile('c', 'green', 8)]), 'leg');
  });

  it('acepta una pierna con un comodín y rechaza dos o más comodines', () => {
    assert.equal(getMeldKind([tile('a', 'red', 8), tile('b', 'blue', 8), tile('c', null, 0, 'joker')]), 'leg');
    assert.equal(getMeldKind([tile('a', 'red', 8), tile('b', null, 0, 'joker'), tile('c', null, 0, 'joker')]), null);
    assert.equal(getMeldKind([tile('a', 'red', 8), tile('b', 'blue', 8), tile('c', 'green', 8), tile('d', null, 0, 'joker')]), 'leg');
  });

  it('acepta escaleras naturales y el 1 después del 13', () => {
    assert.equal(getMeldKind([tile('a', 'blue', 6), tile('b', 'blue', 7), tile('c', 'blue', 8)]), 'run');
    assert.equal(getMeldKind([tile('d', 'red', 13), tile('e', 'red', 1), tile('f', 'red', 12)]), 'run');
  });

  it('acepta un comodín en una escalera y rechaza dos comodines', () => {
    assert.equal(getMeldKind([tile('a', 'green', 4), tile('b', null, 0, 'joker'), tile('c', 'green', 6)]), 'run');
    assert.equal(getMeldKind([tile('a', 'green', 4), tile('b', null, 0, 'joker'), tile('c', null, 0, 'joker')]), null);
  });

  it('acepta una escalera con un 2 natural y otro comodín', () => {
    assert.equal(getMeldKind([
      tile('a', 'green', 2),
      tile('b', 'green', 3),
      tile('c', null, 0, 'joker'),
    ]), 'run');
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
    const opening = drawFromStock(initial, 0);
    const drawn = keepOpeningDraw(opening, 0);
    assert.equal(drawn.players[0].hand.length, 12);
    const afterDiscard = discardTile(drawn, 0, drawn.players[0].hand[0].id);
    assert.equal(afterDiscard.currentPlayer, 1);
    assert.equal(afterDiscard.phase, 'draw');
    assert.equal(afterDiscard.discard.length, 1);
    assert.equal(drawFromStock(afterDiscard, 1).phase, 'play');
  });

  it('permite al abridor descartar el primer robo y tomar una segunda ficha', () => {
    const initial = createGame(2000, () => 0.5);
    const opening = drawFromStock(initial, 0);
    const firstTile = opening.players[0].hand.at(-1);
    const secondTile = opening.stock.at(-1);
    const next = discardOpeningDrawAndRedraw(opening, 0);

    assert.equal(opening.phase, 'opening-choice');
    assert.deepEqual(next.discard.map((item) => item.id), [firstTile.id]);
    assert.ok(next.players[0].hand.some((item) => item.id === secondTile.id));
    assert.equal(next.players[0].hand.length, 12);
    assert.equal(next.stock.length, initial.stock.length - 2);
    assert.equal(next.phase, 'play');
    assert.equal(next.turnNumber, 0);
  });

  it('levanta el pozo completo cuando se alcanza el mínimo de cinco fichas', () => {
    const initial = createGame(2000, () => 0.5);
    const hand = [tile('hand-1', 'red', 6), tile('hand-2', 'blue', 7)];
    const pile = initial.stock.slice(0, 3);
    const players = [...initial.players];
    players[0] = { ...players[0], hand };
    const state = { ...initial, players, discard: pile, stock: initial.stock.slice(3) };
    const lifted = takeDiscardPile(state, 0);
    assert.equal(lifted.discard.length, 0);
    assert.equal(lifted.players[0].hand.length, 5);
  });

  it('rechaza levantar el pozo si atril y pozo suman menos de cinco fichas', () => {
    const initial = createGame(2000, () => 0.5);
    const hand = [tile('hand-1', 'red', 6)];
    const pile = initial.stock.slice(0, 3);
    const players = [...initial.players];
    players[0] = { ...players[0], hand };
    const state = { ...initial, players, discard: pile, stock: initial.stock.slice(3) };

    assert.throws(() => takeDiscardPile(state, 0), /cinco fichas/);
  });

  it('no permite bajar un juego no canasta si el equipo tomó el muerto y deja cero o una ficha', () => {
    const meldTiles = [tile('run-3', 'red', 3), tile('run-4', 'red', 4), tile('run-5', 'red', 5)];
    const handWithOneLeft = [...meldTiles, tile('keep-1', 'blue', 11)];
    assert.throws(() => layMeld(stateAfterDead(handWithOneLeft), 0, meldTiles.map((item) => item.id)), /canasta/i);
    assert.throws(() => layMeld(stateAfterDead(meldTiles), 0, meldTiles.map((item) => item.id)), /canasta/i);
  });

  it('no permite agregar a un juego no canasta si el equipo tomó el muerto y deja cero o una ficha', () => {
    const meldTiles = [tile('meld-3', 'red', 3), tile('meld-4', 'red', 4), tile('meld-5', 'red', 5)];
    const meld = { id: 'existing-run', kind: 'run', tiles: meldTiles, team: 0 };
    const added = tile('add-6', 'red', 6);
    const leftover = tile('keep-1', 'blue', 11);
    assert.throws(() => addToMeld(stateAfterDead([added, leftover], [meld]), 0, meld.id, [added.id]), /canasta/i);
    assert.throws(() => addToMeld(stateAfterDead([added], [meld]), 0, meld.id, [added.id]), /canasta/i);
  });

  it('permite bajar una canasta completa aunque el equipo ya tomó el muerto', () => {
    const canasta = [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`run-${value}`, 'red', value));
    const next = layMeld(stateAfterDead(canasta), 0, canasta.map((item) => item.id));
    assert.equal(next.phase, 'round-over');
    assert.equal(next.melds[0].tiles.length, 7);
  });

  it('permite completar una canasta al agregar una ficha y conserva las restantes en el atril', () => {
    const meldTiles = [3, 4, 5, 6, 7, 8].map((value) => tile(`meld-${value}`, 'red', value));
    const meld = { id: 'existing-run', kind: 'run', tiles: meldTiles, team: 0 };
    const added = tile('add-9', 'red', 9);
    const leftover = tile('keep-1', 'blue', 11);
    const next = addToMeld(stateAfterDead([added, leftover], [meld]), 0, meld.id, [added.id]);
    assert.equal(next.melds[0].tiles.length, 7);
    assert.deepEqual(next.players[0].hand.map((item) => item.id), [leftover.id]);
  });

  it('permite bajar un juego no canasta si el equipo ya tiene una canasta', () => {
    const canastaTiles = [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`canasta-${value}`, 'red', value));
    const canasta = { id: 'existing-canasta', kind: 'run', tiles: canastaTiles, team: 0 };
    const hand = [tile('new-3', 'blue', 3), tile('new-4', 'blue', 4), tile('new-5', 'blue', 5), tile('keep-1', 'yellow', 11)];
    const next = layMeld(stateAfterDead(hand, [canasta]), 0, hand.slice(0, 3).map((item) => item.id));

    assert.equal(next.melds.length, 2);
    assert.equal(next.melds[1].tiles.length, 3);
    assert.deepEqual(next.players[0].hand.map((item) => item.id), ['keep-1']);
  });

  it('permite agregar a un juego no canasta si el equipo ya tiene una canasta', () => {
    const canastaTiles = [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`canasta-${value}`, 'red', value));
    const canasta = { id: 'existing-canasta', kind: 'run', tiles: canastaTiles, team: 0 };
    const meldTiles = [tile('meld-3', 'blue', 3), tile('meld-4', 'blue', 4), tile('meld-5', 'blue', 5)];
    const meld = { id: 'existing-run', kind: 'run', tiles: meldTiles, team: 0 };
    const added = tile('add-6', 'blue', 6);
    const leftover = tile('keep-1', 'yellow', 11);
    const next = addToMeld(stateAfterDead([added, leftover], [canasta, meld]), 0, meld.id, [added.id]);

    assert.equal(next.melds[1].tiles.length, 4);
    assert.deepEqual(next.players[0].hand.map((item) => item.id), [leftover.id]);
  });

  it('permite agregar a un juego no canasta antes de que el equipo tome el muerto', () => {
    const meldTiles = [tile('meld-3', 'blue', 3), tile('meld-4', 'blue', 4), tile('meld-5', 'blue', 5)];
    const meld = { id: 'existing-run', kind: 'run', tiles: meldTiles, team: 0 };
    const added = tile('add-6', 'blue', 6);
    const leftover = tile('keep-1', 'yellow', 11);
    const next = addToMeld(stateWithHand([added, leftover], [meld]), 0, meld.id, [added.id]);

    assert.equal(next.melds[0].tiles.length, 4);
    assert.deepEqual(next.players[0].hand.map((item) => item.id), [leftover.id]);
    assert.equal(next.players[0].deadTaken, false);
  });

  it('no permite descartar la única ficha levantada del pozo en ese turno', () => {
    const initial = createGame(2000, () => 0.5);
    const hand = [
      tile('hand-1', 'red', 6),
      tile('hand-2', 'blue', 7),
      tile('hand-3', 'green', 8),
      tile('hand-4', 'yellow', 9),
    ];
    const onlyDiscard = tile('only-discard', 'red', 10);
    const players = [...initial.players];
    players[0] = { ...players[0], hand };
    const state = { ...initial, players, discard: [onlyDiscard] };
    const lifted = takeDiscardPile(state, 0);

    assert.throws(() => discardTile(lifted, 0, onlyDiscard.id), /única ficha levantada/);
    const afterOtherDiscard = discardTile(lifted, 0, hand[0].id);
    assert.deepEqual(afterOtherDiscard.discard.map((item) => item.id), [hand[0].id]);
    assert.ok(afterOtherDiscard.players[0].hand.some((item) => item.id === onlyDiscard.id));

    const multiHand = hand.slice(0, 3);
    const multiPile = initial.stock.slice(3, 5);
    players[0] = { ...players[0], hand: multiHand };
    const multiPileState = { ...initial, players, discard: multiPile };
    const liftedMultiple = takeDiscardPile(multiPileState, 0);
    const afterDiscardFromMultiple = discardTile(liftedMultiple, 0, multiPile[0].id);
    assert.ok(afterDiscardFromMultiple.discard.some((item) => item.id === multiPile[0].id));
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
    assert.deepEqual(next.players[0].hand.map((tile) => tile.id).sort(), initial.deadPiles[0].map((tile) => tile.id).sort());
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

  it('rotan el inicio de mano según la cantidad real de jugadores', () => {
    const initial = createGame(2000, () => 0.5, [0, 0], 1, 2);
    const players = [
      { ...initial.players[0], id: 0, team: 0, name: 'A' },
      { ...initial.players[1], id: 1, team: 1, name: 'B' },
      { ...initial.players[1], id: 2, team: 0, name: 'C' },
      { ...initial.players[1], id: 3, team: 1, name: 'D' },
    ];
    const state = { ...initial, players, phase: 'round-over', roundStarter: 2, currentPlayer: 2, scores: [10, 10, 10, 10] };
    const next = nextRound(state);
    assert.equal(next.roundStarter, 3);
    assert.equal(next.currentPlayer, 3);
  });

  it('termina la mano por corte sin cierre si se agota el montón', () => {
    const initial = createGame('cut', () => 0.5);
    const exhausted = { ...initial, stock: [], discard: [], deadPiles: [[], []], phase: 'draw' };
    const ended = finishEmptyStock(exhausted, 0);
    assert.equal(ended.phase, 'match-over');
    assert.equal(ended.winner, null);
    assert.match(ended.result, /agotar|agotaron/i);
  });
});