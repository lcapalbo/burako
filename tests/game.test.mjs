import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addToMeld, createGame, discardOpeningDrawAndRedraw, discardTile, drawFromStock, findBestMeld, finishEmptyStock, getMeldKind, isCanasta, isCleanMeld, keepOpeningDraw, layMeld, nextRound, sortTiles, sortTilesByNumber, takeDiscardPile, tilePoints } from '../.test-build/game.js';
import { runComputerTurn } from '../.test-build/computer.js';

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
const computerState = ({ hand, melds = [], stock = [], discard = [], deadTaken = false, phase = 'draw', restrictedDiscardTileId = null }) => {
  const initial = createGame(2000, () => 0.5);
  const players = [...initial.players];
  players[1] = { ...players[1], hand, deadTaken };
  return { ...initial, players, melds, stock, discard, phase, currentPlayer: 1, deadPiles: [[], []], restrictedDiscardTileId };
};
const exhaustiveBestMeld = (hand) => {
  let best = null;
  let bestValue = 0;
  const selected = [];
  const search = (start) => {
    if (selected.length >= 3) {
      const kind = getMeldKind(selected);
      const value = kind ? selected.length * 10 + (selected.length >= 7 ? 100 : 0) + (kind === 'run' ? 2 : 0) : 0;
      if (value > bestValue) {
        best = [...selected];
        bestValue = value;
      }
    }
    for (let index = start; index < hand.length; index += 1) {
      selected.push(hand[index]);
      search(index + 1);
      selected.pop();
    }
  };
  search(0);
  return best;
};

