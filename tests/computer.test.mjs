import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGame as createGameWithRandomStarter, getMeldKind } from '../.test-build/game.js';
import { DEFAULT_AI_PREFERENCES } from '../.test-build/aiProfiles.js';
import { chooseDiscard, findBestMeld, runComputerTurn, runComputerTurnSteps } from '../.test-build/computer.js';

const tile = (id, color, value, kind = 'number') => ({ id, color, value, kind });
const createGame = (target = 2000, random = Math.random, scores = [0, 0], round = 1, starter = 0) =>
  createGameWithRandomStarter(target, random, scores, round, starter);
const computerState = ({ hand, melds = [], stock = [], discard = [], deadTaken = false, deadPiles = [[], []], phase = 'draw', restrictedDiscardTileId = null }) => {
  const initial = createGame(2000, () => 0.5);
  const players = [...initial.players];
  players[1] = { ...players[1], hand, deadTaken };
  return { ...initial, players, melds, stock, discard, phase, currentPlayer: 1, deadPiles, restrictedDiscardTileId };
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

  it('prefiere piernas cuando la personalidad así lo indica', () => {
    const hand = [
      tile('personality-run-five', 'red', 5),
      tile('personality-run-six', 'red', 6),
      tile('personality-run-seven', 'red', 7),
      tile('personality-leg-blue-five', 'blue', 5),
      tile('personality-leg-green-five', 'green', 5),
    ];
    const preferences = { ...DEFAULT_AI_PREFERENCES, preferredMeldKind: 'leg', meldKindPreferenceBonus: 4 };

    const best = findBestMeld(hand, () => true, preferences);

    assert.equal(getMeldKind(best), 'leg');
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

  it('conserva un #1 útil que puede seguir al #13 en una escalera', () => {
    const blueThirteen = tile('computer-discard-run-blue-thirteen', 'blue', 13);
    const blueOne = tile('computer-discard-run-blue-one', 'blue', 1);
    const greenThirteen = tile('computer-discard-run-green-thirteen', 'green', 13);
    const redFive = tile('computer-discard-run-red-five', 'red', 5);

    assert.equal(chooseDiscard([blueThirteen, blueOne, greenThirteen, redFive]).id, redFive.id);
  });

  it('prefiere descartar fichas naturales antes que comodines y descarta si solo tiene comodines', () => {
    const natural = tile('computer-discard-natural', 'red', 13);
    const specialJoker = tile('computer-discard-special-joker', null, 0, 'joker');
    const otherSpecialJoker = tile('computer-discard-other-special-joker', null, 0, 'joker');

    assert.equal(chooseDiscard([natural, specialJoker]).id, natural.id);
    assert.ok([specialJoker.id, otherSpecialJoker.id].includes(
      chooseDiscard([specialJoker, otherSpecialJoker]).id,
    ));
  });

  it('prefiere descartar un #2 antes que un comodín especial', () => {
    const two = tile('computer-discard-wild-two', 'red', 2);
    const specialJoker = tile('computer-discard-preferred-special-joker', null, 0, 'joker');

    assert.equal(chooseDiscard([two, specialJoker]).id, two.id);
  });

  it('evita descartar la ficha que completaría una canasta rival si tiene esa preferencia', () => {
    const eight = tile('opponent-canasta-eighth', 'red', 8);
    const five = tile('opponent-canasta-safe-five', 'green', 5);
    const meld = {
      id: 'opponent-six-eights',
      kind: 'leg',
      tiles: Array.from({ length: 6 }, (_, index) => tile(`opponent-six-eight-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
      team: 0,
    };
    const hand = [eight, five];

    assert.equal(chooseDiscard(hand).id, eight.id);
    assert.equal(chooseDiscard(hand, null, {
      opponentMelds: [meld],
      preferences: { ...DEFAULT_AI_PREFERENCES, avoidOpponentCanastaDiscards: true },
    }).id, five.id);
  });

  it('evita descartar la ficha que limpiaría una canasta de cualquiera de los rivales', () => {
    const naturalThree = tile('opponent-purify-three', 'red', 3);
    const joker = tile('opponent-purify-joker', null, 0, 'joker');
    const meld = {
      id: 'opponent-dirty-canasta',
      kind: 'run',
      tiles: [2, 4, 5, 6, 7, 8, 9].map((value) => tile(`opponent-dirty-${value}`, 'red', value)),
      team: 1,
    };

    assert.equal(chooseDiscard([naturalThree, joker]).id, naturalThree.id);
    assert.equal(chooseDiscard([naturalThree, joker], null, {
      opponentMelds: [meld],
      preferences: { ...DEFAULT_AI_PREFERENCES, avoidOpponentCanastaDiscards: true },
    }).id, joker.id);
  });

  it('considera el pozo completo al evitar que un rival complete una canasta', () => {
    const meld = {
      id: 'opponent-run-one-to-five',
      kind: 'run',
      tiles: [1, 2, 3, 4, 5].map((value) => tile(`opponent-run-${value}`, 'green', value)),
      team: 0,
    };
    const six = tile('opponent-pile-run-six', 'green', 6);
    const safeFive = tile('opponent-pile-safe-five-red', 'red', 5);
    const otherFive = tile('opponent-pile-safe-five-blue', 'blue', 5);
    const sevenInPile = tile('opponent-pile-run-seven', 'green', 7);
    const preferences = { ...DEFAULT_AI_PREFERENCES, avoidOpponentCanastaDiscards: true };

    assert.equal(chooseDiscard([six, safeFive, otherFive]).id, six.id);
    const discard = chooseDiscard([six, safeFive, otherFive], null, {
      opponentMelds: [meld],
      discardPile: [sevenInPile],
      preferences,
    });

    assert.ok([safeFive.id, otherFive.id].includes(discard.id));
  });

  it('considera varias fichas del pozo para limpiar una canasta rival', () => {
    const meld = {
      id: 'opponent-dirty-run-with-two-gaps',
      kind: 'run',
      tiles: [2, 4, 5, 7, 8, 9, 10].map((value) => tile(`opponent-dirty-run-${value}`, 'red', value)),
      team: 0,
    };
    const six = tile('opponent-pile-clean-run-six', 'red', 6);
    const safeTwelve = tile('opponent-pile-safe-twelve-blue', 'blue', 12);
    const otherSafeTwelve = tile('opponent-pile-safe-twelve-green', 'green', 12);
    const threeInPile = tile('opponent-pile-clean-run-three', 'red', 3);
    const preferences = { ...DEFAULT_AI_PREFERENCES, avoidOpponentCanastaDiscards: true };

    assert.equal(chooseDiscard([six, safeTwelve, otherSafeTwelve]).id, six.id);
    const discardAvoidingClean = chooseDiscard([six, safeTwelve, otherSafeTwelve], null, {
      opponentMelds: [meld],
      discardPile: [threeInPile],
      preferences,
    });

    assert.ok([safeTwelve.id, otherSafeTwelve.id].includes(discardAvoidingClean.id));
  });
});

describe('turnos de la computadora', () => {
  it('permite a la IA de la pareja agregar a un juego del equipo sin ver la mano de su compañero', () => {
    const initial = createGameWithRandomStarter(2000, () => 0.5, [0, 0], 1, 2, undefined, 'pairs');
    const added = tile('partner-ai-run-three', 'red', 3);
    const leftover = tile('partner-ai-leftover', 'blue', 12);
    const meld = {
      id: 'partner-ai-run',
      kind: 'run',
      tiles: [4, 5, 6].map((value) => tile(`partner-ai-run-${value}`, 'red', value)),
      team: 0,
    };
    const players = [...initial.players];
    players[0] = { ...players[0], hand: [tile('hidden-partner-card', 'yellow', 10)] };
    players[2] = { ...players[2], hand: [added, leftover, tile('partner-ai-spare', 'green', 1)] };
    const state = {
      ...initial,
      players,
      melds: [meld],
      deadPiles: [[], []],
      phase: 'play',
      currentPlayer: 2,
    };

    const steps = runComputerTurnSteps(state, DEFAULT_AI_PREFERENCES, () => 0.5, 2);

    assert.equal(steps[0].melds[0].tiles.length, 4);
    assert.equal(steps[0].players[0].hand[0].id, 'hidden-partner-card');
    assert.equal(steps.at(-1).currentPlayer, 3);
  });

  it('limita el análisis del pozo a la ventana configurada', () => {
    const hand = [
      tile('window-green-five', 'green', 5),
      tile('window-green-eight', 'green', 8),
      tile('window-blue-one', 'blue', 1),
      tile('window-red-eleven', 'red', 11),
      tile('window-yellow-four', 'yellow', 4),
    ];
    const discard = [tile('window-green-six', 'green', 6), tile('window-joker', null, 0, 'joker')];
    const state = computerState({ hand, discard, stock: [tile('window-stock', 'blue', 10)] });
    const preferences = { ...DEFAULT_AI_PREFERENCES, discardPileWindow: 1 };

    const steps = runComputerTurnSteps(state, preferences, () => 0.5);

    assert.equal(steps[0].discard.length, 2);
    assert.equal(steps[0].players[1].hand.length, 6);
  });

  it('puede retener combinaciones formadas según la probabilidad del perfil', () => {
    const hand = [
      tile('retain-run-three', 'red', 3),
      tile('retain-run-four', 'red', 4),
      tile('retain-run-five', 'red', 5),
      tile('retain-unmatched-blue-twelve', 'blue', 12),
      tile('retain-unmatched-yellow-ten', 'yellow', 10),
    ];
    const initial = computerState({ hand, phase: 'play' });
    const preferences = { ...DEFAULT_AI_PREFERENCES, layMeldProbability: 0 };
    const probabilisticPreferences = { ...DEFAULT_AI_PREFERENCES, layMeldProbability: 0.5 };

    const steps = runComputerTurnSteps(initial, preferences, () => 0.5);
    const laysWithProbability = runComputerTurnSteps(initial, probabilisticPreferences, () => 0.25);
    const retainsWithProbability = runComputerTurnSteps(initial, probabilisticPreferences, () => 0.75);

    assert.equal(steps.some((step) => step.melds.length > 0), false);
    assert.equal(steps.at(-1).currentPlayer, 0);
    assert.ok(laysWithProbability.some((step) => step.melds.length > 0));
    assert.equal(retainsWithProbability.some((step) => step.melds.length > 0), false);
  });

  it('puede ignorar probabilísticamente el valor de extender sus juegos al evaluar el pozo', () => {
    const meld = {
      id: 'own-six-eights',
      kind: 'leg',
      tiles: Array.from({ length: 6 }, (_, index) => tile(`own-six-eight-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
      team: 1,
    };
    const hand = [
      tile('pozo-evaluation-blue-one', 'blue', 1),
      tile('pozo-evaluation-green-four', 'green', 4),
      tile('pozo-evaluation-yellow-nine', 'yellow', 9),
      tile('pozo-evaluation-red-twelve', 'red', 12),
    ];
    const discard = [tile('pozo-evaluation-red-eight', 'red', 8)];
    const state = computerState({ hand, melds: [meld], discard, stock: [tile('pozo-evaluation-stock', 'blue', 6)] });

    const evaluatesMelds = (probability, random) => runComputerTurnSteps(state, {
      ...DEFAULT_AI_PREFERENCES,
      ownMeldDiscardPileEvaluationProbability: probability,
    }, random);
    const skipsMelds = evaluatesMelds(0, () => 0.5);
    const considersMelds = evaluatesMelds(1, () => 0.5);
    const considersByChance = evaluatesMelds(0.5, () => 0.25);
    const skipsByChance = evaluatesMelds(0.5, () => 0.75);

    assert.equal(skipsMelds[0].discard.length, 1);
    assert.equal(considersMelds[0].discard.length, 0);
    assert.equal(considersByChance[0].discard.length, 0);
    assert.equal(skipsByChance[0].discard.length, 1);
  });

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

  it('considera hasta veinte fichas superiores y puede formar un juego con dos del pozo y dos del atril', () => {
    const hand = [
      tile('computer-run-five', 'green', 5),
      tile('computer-run-eight', 'green', 8),
      tile('computer-unrelated-one', 'blue', 1),
      tile('computer-unrelated-eleven', 'red', 11),
      tile('computer-unrelated-four', 'yellow', 4),
    ];
    const discard = [
      ...Array.from({ length: 17 }, (_, index) => tile(`computer-top-twenty-old-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], (index % 13) + 1)),
      tile('computer-run-six-discard', 'green', 6),
      tile('computer-run-eight-discard-one', 'red', 8),
      tile('computer-run-eight-discard-two', 'blue', 8),
    ];
    const state = computerState({ hand, discard, stock: [tile('computer-ten-stock', 'red', 10)] });

    const steps = runComputerTurnSteps(state);

    assert.equal(steps[0].discard.length, 0);
    assert.ok(steps.some((step) => step.melds.some((meld) => meld.tiles.length === 4)));
  });

  it('levanta el pozo por una combinación compatible y conserva el comodín', () => {
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
    assert.equal(meld, undefined);
    assert.ok(steps.at(-1).players[1].hand.some((item) => item.id === joker.id));
    assert.ok(steps.at(-1).players[1].hand.some((item) => item.id === five.id));
    assert.ok(steps.at(-1).players[1].hand.some((item) => item.id === six.id));
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

  it('no evalúa pozos de más de veinte fichas', () => {
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
      ...Array.from({ length: 10 }, (_, index) => tile(`computer-outside-extra-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], (index % 13) + 1)),
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

  it('extiende una pierna con el mismo número y reserva el comodín', () => {
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

    assert.equal(steps.length, 2);
    assert.equal(steps[0].melds[0].tiles.length, 4);
    assert.equal(steps[1].currentPlayer, 0);
    assert.deepEqual(next, steps[1]);
    assert.ok(next.melds[0].tiles.some((item) => item.id === matching.id));
    assert.ok(next.melds[0].tiles.every((item) => item.id !== wild.id));
    assert.equal(next.melds[0].tiles.length, 4);
    assert.ok(next.players[1].hand.some((item) => item.id === wild.id));
  });

  it('extiende una escalera con el mismo color y reserva el comodín', () => {
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
    assert.ok(next.melds[0].tiles.every((item) => item.id !== wild.id));
    assert.equal(next.melds[0].tiles.length, 4);
    assert.ok(next.players[1].hand.some((item) => item.id === wild.id));
    for (const item of unmatched) assert.ok(next.melds[0].tiles.every((meldTile) => meldTile.id !== item.id));
  });

  it('no baja una escalera con comodín ni una pierna de #2 si no dan un beneficio inmediato', () => {
    const joker = tile('computer-retained-run-joker', null, 0, 'joker');
    const jokerRun = computerState({
      hand: [
        tile('computer-retained-run-five', 'red', 5),
        tile('computer-retained-run-six', 'red', 6),
        joker,
        tile('computer-retained-run-unrelated', 'blue', 11),
      ],
      phase: 'play',
    });
    const twos = [
      tile('computer-retained-leg-two-red', 'red', 2),
      tile('computer-retained-leg-two-blue', 'blue', 2),
      tile('computer-retained-leg-two-green', 'green', 2),
    ];
    const twoLeg = computerState({
      hand: [...twos, tile('computer-retained-leg-unrelated', 'yellow', 13)],
      phase: 'play',
    });

    const jokerSteps = runComputerTurnSteps(jokerRun);
    const twoSteps = runComputerTurnSteps(twoLeg);

    assert.equal(jokerSteps.some((step) => step.melds.length > 0), false);
    assert.ok(jokerSteps.at(-1).players[1].hand.some((item) => item.id === joker.id));
    assert.equal(twoSteps.some((step) => step.melds.length > 0), false);
    assert.ok(twos.every((two) => twoSteps.at(-1).players[1].hand.some((item) => item.id === two.id)));
  });

  it('baja un juego con comodín para tomar directamente el muerto', () => {
    const joker = tile('computer-dead-joker', null, 0, 'joker');
    const dead = Array.from({ length: 11 }, (_, index) => tile(`computer-dead-tile-${index}`, 'yellow', index + 3));
    const state = computerState({
      hand: [tile('computer-dead-run-five', 'red', 5), tile('computer-dead-run-six', 'red', 6), joker],
      deadPiles: [[], dead],
      phase: 'play',
    });

    const steps = runComputerTurnSteps(state);

    assert.equal(steps[0].players[1].deadTaken, true);
    assert.ok(steps[0].melds[0].tiles.some((item) => item.id === joker.id));
    assert.equal(steps[0].players[1].hand.length, dead.length);
  });

  it('permite extender con un comodín si eso toma directamente el muerto', () => {
    const joker = tile('computer-extension-dead-joker', null, 0, 'joker');
    const dead = Array.from({ length: 11 }, (_, index) => tile(`computer-extension-dead-tile-${index}`, 'yellow', index + 3));
    const meld = {
      id: 'computer-extension-dead-run',
      kind: 'run',
      tiles: [4, 5, 6].map((value) => tile(`computer-extension-dead-run-${value}`, 'red', value)),
      team: 1,
    };
    const state = computerState({ hand: [joker], melds: [meld], deadPiles: [[], dead], phase: 'play' });

    const steps = runComputerTurnSteps(state);

    assert.equal(steps[0].players[1].deadTaken, true);
    assert.ok(steps[0].melds[0].tiles.some((item) => item.id === joker.id));
    assert.equal(steps[0].players[1].hand.length, dead.length);
  });

  it('permite bajar un juego con comodín cuando la jugada cierra', () => {
    const joker = tile('computer-meld-cut-joker', null, 0, 'joker');
    const canasta = {
      id: 'computer-existing-canasta',
      kind: 'leg',
      tiles: Array.from({ length: 7 }, (_, index) => tile(`computer-existing-canasta-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
      team: 1,
    };
    const state = computerState({
      hand: [
        tile('computer-meld-cut-five', 'red', 5),
        tile('computer-meld-cut-six', 'red', 6),
        joker,
        tile('computer-meld-cut-discard', 'blue', 12),
      ],
      melds: [canasta],
      deadTaken: true,
      phase: 'play',
    });

    const next = runComputerTurn(state);

    assert.equal(next.phase, 'round-over');
    assert.ok(next.melds.some((meld) => meld.tiles.some((item) => item.id === joker.id)));
  });

  it('permite sumar un comodín cuando la jugada completa canasta y cierra', () => {
    const joker = tile('computer-cut-joker', null, 0, 'joker');
    const meld = {
      id: 'computer-cut-run',
      kind: 'run',
      tiles: [1, 2, 3, 4, 5, 6].map((value) => tile(`computer-cut-run-${value}`, 'red', value)),
      team: 1,
    };
    const state = computerState({ hand: [joker], melds: [meld], deadTaken: true, phase: 'play' });

    const next = runComputerTurn(state);

    assert.equal(next.phase, 'round-over');
    assert.equal(next.melds[0].tiles.length, 7);
    assert.ok(next.melds[0].tiles.some((item) => item.id === joker.id));
  });
});
