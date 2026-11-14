import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGame as createGameWithRandomStarter, getMeldKind } from '../.test-build/game.js';
import { chooseDiscard, findBestMeld, runComputerTurn, runComputerTurnSteps } from '../.test-build/computer.js';

const tile = (id, color, value, kind = 'number') => ({ id, color, value, kind });
const createGame = (target = 2000, random = Math.random, scores = [0, 0], round = 1, starter = 0) =>
  createGameWithRandomStarter(target, random, scores, round, starter);
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

describe('descarte de la computadora', () => {
  it('elige una ficha poco útil y respeta la ficha excluida', () => {
    const one = tile('computer-discard-one', 'red', 1);
    const thirteen = tile('computer-discard-thirteen', 'blue', 13);
    const joker = tile('computer-discard-joker', null, 0, 'joker');
    const hand = [one, thirteen, joker];

    assert.equal(chooseDiscard(hand), one);
    assert.equal(chooseDiscard(hand, one.id), thirteen);
    assert.throws(() => chooseDiscard([one], one.id), /No hay una ficha legal para descartar/);
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

  it('considera las diez fichas superiores y puede formar un juego con dos del pozo y dos del atril', () => {
    const hand = [
      tile('computer-run-five', 'green', 5),
      tile('computer-run-eight', 'green', 8),
      tile('computer-unrelated-one', 'blue', 1),
      tile('computer-unrelated-eleven', 'red', 11),
      tile('computer-unrelated-four', 'yellow', 4),
    ];
    const discard = [
      tile('computer-run-six-discard', 'green', 6),
      tile('computer-run-joker-discard', null, 0, 'joker'),
    ];
    const state = computerState({ hand, discard, stock: [tile('computer-ten-stock', 'red', 10)] });

    const steps = runComputerTurnSteps(state);

    assert.equal(steps[0].discard.length, 0);
    assert.ok(steps.some((step) => step.melds.some((meld) => meld.tiles.length === 4)));
  });

  it('levanta el pozo cuando un comodín completa una combinación compatible', () => {
    const five = tile('computer-wild-run-five', 'green', 5);
    const six = tile('computer-wild-run-six', 'green', 6);
    const joker = tile('computer-wild-run-joker', null, 0, 'joker');
    const unrelated = [tile('computer-wild-unrelated-red-twelve', 'red', 12), tile('computer-wild-unrelated-yellow-thirteen', 'yellow', 13)];
    const state = computerState({
      hand: [five, unrelated[0]],
      discard: [six, joker, unrelated[1]],
      stock: [tile('computer-wild-stock', 'blue', 4)],
    });

    const steps = runComputerTurnSteps(state);
    const meld = steps.flatMap((step) => step.melds).find((candidate) => candidate.tiles.some((item) => item.id === joker.id));

    assert.equal(steps[0].discard.length, 0);
    assert.equal(meld?.kind, 'run');
    assert.ok(meld?.tiles.some((item) => item.id === five.id));
    assert.ok(meld?.tiles.some((item) => item.id === six.id));
    assert.ok(meld?.tiles.every((item) => !unrelated.some((other) => other.id === item.id)));
  });

  it('no levanta el pozo si el comodín no puede hacer compatibles las fichas', () => {
    const state = computerState({
      hand: [tile('computer-incompatible-red-eight', 'red', 8), tile('computer-incompatible-blue-nine', 'blue', 9)],
      discard: [
        tile('computer-incompatible-green-seven', 'green', 7),
        tile('computer-incompatible-joker', null, 0, 'joker'),
        tile('computer-incompatible-yellow-twelve', 'yellow', 12),
      ],
      stock: [tile('computer-incompatible-stock', 'blue', 4)],
    });

    const steps = runComputerTurnSteps(state);

    assert.equal(steps[0].discard.length, 3);
    assert.equal(steps[0].stock.length, 0);
    assert.ok(steps.every((step) => step.melds.length === 0));
  });

  it('levanta un pozo de hasta diez fichas si el juego está entre las fichas superiores', () => {
    const hand = [tile('computer-top-ten-hand-1', 'blue', 4), tile('computer-top-ten-hand-2', 'red', 9)];
    const discard = [
      tile('computer-top-ten-old-1', 'red', 1),
      tile('computer-top-ten-old-2', 'blue', 4),
      tile('computer-top-ten-old-3', 'green', 9),
      tile('computer-top-ten-old-4', 'yellow', 3),
      tile('computer-top-ten-old-5', 'red', 6),
      tile('computer-top-ten-old-6', 'blue', 8),
      tile('computer-top-ten-old-7', 'green', 12),
      tile('computer-top-ten-match-1', 'yellow', 8),
      tile('computer-top-ten-match-2', 'red', 8),
      tile('computer-top-ten-match-3', 'blue', 8),
    ];
    const state = computerState({ hand, discard, stock: [tile('computer-top-ten-stock', 'green', 5)] });

    const steps = runComputerTurnSteps(state);

    assert.equal(steps[0].discard.length, 0);
    assert.equal(steps[0].players[1].hand.length, 12);
  });

  it('no considera fichas anteriores a las diez superiores del pozo', () => {
    const hand = [tile('computer-outside-hand-1', 'red', 8), tile('computer-outside-hand-2', 'blue', 12)];
    const discard = [
      tile('computer-outside-match-1', 'yellow', 8),
      tile('computer-outside-match-2', 'green', 8),
      tile('computer-outside-match-3', 'blue', 8),
      tile('computer-outside-1', 'red', 1),
      tile('computer-outside-2', 'red', 5),
      tile('computer-outside-3', 'red', 9),
      tile('computer-outside-4', 'blue', 2),
      tile('computer-outside-5', 'blue', 6),
      tile('computer-outside-6', 'blue', 10),
      tile('computer-outside-7', 'green', 3),
      tile('computer-outside-8', 'green', 7),
    ];
    const state = computerState({ hand, discard, stock: [tile('computer-outside-stock', 'yellow', 11)] });

    const steps = runComputerTurnSteps(state);

    assert.notEqual(steps[0].discard.length, 0);
    assert.equal(steps[0].stock.length, 0);
  });

  it('levanta el pozo cuando una ficha completa una canasta de un juego propio', () => {
    const meld = {
      id: 'computer-near-canasta',
      kind: 'leg',
      tiles: Array.from({ length: 6 }, (_, index) => tile(`computer-near-canasta-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
      team: 1,
    };
    const hand = [tile('computer-canasta-hand-1', 'red', 1), tile('computer-canasta-hand-2', 'blue', 4), tile('computer-canasta-hand-3', 'green', 9), tile('computer-canasta-hand-4', 'yellow', 12)];
    const state = computerState({ hand, melds: [meld], discard: [tile('computer-canasta-discard', 'red', 8)], stock: [tile('computer-canasta-stock', 'blue', 10)] });

    const steps = runComputerTurnSteps(state);

    assert.equal(steps[0].discard.length, 0);
    assert.equal(steps[1].melds[0].tiles.length, 7);
  });

  it('levanta el pozo cuando una ficha lleva un juego de cinco a seis', () => {
    const meld = {
      id: 'computer-six-tile-meld',
      kind: 'leg',
      tiles: Array.from({ length: 5 }, (_, index) => tile(`computer-six-tile-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 9)),
      team: 1,
    };
    const hand = [tile('computer-six-hand-1', 'red', 1), tile('computer-six-hand-2', 'blue', 4), tile('computer-six-hand-3', 'green', 8), tile('computer-six-hand-4', 'yellow', 12)];
    const state = computerState({ hand, melds: [meld], discard: [tile('computer-six-discard', 'red', 9)], stock: [tile('computer-six-stock', 'blue', 10)] });

    const steps = runComputerTurnSteps(state);

    assert.equal(steps[0].discard.length, 0);
    assert.equal(steps[1].melds[0].tiles.length, 6);
  });

  it('rechaza agregar fichas que dejarían una ficha sin canasta y completa el turno', () => {
    const existing = [tile('meld-eight-red', 'red', 8), tile('meld-eight-blue', 'blue', 8), tile('meld-eight-green', 'green', 8)];
    const meld = { id: 'computer-leg-eight', kind: 'leg', tiles: existing, team: 1 };
    const hand = [tile('computer-eight-yellow', 'yellow', 8), tile('computer-eight-red-copy', 'red', 8)];
    const state = computerState({ hand, melds: [meld], deadTaken: true, phase: 'play' });

    const steps = runComputerTurnSteps(state);
    const next = runComputerTurn(state);

    assert.ok(steps.length > 0);
    assert.deepEqual(next, steps[steps.length - 1]);
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

    const steps = runComputerTurnSteps(state);
    const next = runComputerTurn(state);

    assert.equal(steps.length, 3);
    assert.equal(steps[0].melds[0].tiles.length, 4);
    assert.equal(steps[1].melds[0].tiles.length, 5);
    assert.equal(steps[2].currentPlayer, 0);
    assert.deepEqual(next, steps[2]);
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
    for (const item of unmatched) assert.ok(next.melds[0].tiles.every((meldTile) => meldTile.id !== item.id));
  });
});