describe('combinaciones, comodines y canastas', () => {
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

  it('acepta el #1 antes del #2 y limita las escaleras a 14 fichas', () => {
    assert.equal(getMeldKind([
      tile('one', 'green', 1),
      tile('two', 'green', 2),
      tile('three', 'green', 3),
    ]), 'run');

    const maximumRun = Array.from({ length: 13 }, (_, index) => tile(`run-${index + 1}`, 'green', index + 1));
    maximumRun.push(tile('run-second-one', 'green', 1));
    assert.equal(maximumRun.length, 14);
    assert.equal(getMeldKind(maximumRun), 'run');
    assert.equal(getMeldKind([...maximumRun, tile('run-overflow', 'green', 1)]), null);
  });

  it('acepta un comodín en una escalera y rechaza dos comodines', () => {
    assert.equal(getMeldKind([tile('a', 'green', 4), tile('b', null, 0, 'joker'), tile('c', 'green', 6)]), 'run');
    assert.equal(getMeldKind([tile('a', 'green', 4), tile('b', null, 0, 'joker'), tile('c', null, 0, 'joker')]), null);
  });

  it('usa un #2 de otro color como comodín en una escalera', () => {
    const four = tile('green-4', 'green', 4);
    const wildTwo = tile('blue-2', 'blue', 2);
    const six = tile('green-6', 'green', 6);
    const leftover = tile('leftover-for-wild-two', 'red', 9);
    const state = stateWithHand([six, wildTwo, four, leftover]);

    const next = layMeld(state, 0, [six.id, wildTwo.id, four.id]);
    const meld = next.melds[0];

    assert.equal(meld.kind, 'run');
    assert.deepEqual(meld.tiles.map((item) => item.id), [four.id, wildTwo.id, six.id]);
    assert.equal(isCleanMeld(meld), false);
  });

  it('permite un #2 natural y un segundo #2 como comodín en una escalera', () => {
    const naturalTwo = tile('natural-two-run', 'green', 2);
    const wildTwo = tile('wild-two-run', 'green', 2);
    const meld = {
      id: 'two-wild-run',
      kind: 'run',
      tiles: [naturalTwo, tile('three-run', 'green', 3), tile('four-run', 'green', 4), wildTwo],
      team: 0,
    };

    assert.equal(getMeldKind(meld.tiles), 'run');
    assert.equal(isCleanMeld(meld), false);
  });

  it('ordena una escalera bajada y reubica el comodín al agregar una ficha', () => {
    const eleven = tile('eleven', 'green', 11);
    const nine = tile('nine', 'green', 9);
    const joker = tile('joker', null, 0, 'joker');
    const ten = tile('ten', 'green', 10);
    const leftover = tile('leftover', 'blue', 5);
    const state = stateWithHand([eleven, nine, joker, ten, leftover]);

    const laid = layMeld(state, 0, [eleven.id, nine.id, joker.id]);
    assert.deepEqual(laid.melds[0].tiles.map((item) => item.id), [nine.id, joker.id, eleven.id]);

    const extended = addToMeld(laid, 0, laid.melds[0].id, [ten.id]);
    const orderedIds = extended.melds[0].tiles.map((item) => item.id);
    const allowedOrders = [
      [joker.id, nine.id, ten.id, eleven.id],
      [nine.id, ten.id, eleven.id, joker.id],
    ];
    assert.ok(allowedOrders.some((order) => order.every((id, index) => id === orderedIds[index])));
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

  it('marca como canasta desde siete fichas y distingue limpia de sucia', () => {
    const sixTileRun = [3, 4, 5, 6, 7, 8].map((value) => tile(`six-${value}`, 'red', value));
    const cleanCanasta = {
      id: 'clean-canasta',
      kind: 'run',
      tiles: [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`clean-${value}`, 'red', value)),
      team: 0,
    };
    const dirtyCanasta = {
      id: 'dirty-canasta',
      kind: 'run',
      tiles: [
        tile('dirty-3', 'blue', 3),
        tile('dirty-4', 'blue', 4),
        tile('dirty-joker', null, 0, 'joker'),
        tile('dirty-6', 'blue', 6),
        tile('dirty-7', 'blue', 7),
        tile('dirty-8', 'blue', 8),
        tile('dirty-9', 'blue', 9),
      ],
      team: 0,
    };

    assert.equal(isCanasta({ ...cleanCanasta, tiles: sixTileRun }), false);
    assert.equal(isCanasta(cleanCanasta), true);
    assert.equal(isCleanMeld(cleanCanasta), true);
    assert.equal(isCanasta(dirtyCanasta), true);
    assert.equal(isCleanMeld(dirtyCanasta), false);
  });
});

describe('puntaje de fichas', () => {
  it('asigna los puntajes acordados a todos los valores y al comodín', () => {
    const numberedPoints = Array.from({ length: 13 }, (_, index) => tilePoints(tile(`points-${index + 1}`, 'red', index + 1)));
    assert.deepEqual(numberedPoints, [15, 20, 5, 5, 5, 5, 5, 10, 10, 10, 10, 10, 10]);
    assert.equal(tilePoints(tile('points-joker', null, 0, 'joker')), 50);
  });
});

describe('ordenamiento del atril', () => {
  it('ordena por color y mantiene intacto el orden de entrada', () => {
    const hand = [tile('green-3', 'green', 3), tile('blue-1', 'blue', 1), tile('red-7', 'red', 7), tile('red-1', 'red', 1)];

    assert.deepEqual(sortTiles(hand).map((item) => item.id), ['red-1', 'red-7', 'blue-1', 'green-3']);
    assert.deepEqual(hand.map((item) => item.id), ['green-3', 'blue-1', 'red-7', 'red-1']);
  });

  it('ordena por número y usa el color para desempatar', () => {
    const hand = [tile('green-3', 'green', 3), tile('blue-1', 'blue', 1), tile('red-7', 'red', 7), tile('red-1', 'red', 1)];

    assert.deepEqual(sortTilesByNumber(hand).map((item) => item.id), ['red-1', 'blue-1', 'green-3', 'red-7']);
    assert.deepEqual(hand.map((item) => item.id), ['green-3', 'blue-1', 'red-7', 'red-1']);
  });
});

describe('búsqueda de juegos', () => {
  it('conserva los resultados de la búsqueda exhaustiva con piernas, escaleras y comodines', () => {
    const hands = [
      [tile('unrelated-blue-1', 'blue', 1), tile('unrelated-green-9', 'green', 9), tile('unrelated-red-5', 'red', 5), tile('unrelated-yellow-11', 'yellow', 11)],
      [tile('leg-8-red', 'red', 8), tile('leg-8-blue', 'blue', 8), tile('leg-8-green', 'green', 8), tile('leg-4-yellow', 'yellow', 4)],
      [tile('run-4-green', 'green', 4), tile('run-6-green', 'green', 6), tile('run-wild-two-blue', 'blue', 2), tile('run-13-red', 'red', 13)],
      [tile('run-13-red-a', 'red', 13), tile('run-1-red', 'red', 1), tile('run-12-red', 'red', 12), tile('run-joker', null, 0, 'joker')],
      [tile('double-two-green-a', 'green', 2), tile('double-two-green-b', 'green', 2), tile('double-two-green-3', 'green', 3), tile('double-two-green-4', 'green', 4)],
    ];

    for (const hand of hands) {
      const expected = exhaustiveBestMeld(hand)?.map((item) => item.id) ?? null;
      const actual = findBestMeld(hand)?.map((item) => item.id) ?? null;
      assert.deepEqual(actual, expected);
    }
  });
});

describe('reparto y turnos', () => {
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
});

describe('muerto, cierre y jugadas', () => {
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
});

describe('puntaje de la mano', () => {
  it('detalla canasta sucia, muerto, fichas bajadas y fichas en atril', () => {
    const initial = createGame(5000, () => 0.5, [10, -20], 2);
    const dirtyTiles = [3, 4, 6, 7, 8, 9].map((value) => tile(`dirty-detail-${value}`, 'red', value));
    dirtyTiles.push(tile('dirty-detail-joker', null, 0, 'joker'));
    const players = [...initial.players];
    players[0] = { ...players[0], hand: [tile('detail-human-rack', 'blue', 5)], deadTaken: true };
    players[1] = { ...players[1], hand: [tile('detail-computer-rack', 'green', 9)] };
    const state = {
      ...initial,
      players,
      melds: [{ id: 'dirty-detail-canasta', kind: 'run', tiles: dirtyTiles, team: 0 }],
      stock: [],
      deadPiles: [[], []],
      phase: 'draw',
    };

    const ended = finishEmptyStock(state, 0);

    assert.deepEqual(ended.roundHistory[0].scores[0], {
      cleanCanastas: 0,
      dirtyCanastas: 100,
      dead: 100,
      closure: 0,
      meldTiles: 90,
      rackTiles: -5,
      total: 285,
    });
    assert.deepEqual(ended.roundHistory[0].scores[1], {
      cleanCanastas: 0,
      dirtyCanastas: 0,
      dead: -100,
      closure: 0,
      meldTiles: 0,
      rackTiles: -10,
      total: -110,
    });
    assert.deepEqual(ended.scores, [295, -130]);
  });

  it('ignora el atril si se tomó el muerto indirectamente y no se jugó después', () => {
    const initial = createGame(2000, () => 0.5);
    const meldTiles = [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`run-${value}`, 'red', value));
    const meld = { id: 'canasta', kind: 'run', tiles: meldTiles, team: 0 };
    const players = [...initial.players];
    players[0] = { ...players[0], hand: [...initial.deadPiles[0]], deadTaken: true, indirectDead: true };
    players[1] = { ...players[1], hand: [] };
    const state = { ...initial, players, melds: [meld], stock: [], deadPiles: [[], []], phase: 'draw' };
    assert.equal(state.players[0].hand.length, 11);
    const ended = finishEmptyStock(state, 0);
    assert.equal(ended.scores[0], 145);
  });

  it('suma el bono del muerto indirecto si el jugador vuelve a jugar y resta su atril', () => {
    const initial = createGame(2000, () => 0.5);
    const meldTiles = [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`played-after-dead-${value}`, 'red', value));
    const meld = { id: 'canasta-after-dead', kind: 'run', tiles: meldTiles, team: 0 };
    const players = [...initial.players];
    players[0] = {
      ...players[0],
      hand: [tile('after-dead-one', 'blue', 1)],
      deadTaken: true,
      indirectDead: true,
      playedAfterDead: true,
    };
    players[1] = { ...players[1], hand: [] };
    const state = { ...initial, players, melds: [meld], stock: [], deadPiles: [[], []], phase: 'draw' };

    const ended = finishEmptyStock(state, 0);
    assert.equal(ended.scores[0], 330);
  });

  it('puntúa la canasta sucia con bono de 100 y aplica el bono del muerto levantado', () => {
    const initial = createGame(2000, () => 0.5);
    const meld = {
      id: 'dirty-canasta-score',
      kind: 'run',
      tiles: [
        tile('dirty-score-3', 'red', 3),
        tile('dirty-score-4', 'red', 4),
        tile('dirty-score-joker', null, 0, 'joker'),
        tile('dirty-score-6', 'red', 6),
        tile('dirty-score-7', 'red', 7),
        tile('dirty-score-8', 'red', 8),
        tile('dirty-score-9', 'red', 9),
      ],
      team: 0,
    };
    const players = [...initial.players];
    players[0] = { ...players[0], hand: [], deadTaken: true };
    players[1] = { ...players[1], hand: [] };
    const state = { ...initial, players, melds: [meld], stock: [], deadPiles: [[], []], phase: 'draw' };

    const ended = finishEmptyStock(state, 0);
    assert.equal(ended.scores[0], 290);
    assert.equal(ended.scores[1], -100);
  });

  it('resuelve correctamente cuando ambos equipos superan el objetivo en la misma mano', () => {
    const initial = createGame(2000, () => 0.5, [1990, 1990]);
    const makeCleanCanasta = (team, prefix) => ({
      id: `${prefix}-canasta`,
      kind: 'run',
      tiles: [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`${prefix}-${value}`, 'red', value)),
      team,
    });
    const makeDirtyCanasta = () => ({
      id: 'target-dirty-canasta',
      kind: 'run',
      tiles: [
        tile('target-dirty-3', 'blue', 3),
        tile('target-dirty-4', 'blue', 4),
        tile('target-dirty-joker', null, 0, 'joker'),
        tile('target-dirty-6', 'blue', 6),
        tile('target-dirty-7', 'blue', 7),
        tile('target-dirty-8', 'blue', 8),
        tile('target-dirty-9', 'blue', 9),
      ],
      team: 1,
    });
    const exhaustedState = (melds) => ({
      ...initial,
      players: initial.players.map((player) => ({ ...player, hand: [], deadTaken: true })),
      melds,
      stock: [],
      deadPiles: [[], []],
      phase: 'draw',
    });

    const higherScoreWins = finishEmptyStock(exhaustedState([makeCleanCanasta(0, 'higher'), makeDirtyCanasta()]), 0);
    assert.deepEqual(higherScoreWins.scores, [2335, 2280]);
    assert.equal(higherScoreWins.phase, 'match-over');
    assert.equal(higherScoreWins.winner, 0);

    const tiedScore = finishEmptyStock(exhaustedState([makeCleanCanasta(0, 'tie-a'), makeCleanCanasta(1, 'tie-b')]), 0);
    assert.deepEqual(tiedScore.scores, [2335, 2335]);
    assert.equal(tiedScore.phase, 'match-over');
    assert.equal(tiedScore.winner, null);
    assert.match(tiedScore.result, /empate/i);
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
    assert.deepEqual(ended.roundHistory[0].scores[0], {
      cleanCanastas: 200,
      dirtyCanastas: 0,
      dead: 100,
      closure: 100,
      meldTiles: 45,
      rackTiles: 0,
      total: 445,
    });
  });
});

describe('nueva mano y rotación', () => {
  it('reparte fichas nuevas al iniciar otra mano, sin conservar fichas de la anterior', () => {
    const initial = createGame(2000, () => 0.5, [120, 80], 4, 0);
    const oldTiles = Array.from({ length: 10 }, (_, index) => tile(`old-${index}`, 'red', index + 1));
    const players = [...initial.players];
    players[0] = { ...players[0], hand: oldTiles.slice(0, 2) };
    players[1] = { ...players[1], hand: oldTiles.slice(2, 3) };
    const state = {
      ...initial,
      players,
      stock: [oldTiles[3]],
      discard: [oldTiles[4]],
      deadPiles: [[oldTiles[5]], [oldTiles[6]]],
      melds: [{ id: 'old-meld', kind: 'leg', tiles: oldTiles.slice(7, 10), team: 0 }],
      phase: 'round-over',
    };

    const next = nextRound(state);
    const allTiles = [
      ...next.stock,
      ...next.discard,
      ...next.deadPiles.flat(),
      ...next.players.flatMap((player) => player.hand),
      ...next.melds.flatMap((meld) => meld.tiles),
    ];
    const nextTileIds = new Set(allTiles.map((item) => item.id));

    assert.deepEqual(next.players.map((player) => player.hand.length), [11, 11]);
    assert.deepEqual(next.deadPiles.map((pile) => pile.length), [11, 11]);
    assert.equal(next.stock.length, 62);
    assert.equal(next.discard.length, 0);
    assert.equal(next.melds.length, 0);
    assert.equal(allTiles.length, 106);
    assert.equal(nextTileIds.size, 106);
    assert.ok(oldTiles.every((item) => !nextTileIds.has(item.id)));
    assert.deepEqual(next.scores, [120, 80]);
    assert.deepEqual(next.roundHistory, state.roundHistory ?? []);
    assert.equal(next.round, 5);
    assert.equal(next.roundStarter, 1);
    assert.equal(next.currentPlayer, 1);
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
});

describe('cierre por corte', () => {
  it('anuncia correctamente cuando vos cortás la mano', () => {
    const initial = createGame('cut', () => 0.5);
    const canasta = [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`cut-human-${value}`, 'red', value));
    const players = [...initial.players];
    players[0] = { ...players[0], hand: canasta, deadTaken: true };
    const state = { ...initial, players, currentPlayer: 0, deadPiles: [[], []], phase: 'play' };

    const ended = layMeld(state, 0, canasta.map((item) => item.id));

    assert.equal(ended.phase, 'match-over');
    assert.equal(ended.winner, 0);
    assert.equal(ended.result, '¡Vos cortaste la mano!');
  });

  it('anuncia correctamente cuando la computadora corta la mano', () => {
    const initial = createGame('cut', () => 0.5);
    const canasta = [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`cut-computer-${value}`, 'blue', value));
    const players = [...initial.players];
    players[1] = { ...players[1], hand: canasta, deadTaken: true };
    const state = { ...initial, players, currentPlayer: 1, deadPiles: [[], []], phase: 'play' };

    const ended = layMeld(state, 1, canasta.map((item) => item.id));

    assert.equal(ended.phase, 'match-over');
    assert.equal(ended.winner, 1);
    assert.equal(ended.result, '¡La computadora cortó la mano!');
  });
});

describe('fin por agotamiento del montón', () => {
  it('termina la mano por corte sin cierre si se agota el montón', () => {
    const initial = createGame('cut', () => 0.5);
    const exhausted = { ...initial, stock: [], discard: [], deadPiles: [[], []], phase: 'draw' };
    const ended = finishEmptyStock(exhausted, 0);
    assert.equal(ended.phase, 'match-over');
    assert.equal(ended.winner, null);
    assert.match(ended.result, /agotar|agotaron/i);
  });

  it('termina la mano si se agota el montón y no reúne cinco fichas para levantar el pozo', () => {
    const initial = createGame(2000, () => 0.5);
    const hand = [tile('cannot-lift-5', 'blue', 5), tile('cannot-lift-7', 'green', 7)];
    const discard = initial.stock.slice(0, 2);
    const players = [...initial.players];
    players[0] = { ...players[0], hand, deadTaken: true };
    players[1] = { ...players[1], hand: [] };
    const state = { ...initial, players, stock: [], discard, deadPiles: [[], []], phase: 'draw' };

    assert.equal(hand.length + discard.length, 4);
    assert.throws(() => takeDiscardPile(state, 0), /cinco fichas/);
    const ended = finishEmptyStock(state, 0);
    assert.equal(ended.phase, 'round-over');
    assert.deepEqual(ended.scores, [90, -100]);
  });

  it('puede seguir jugando el turno si levanta el pozo con el montón vacío', () => {
    const initial = createGame(2000, () => 0.5);
    const hand = [tile('continue-hand-1', 'blue', 5), tile('continue-hand-2', 'green', 7)];
    const discard = initial.stock.slice(0, 3);
    const players = [...initial.players];
    players[0] = { ...players[0], hand };
    const state = { ...initial, players, stock: [], discard, deadPiles: [[], []], phase: 'draw' };

    const lifted = takeDiscardPile(state, 0);
    assert.equal(lifted.phase, 'play');
    assert.equal(lifted.players[0].hand.length, 5);
    assert.equal(lifted.discard.length, 0);

    const afterDiscard = discardTile(lifted, 0, hand[0].id);
    assert.equal(afterDiscard.phase, 'draw');
    assert.equal(afterDiscard.currentPlayer, 1);
    assert.equal(afterDiscard.players[0].hand.length, 4);
  });

  it('termina por puntos si se agota el montón y no se levanta un pozo disponible, sin bono de cierre', () => {
    const initial = createGame(2000, () => 0.5);
    const meldTiles = [3, 4, 5, 6, 7, 8, 9].map((value) => tile(`exhausted-${value}`, 'green', value));
    const meld = { id: 'exhausted-canasta', kind: 'run', tiles: meldTiles, team: 0 };
    const hand = [
      tile('exhausted-hand-1', 'blue', 1),
      tile('exhausted-hand-3', 'blue', 3),
      tile('exhausted-hand-4', 'blue', 4),
      tile('exhausted-hand-5', 'blue', 5),
    ];
    const discard = [tile('available-discard', 'yellow', 6)];
    const players = [...initial.players];
    players[0] = { ...players[0], hand, deadTaken: true };
    players[1] = { ...players[1], hand: [] };
    const state = { ...initial, players, melds: [meld], stock: [], discard, deadPiles: [[], []], phase: 'draw' };

    assert.equal(hand.length + discard.length, 5);
    assert.equal(takeDiscardPile(state, 0).phase, 'play');
    const ended = finishEmptyStock(state, 0);
    assert.equal(ended.phase, 'round-over');
    assert.deepEqual(ended.scores, [315, -100]);
    assert.equal(ended.result, 'Terminó la mano.');
  });
});

describe('turnos de la computadora', () => {
  it('roba del montón si una ficha del pozo completaría juego pero no reúne cinco fichas', () => {
    const hand = [tile('computer-green-9', 'green', 9), tile('computer-green-7', 'green', 7), tile('computer-red-7', 'red', 7)];
    const topDiscard = tile('computer-green-8-discard', 'green', 8);
    const stockTile = tile('computer-stock-tile', 'blue', 5);
    const state = computerState({ hand, stock: [stockTile], discard: [topDiscard], deadTaken: true });

    const next = runComputerTurn(state);

    assert.equal(next.phase, 'draw');
    assert.equal(next.currentPlayer, 0);
    assert.deepEqual(next.stock, []);
    assert.equal(next.players[1].hand.length, 3);
    assert.ok(next.discard.some((item) => item.id === topDiscard.id));
  });

  it('rechaza agregar fichas que dejarían una ficha sin canasta y completa el turno', () => {
    const existing = [tile('meld-eight-red', 'red', 8), tile('meld-eight-blue', 'blue', 8), tile('meld-eight-green', 'green', 8)];
    const meld = { id: 'computer-leg-eight', kind: 'leg', tiles: existing, team: 1 };
    const hand = [tile('computer-eight-yellow', 'yellow', 8), tile('computer-eight-red-copy', 'red', 8)];
    const state = computerState({ hand, melds: [meld], deadTaken: true, phase: 'play' });

    const next = runComputerTurn(state);

    assert.equal(next.phase, 'draw');
    assert.equal(next.currentPlayer, 0);
    assert.equal(next.melds[0].tiles.length, 3);
    assert.equal(next.players[1].hand.length, 1);
  });

  it('elige una combinación menor en vez de bajar una que dejaría una ficha sin canasta', () => {
    const hand = [
      tile('computer-eight-red-0', 'red', 8),
      tile('computer-eight-blue-0', 'blue', 8),
      tile('computer-eight-green-0', 'green', 8),
      tile('computer-eight-yellow-0', 'yellow', 8),
      tile('computer-eight-red-1', 'red', 8),
    ];
    const state = computerState({ hand, deadTaken: true, phase: 'play' });

    const next = runComputerTurn(state);

    assert.equal(next.phase, 'draw');
    assert.equal(next.currentPlayer, 0);
    assert.equal(next.melds.length, 1);
    assert.equal(next.melds[0].tiles.length, 3);
    assert.equal(next.players[1].hand.length, 1);
  });

  it('no descarta la única ficha restringida después de levantar un pozo de una ficha', () => {
    const restricted = tile('computer-restricted-discard', 'green', 3);
    const hand = [restricted, tile('computer-discard-four', 'blue', 4), tile('computer-discard-nine', 'red', 9)];
    const state = computerState({ hand, phase: 'play', restrictedDiscardTileId: restricted.id });

    const next = runComputerTurn(state);

    assert.equal(next.phase, 'draw');
    assert.equal(next.currentPlayer, 0);
    assert.equal(next.discard[0].id === restricted.id, false);
    assert.ok(next.players[1].hand.some((item) => item.id === restricted.id));
  });

  it('termina la mano cuando el montón está vacío y no hay cinco fichas para levantar', () => {
    const hand = [tile('computer-cannot-lift-1', 'blue', 5), tile('computer-cannot-lift-2', 'green', 7)];
    const state = computerState({ hand, discard: [tile('computer-cannot-lift-discard-1', 'red', 9), tile('computer-cannot-lift-discard-2', 'yellow', 4)] });

    const next = runComputerTurn(state);

    assert.equal(next.phase, 'round-over');
    assert.match(next.result, /Terminó la mano/);
  });

  it('extiende una pierna con el mismo número o un comodín, no con fichas incompatibles', () => {
    const meld = {
      id: 'computer-leg-eights',
      kind: 'leg',
      tiles: [tile('leg-eight-red', 'red', 8), tile('leg-eight-blue', 'blue', 8), tile('leg-eight-green', 'green', 8)],
      team: 1,
    };
    const matching = tile('computer-leg-eight-yellow', 'yellow', 8);
    const wild = tile('computer-leg-wild-two', 'red', 2);
    const hand = [tile('computer-leg-unmatched-1', 'blue', 1), matching, tile('computer-leg-unmatched-9', 'green', 9), wild];
    const state = computerState({ hand, melds: [meld], phase: 'play' });

    const next = runComputerTurn(state);

    assert.ok(next.melds[0].tiles.some((item) => item.id === matching.id));
    assert.ok(next.melds[0].tiles.some((item) => item.id === wild.id));
    assert.equal(next.melds[0].tiles.length, 5);
    assert.ok(next.melds[0].tiles.every((item) => item.id !== 'computer-leg-unmatched-1'));
    assert.ok(next.melds[0].tiles.every((item) => item.id !== 'computer-leg-unmatched-9'));
  });

  it('extiende una escalera con el mismo color o un comodín, no con fichas incompatibles', () => {
    const meld = {
      id: 'computer-green-run',
      kind: 'run',
      tiles: [tile('run-existing-4', 'green', 4), tile('run-existing-5', 'green', 5), tile('run-existing-6', 'green', 6)],
      team: 1,
    };
    const matching = tile('computer-run-7-green', 'green', 7);
    const wild = tile('computer-run-joker', null, 0, 'joker');
    const unmatched = [tile('computer-run-unmatched-red-7', 'red', 7), tile('computer-run-unmatched-blue-12', 'blue', 12)];
    const state = computerState({ hand: [...unmatched, matching, wild], melds: [meld], phase: 'play' });

    const next = runComputerTurn(state);

    assert.ok(next.melds[0].tiles.some((item) => item.id === matching.id));
    assert.ok(next.melds[0].tiles.some((item) => item.id === wild.id));
    assert.equal(next.melds[0].tiles.length, 5);
    for (const tile of unmatched) assert.ok(next.melds[0].tiles.every((item) => item.id !== tile.id));
  });
});