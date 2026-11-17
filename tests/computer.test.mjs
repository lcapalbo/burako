import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGame as createGameWithRandomStarter, getMeldKind, isCleanMeld } from '../.test-build/game.js';
import { AI_PROFILES, DEFAULT_AI_PREFERENCES } from '../.test-build/aiProfiles.js';
import { chooseDiscard, findBestMeld, runComputerTurn, runComputerTurnSteps } from '../.test-build/computer.js';

const tile = (id, color, value, kind = 'number') => ({ id, color, value, kind });
const createGame = (target = 2000, random = Math.random, scores = [0, 0], round = 1, starter = 0, mode = 'individual') =>
  createGameWithRandomStarter(target, random, scores, round, starter, undefined, mode);
const computerState = ({ hand, melds = [], stock = [], discard = [], deadTaken = false, deadPiles = [[], []], opponentHand, opponentDeadTaken = false, phase = 'draw', restrictedDiscardTileId = null, mode = 'individual' }) => {
  const initial = createGame(2000, () => 0.5, [0, 0], 1, 0, mode);
  const players = [...initial.players];
  players[1] = { ...players[1], hand, deadTaken };
  players[0] = { ...players[0], hand: opponentHand ?? players[0].hand, deadTaken: opponentDeadTaken };
  return { ...initial, players, melds, stock, discard, phase, currentPlayer: 1, deadPiles, restrictedDiscardTileId };
};
const exhaustiveBestMeld = (hand) => {
  let best = null;
  let bestValue = 0;
  const selected = [];
  const search = (start) => {
    if (selected.length >= 3) {
      const kind = getMeldKind(selected);
      const value = kind ? selected.length * 10 + (selected.length >= 7 ? 100 : 0) + 2 : 0;
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

  it('conserva combinaciones válidas al podar grupos incompatibles', () => {
    const hands = [
      [tile('prune-red-four', 'red', 4), tile('prune-blue-four', 'blue', 4), tile('prune-blue-five', 'blue', 5), tile('prune-green-five', 'green', 5)],
      [tile('prune-green-two', 'green', 2), tile('prune-green-three', 'green', 3), tile('prune-green-four', 'green', 4), tile('prune-red-two', 'red', 2)],
      [tile('prune-red-thirteen', 'red', 13), tile('prune-red-one-a', 'red', 1), tile('prune-red-one-b', 'red', 1), tile('prune-red-two-a', 'red', 2)],
      [tile('prune-leg-two-red', 'red', 2), tile('prune-leg-two-blue', 'blue', 2), tile('prune-leg-two-green', 'green', 2)],
      [tile('prune-red-eight', 'red', 8), tile('prune-blue-eight', 'blue', 8), tile('prune-joker', null, 0, 'joker')],
      [tile('prune-run-two', 'red', 2), tile('prune-run-three', 'red', 3), tile('prune-run-four', 'red', 4), tile('prune-run-joker', null, 0, 'joker')],
      [tile('prune-leg-eight-red', 'red', 8), tile('prune-leg-eight-blue', 'blue', 8), tile('prune-leg-eight-green', 'green', 8), tile('prune-leg-eight-wild-two', 'yellow', 2)],
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

    assert.equal(chooseDiscard(hand), thirteen);
    assert.equal(chooseDiscard(hand, one.id), thirteen);
    assert.throws(() => chooseDiscard([one], one.id), /No hay una ficha legal para descartar/);
  });

  it('ajusta el puntaje de las fichas según el riesgo de corte del oponente', () => {
    const one = tile('computer-risk-one', 'red', 1);
    const thirteen = tile('computer-risk-thirteen', 'blue', 13);
    const hand = [one, thirteen];
    const opponentCanasta = {
      id: 'computer-risk-opponent-canasta',
      kind: 'leg',
      tiles: Array.from({ length: 7 }, (_, index) => tile(`computer-risk-opponent-eight-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
      team: 0,
    };

    assert.equal(chooseDiscard(hand).id, thirteen.id);
    assert.equal(chooseDiscard(hand, null, {
      opponentPlayers: [{ deadTaken: true, hand: Array.from({ length: 10 }, (_, index) => tile(`computer-risk-not-close-${index}`, 'green', index + 3)) }],
    }).id, one.id);
    assert.equal(chooseDiscard(hand, null, {
      opponentMelds: [opponentCanasta],
      opponentPlayers: [{ deadTaken: true, hand: [tile('computer-risk-near-cut-card', 'yellow', 10)] }],
    }).id, one.id);
    assert.equal(chooseDiscard(hand, null, {
      opponentMelds: [opponentCanasta],
      opponentPlayers: [
        { deadTaken: true, hand: Array.from({ length: 10 }, (_, index) => tile(`computer-risk-partner-hand-${index}`, 'green', index + 3)) },
        { deadTaken: false, hand: [tile('computer-risk-partner-near-cut', 'yellow', 10), tile('computer-risk-partner-last', 'yellow', 11)] },
      ],
    }).id, one.id);
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
    const opponentPlayers = [{ deadTaken: true, hand: Array.from({ length: 10 }, (_, index) => tile(`opponent-not-near-cut-${index}`, 'green', index + 3)) }];

    assert.equal(chooseDiscard(hand, null, { opponentPlayers }).id, eight.id);
    assert.equal(chooseDiscard(hand, null, {
      opponentMelds: [meld],
      opponentPlayers,
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

  it('evita ayudar a juegos rivales a llegar a cinco o seis fichas', () => {
    const extension = tile('opponent-growth-eight', 'yellow', 8);
    const safeFive = tile('opponent-growth-safe-five-red', 'red', 5);
    const otherFive = tile('opponent-growth-safe-five-blue', 'blue', 5);
    const preferences = { ...DEFAULT_AI_PREFERENCES, avoidOpponentMeldExtensions: true };

    for (const existingLength of [4, 5]) {
      const meld = {
        id: `opponent-growth-${existingLength}-eights`,
        kind: 'leg',
        tiles: Array.from({ length: existingLength }, (_, index) =>
          tile(`opponent-growth-${existingLength}-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
        team: 0,
      };
      const hand = [extension, safeFive, otherFive];

      assert.equal(chooseDiscard(hand).id, extension.id);
      assert.notEqual(chooseDiscard(hand, null, { opponentMelds: [meld], preferences }).id, extension.id);
    }
  });

  it('evalúa extensiones que combinan el pozo con el descarte y las ignora si el rival ya tiene canasta', () => {
    const meld = {
      id: 'opponent-growth-three-eights',
      kind: 'leg',
      tiles: [0, 1, 2].map((index) => tile(`opponent-growth-three-${index}`, ['red', 'blue', 'green'][index], 8)),
      team: 0,
    };
    const extension = tile('opponent-growth-pile-eight', 'yellow', 8);
    const safeFive = tile('opponent-growth-pile-safe-five-red', 'red', 5);
    const otherFive = tile('opponent-growth-pile-safe-five-blue', 'blue', 5);
    const eightInPile = tile('opponent-growth-eight-in-pile', 'red', 8);
    const preferences = { ...DEFAULT_AI_PREFERENCES, avoidOpponentMeldExtensions: true };
    const hand = [extension, safeFive, otherFive];

    assert.equal(chooseDiscard(hand).id, extension.id);
    assert.notEqual(chooseDiscard(hand, null, {
      opponentMelds: [meld],
      discardPile: [eightInPile],
      preferences,
    }).id, extension.id);

    const canasta = {
      id: 'opponent-growth-already-has-canasta',
      kind: 'leg',
      tiles: Array.from({ length: 7 }, (_, index) => tile(`opponent-growth-canasta-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 10)),
      team: 0,
    };

    assert.equal(chooseDiscard(hand, null, {
      opponentMelds: [meld, canasta],
      discardPile: [eightInPile],
      preferences,
    }).id, extension.id);
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

  it('evita levantar el pozo ante un rival cerca de cortar si no completa canasta', () => {
    const opponentCanasta = {
      id: 'near-cut-opponent-canasta',
      kind: 'leg',
      tiles: Array.from({ length: 7 }, (_, index) => tile(`near-cut-opponent-eight-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
      team: 0,
    };
    const hand = [
      tile('near-cut-ai-run-four', 'red', 4),
      tile('near-cut-ai-run-six', 'red', 6),
      tile('near-cut-ai-unmatched-one', 'blue', 1),
      tile('near-cut-ai-unmatched-ten', 'yellow', 10),
    ];
    const discard = [tile('near-cut-ai-run-five-in-pile', 'red', 5)];
    const stock = [tile('near-cut-ai-stock', 'green', 12)];
    const state = computerState({
      hand,
      melds: [opponentCanasta],
      discard,
      stock,
      opponentHand: [tile('near-cut-opponent-one', 'green', 4), tile('near-cut-opponent-two', 'yellow', 9)],
      opponentDeadTaken: true,
    });

    const avoidsPile = runComputerTurnSteps(state);

    assert.equal(avoidsPile[0].discard.length, 1);
    assert.equal(avoidsPile[0].players[1].hand.length, hand.length + 1);
    assert.equal(avoidsPile[0].stock.length, 0);
  });

  it('evita levantar el pozo ante un rival cerca de cortar si no tiene canasta', () => {
    const opponentCanasta = {
      id: 'near-cut-opponent-canasta',
      kind: 'leg',
      tiles: Array.from({ length: 7 }, (_, index) => tile(`near-cut-opponent-eight-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
      team: 0,
    };
    const ownCanasta = {
      id: 'near-cut-ai-existing-canasta',
      kind: 'leg',
      tiles: Array.from({ length: 7 }, (_, index) => tile(`near-cut-ai-eight-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
      team: 1,
    };
    const hand = [
      tile('near-cut-ai-run-four', 'red', 4),
      tile('near-cut-ai-run-six', 'red', 6),
      tile('near-cut-ai-unmatched-one', 'blue', 1),
      tile('near-cut-ai-unmatched-ten', 'yellow', 10),
    ];
    const discard = [tile('near-cut-ai-run-five-in-pile', 'red', 5)];
    const stock = [tile('near-cut-ai-stock', 'green', 12)];
    const state = computerState({
      hand,
      melds: [opponentCanasta, ownCanasta],
      discard,
      stock,
      opponentHand: [tile('near-cut-opponent-one', 'green', 4), tile('near-cut-opponent-two', 'yellow', 9)],
      opponentDeadTaken: true,
    });
    const allowsPile = runComputerTurnSteps(state);

    assert.equal(allowsPile[0].discard.length, 0);
    assert.equal(allowsPile[0].players[1].hand.length, hand.length + discard.length);
  });

  it('permite levantar el pozo si permite formar una canasta pese al rival cerca de cortar', () => {
    const opponentCanasta = {
      id: 'near-cut-canasta-forming-opponent-canasta',
      kind: 'leg',
      tiles: Array.from({ length: 7 }, (_, index) => tile(`near-cut-canasta-forming-opponent-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
      team: 0,
    };
    const hand = ['red', 'blue', 'green', 'yellow'].map((color, index) =>
      tile(`near-cut-canasta-forming-hand-${index}`, color, 9));
    const discard = ['red', 'blue', 'green'].map((color, index) =>
      tile(`near-cut-canasta-forming-pile-${index}`, color, 9));
    const state = computerState({
      hand,
      melds: [opponentCanasta],
      discard,
      stock: [tile('near-cut-canasta-forming-stock', 'yellow', 12)],
      opponentHand: [tile('near-cut-canasta-forming-opponent-one', 'green', 4)],
      opponentDeadTaken: true,
    });

    const steps = runComputerTurnSteps(state);

    assert.equal(steps[0].discard.length, 0);
    assert.equal(steps[0].players[1].hand.length, hand.length + discard.length);
  });

  it('permite levantar el pozo si completa una canasta extendiendo un juego propio con fichas de la mano', () => {
    const opponentCanasta = {
      id: 'near-cut-extending-opponent-canasta',
      kind: 'leg',
      tiles: Array.from({ length: 7 }, (_, index) => tile(`near-cut-extending-opponent-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
      team: 0,
    };
    const ownRun = {
      id: 'near-cut-extending-own-run',
      kind: 'run',
      tiles: [3, 4, 5, 6, 7].map((value) => tile(`near-cut-extending-own-${value}`, 'red', value)),
      team: 1,
    };
    const hand = [
      tile('near-cut-extending-hand-eight', 'red', 8),
      tile('near-cut-extending-hand-blue-four', 'blue', 4),
      tile('near-cut-extending-hand-blue-five', 'blue', 5),
      tile('near-cut-extending-hand-green-one', 'green', 1),
    ];
    const discard = [
      tile('near-cut-extending-pile-nine', 'red', 9),
      tile('near-cut-extending-pile-blue-six', 'blue', 6),
    ];
    const state = computerState({
      hand,
      melds: [opponentCanasta, ownRun],
      discard,
      stock: [tile('near-cut-extending-stock', 'yellow', 12)],
      opponentHand: [tile('near-cut-extending-opponent-one', 'green', 4)],
      opponentDeadTaken: true,
    });

    const steps = runComputerTurnSteps(state);

    assert.equal(steps[0].discard.length, 0);
    assert.equal(steps[0].players[1].hand.length, hand.length + discard.length);
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

  it('usa la probabilidad de bajar juegos específica para parejas', () => {
    const hand = [
      tile('pair-lay-run-three', 'red', 3),
      tile('pair-lay-run-four', 'red', 4),
      tile('pair-lay-run-five', 'red', 5),
      tile('pair-lay-unmatched-blue-twelve', 'blue', 12),
      tile('pair-lay-unmatched-yellow-ten', 'yellow', 10),
    ];
    const preferences = {
      ...DEFAULT_AI_PREFERENCES,
      layMeldProbability: 0,
      layMeldProbabilityForPairs: 1,
    };
    const individualSteps = runComputerTurnSteps(computerState({ hand, phase: 'play' }), preferences, () => 0.5);
    const pairSteps = runComputerTurnSteps(computerState({ hand, phase: 'play', mode: 'pairs' }), preferences, () => 0.5);

    assert.equal(individualSteps.some((step) => step.melds.length > 0), false);
    assert.ok(pairSteps.some((step) => step.melds.length > 0));
  });

  it('retiene una escalera larga al bajar otro juego si el perfil manipula en partidas individuales', () => {
    const longRun = Array.from({ length: 6 }, (_, index) => tile(`manipulate-green-${index + 5}`, 'green', index + 5));
    const otherRun = [5, 6, 7].map((value) => tile(`manipulate-red-${value}`, 'red', value));
    const hand = [...longRun, ...otherRun];
    const preferences = {
      ...DEFAULT_AI_PREFERENCES,
      layMeldProbability: 1,
      manipulateOpponentOnSinglePlay: true,
    };

    const steps = runComputerTurnSteps(computerState({ hand, phase: 'play' }), preferences);
    const laidMelds = steps.flatMap((step) => step.melds);

    assert.ok(laidMelds.some((meld) => meld.tiles.some((item) => item.id === otherRun[0].id)));
    assert.equal(laidMelds.some((meld) => meld.tiles.some((item) => item.id === longRun[0].id)), false);
  });

  it('también puede retener una escalera larga y bajar una pierna alternativa', () => {
    const longRun = [4, 5, 6, 7, 8].map((value) => tile(`manipulate-yellow-${value}`, 'yellow', value));
    const otherLeg = ['red', 'blue', 'green'].map((color) => tile(`manipulate-${color}-nine`, color, 9));
    const hand = [...longRun, ...otherLeg];
    const preferences = {
      ...DEFAULT_AI_PREFERENCES,
      layMeldProbability: 1,
      manipulateOpponentOnSinglePlay: true,
    };

    const steps = runComputerTurnSteps(computerState({ hand, phase: 'play' }), preferences);
    const laidMelds = steps.flatMap((step) => step.melds);

    assert.ok(laidMelds.some((meld) => meld.kind === 'leg' && meld.tiles.some((item) => item.id === otherLeg[0].id)));
    assert.equal(laidMelds.some((meld) => meld.tiles.some((item) => item.id === longRun[0].id)), false);
  });

  it('retiene una pierna larga al bajar otra pierna y una escalera', () => {
    const longLeg = [
      ...['red', 'blue', 'green', 'yellow'].map((color) => tile(`manipulate-long-leg-${color}`, color, 13)),
      tile('manipulate-long-leg-joker', null, 0, 'joker'),
    ];
    const otherLeg = ['red', 'blue', 'yellow'].map((color) => tile(`manipulate-short-leg-${color}`, color, 4));
    const otherRun = [5, 6, 7].map((value) => tile(`manipulate-short-run-${value}`, 'green', value));
    const preferences = {
      ...DEFAULT_AI_PREFERENCES,
      layMeldProbability: 1,
      manipulateOpponentOnSinglePlay: true,
    };

    const steps = runComputerTurnSteps(
      computerState({ hand: [...longLeg, ...otherLeg, ...otherRun], phase: 'play' }),
      preferences,
    );
    const laidMelds = steps.at(-1).melds;

    assert.equal(laidMelds.length, 2);
    assert.ok(laidMelds.some((meld) => meld.kind === 'leg' && meld.tiles.some((item) => item.id === otherLeg[0].id)));
    assert.ok(laidMelds.some((meld) => meld.kind === 'run' && meld.tiles.some((item) => item.id === otherRun[0].id)));
    assert.equal(laidMelds.some((meld) => meld.tiles.some((item) => item.id === longLeg[0].id)), false);
  });

  it('no retiene juegos largos si el perfil no lo permite o juega en parejas', () => {
    const longRun = Array.from({ length: 6 }, (_, index) => tile(`no-manipulate-green-${index + 5}`, 'green', index + 5));
    const otherRun = [5, 6, 7].map((value) => tile(`no-manipulate-red-${value}`, 'red', value));
    const hand = [...longRun, ...otherRun];
    const preferences = { ...DEFAULT_AI_PREFERENCES, layMeldProbability: 1 };
    const withoutPreference = runComputerTurnSteps(computerState({ hand, phase: 'play' }), preferences);
    const inPairs = runComputerTurnSteps(
      computerState({ hand, phase: 'play', mode: 'pairs' }),
      { ...preferences, manipulateOpponentOnSinglePlay: true },
    );

    for (const steps of [withoutPreference, inPairs]) {
      const firstMeld = steps.find((step) => step.melds.length > 0)?.melds[0];
      assert.ok(firstMeld?.tiles.some((item) => item.id === longRun[0].id));
    }
  });

  it('puede ignorar probabilísticamente el valor de extender sus juegos al evaluar el pozo', () => {
    const meld = {
      id: 'own-five-eights',
      kind: 'leg',
      tiles: Array.from({ length: 5 }, (_, index) => tile(`own-five-eight-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 8)),
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

  it('roba del montón si un pozo largo agrega más fichas de las que justifica el juego', () => {
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

    const steps = runComputerTurnSteps(state, DEFAULT_AI_PREFERENCES, () => 0);

    assert.equal(steps[0].discard.length, discard.length);
    assert.equal(steps[0].players[1].hand.length, hand.length + 1);
    assert.equal(steps[0].stock.length, 0);
  });

  it('roba del montón si el pozo gasta un #2 que mejora juegos disponibles en la mano', () => {
    const hand = [
      tile('npc-blue-two', 'blue', 2),
      tile('npc-blue-five', 'blue', 5),
      tile('npc-yellow-thirteen', 'yellow', 13),
      tile('npc-blue-three-a', 'blue', 3),
      tile('npc-blue-one', 'blue', 1),
      tile('npc-green-one', 'green', 1),
      tile('npc-blue-three-b', 'blue', 3),
      tile('npc-blue-six', 'blue', 6),
      tile('npc-green-eight', 'green', 8),
      tile('npc-blue-eight', 'blue', 8),
      tile('npc-green-five', 'green', 5),
    ];
    const yellowTwelve = tile('npc-discard-yellow-twelve', 'yellow', 12);
    const state = computerState({
      hand,
      discard: [tile('npc-discard-red-thirteen', 'red', 13), yellowTwelve],
      stock: [tile('npc-stock', 'green', 3)],
    });
    const npcProfile = AI_PROFILES.find(({ id }) => id === 'npc');
    state.players[1] = { ...state.players[1], aiProfileId: 'npc' };

    const steps = runComputerTurnSteps(state, npcProfile.preferences, () => 0.25);

    assert.equal(getMeldKind([yellowTwelve, hand[2], hand[0]]), 'run');
    assert.equal(getMeldKind([hand[3], hand[0], hand[1], hand[7]]), 'run');
    assert.equal(steps[0].discard.length, 2);
    assert.equal(steps[0].players[1].hand.length, hand.length + 1);
    assert.equal(steps[0].stock.length, 0);
  });

  it('levanta y juega el pozo cuando amplía claramente una pierna natural', () => {
    const hand = [
      tile('computer-lift-eight-red', 'red', 8),
      tile('computer-lift-eight-blue', 'blue', 8),
      tile('computer-lift-eight-green', 'green', 8),
      tile('computer-lift-one-blue', 'blue', 1),
      tile('computer-lift-four-yellow', 'yellow', 4),
    ];
    const fourthEight = tile('computer-lift-eight-yellow', 'yellow', 8);
    const state = computerState({
      hand,
      discard: [fourthEight],
      stock: [tile('computer-lift-stock', 'green', 10)],
    });
    const npcProfile = AI_PROFILES.find(({ id }) => id === 'npc');
    state.players[1] = { ...state.players[1], aiProfileId: 'npc' };

    const steps = runComputerTurnSteps(
      state,
      { ...npcProfile.preferences, layMeldProbability: 0 },
      () => 0.99,
    );
    const playedMeld = steps.flatMap((step) => step.melds).find((meld) =>
      meld.tiles.some((item) => item.id === fourthEight.id));

    assert.equal(steps[0].discard.length, 0);
    assert.deepEqual(playedMeld?.tiles.map((item) => item.id).sort(), [
      'computer-lift-eight-blue',
      'computer-lift-eight-green',
      'computer-lift-eight-red',
      'computer-lift-eight-yellow',
    ]);
  });

  it('valora y conserva el comodín especial que gana al levantar el pozo', () => {
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
    assert.equal(steps[0].stock.length, 1);
    assert.equal(meld, undefined);
    assert.equal(steps[0].players[1].hand.length, 5);
    assert.ok(steps.at(-1).players[1].hand.some((item) => item.id === joker.id));
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

  it('roba del montón si un juego pequeño no compensa levantar diez fichas', () => {
    const hand = [tile('computer-top-ten-hand-1', 'blue', 4), tile('computer-top-ten-hand-2', 'red', 9)];
    const discard = [
      tile('computer-top-ten-old-1', 'red', 1),
      tile('computer-top-ten-old-2', 'blue', 7),
      tile('computer-top-ten-old-3', 'green', 11),
      tile('computer-top-ten-old-4', 'yellow', 3),
      tile('computer-top-ten-old-5', 'red', 6),
      tile('computer-top-ten-old-6', 'blue', 10),
      tile('computer-top-ten-old-7', 'green', 12),
      tile('computer-top-ten-match-1', 'yellow', 8),
      tile('computer-top-ten-match-2', 'red', 8),
      tile('computer-top-ten-match-3', 'blue', 8),
    ];
    const state = computerState({ hand, discard, stock: [tile('computer-top-ten-stock', 'green', 5)] });

    const steps = runComputerTurnSteps(state);

    assert.equal(steps[0].discard.length, discard.length);
    assert.equal(steps[0].players[1].hand.length, hand.length + 1);
    assert.equal(steps[0].stock.length, 0);
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

    const next = runComputerTurn(state, { ...DEFAULT_AI_PREFERENCES, layMeldProbability: 1 });

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

  it('prefiere formar otro juego o extender un juego chico antes que agrandar una canasta', () => {
    const canasta = {
      id: 'computer-prefer-new-run',
      kind: 'run',
      tiles: [1, 2, 3, 4, 5, 6, 7].map((value) => tile(`computer-prefer-new-${value}`, 'red', value)),
      team: 1,
    };
    const newRunTiles = [8, 9, 10].map((value) => tile(`computer-prefer-new-hand-${value}`, 'red', value));
    const newRunState = computerState({
      hand: [...newRunTiles, tile('computer-prefer-new-unmatched', 'blue', 12)],
      melds: [canasta],
      phase: 'play',
    });

    const newRunResult = runComputerTurn(newRunState, { ...DEFAULT_AI_PREFERENCES, layMeldProbability: 1 });
    assert.equal(newRunResult.melds[0].tiles.length, 7);
    assert.ok(newRunResult.melds.some((meld) =>
      newRunTiles.every((runTile) => meld.tiles.some((item) => item.id === runTile.id))));

    const smallRun = {
      id: 'computer-prefer-small-run',
      kind: 'run',
      tiles: [9, 10, 11, 12, 13].map((value) => tile(`computer-prefer-small-${value}`, 'red', value)),
      team: 1,
    };
    const eight = tile('computer-prefer-small-eight', 'red', 8);
    const smallRunResult = runComputerTurn(computerState({
      hand: [eight, tile('computer-prefer-small-unmatched-blue', 'blue', 4), tile('computer-prefer-small-unmatched-green', 'green', 12)],
      melds: [canasta, smallRun],
      phase: 'play',
    }));

    assert.equal(smallRunResult.melds.find((meld) => meld.id === canasta.id).tiles.length, 7);
    assert.equal(smallRunResult.melds.find((meld) => meld.id === smallRun.id).tiles.length, 6);
    assert.ok(smallRunResult.melds.find((meld) => meld.id === smallRun.id).tiles.some((item) => item.id === eight.id));
  });

  it('permite agrandar una canasta para purificarla', () => {
    const dirtyRun = {
      id: 'computer-purify-canasta',
      kind: 'run',
      tiles: [tile('computer-purify-two', 'red', 2), ...[4, 5, 6, 7, 8, 9].map((value) =>
        tile(`computer-purify-existing-${value}`, 'red', value))],
      team: 1,
    };
    const three = tile('computer-purify-three', 'red', 3);
    const purified = runComputerTurn(computerState({
      hand: [three, tile('computer-purify-unmatched-blue', 'blue', 11), tile('computer-purify-unmatched-green', 'green', 12)],
      melds: [dirtyRun],
      phase: 'play',
    }));

    assert.equal(purified.melds[0].tiles.length, 8);
    assert.ok(purified.melds[0].tiles.some((item) => item.id === three.id));
    assert.equal(isCleanMeld(purified.melds[0]), true);
  });

  it('permite agrandar una canasta de escalera si no hay otra opción de juego', () => {
    const wildcardRun = {
      id: 'computer-help-purify-canasta',
      kind: 'run',
      tiles: [tile('computer-help-purify-two', 'red', 2), ...[7, 8, 9, 10, 11, 12].map((value) =>
        tile(`computer-help-purify-existing-${value}`, 'red', value))],
      team: 1,
    };
    const thirteen = tile('computer-help-purify-thirteen', 'red', 13);
    const helped = runComputerTurn(computerState({
      hand: [thirteen, tile('computer-help-purify-unmatched-blue', 'blue', 4), tile('computer-help-purify-unmatched-green', 'green', 5)],
      melds: [wildcardRun],
      phase: 'play',
    }));
    assert.ok(helped.melds[0].tiles.some((item) => item.id === thirteen.id));
  });

  it('permite agrandar una canasta de escalera para ayudar a purificarla', () => {
    const usefulRun = {
      id: 'computer-useful-purify-canasta',
      kind: 'run',
      tiles: [tile('computer-useful-purify-two', 'red', 2), ...[7, 8, 9, 10, 11, 12, 13].map((value) =>
        tile(`computer-useful-purify-existing-${value}`, 'red', value))],
      team: 1,
    };
    const six = tile('computer-useful-purify-six-red', 'red', 6);
    const sixLeg = {
      id: 'computer-useful-purify-six-leg',
      kind: 'leg',
      tiles: ['blue', 'green', 'yellow'].map((color) => tile(`computer-useful-purify-leg-${color}`, color, 6)),
      team: 1,
    };
    const preferRun = runComputerTurn(computerState({
      hand: [six, tile('computer-useful-purify-unmatched-blue', 'blue', 4), tile('computer-useful-purify-unmatched-green', 'green', 5)],
      melds: [usefulRun, sixLeg],
      phase: 'play',
    }));
    assert.ok(preferRun.melds.find((meld) => meld.id === usefulRun.id).tiles.some((item) => item.id === six.id));
    assert.ok(preferRun.melds.find((meld) => meld.id === sixLeg.id).tiles.every((item) => item.id !== six.id));
  });

  it('prefiere extender otro juego si una canasta de escalera no tiene forma de purificarse', () => {
    const impossibleToCleanRun = {
      id: 'computer-impossible-purify-canasta',
      kind: 'run',
      tiles: [tile('computer-impossible-purify-two-blue', 'blue', 2), ...[4, 5, 6, 7, 8, 9, 10].map((value) =>
        tile(`computer-impossible-purify-existing-${value}`, 'red', value))],
      team: 1,
    };
    const impossibleThree = tile('computer-impossible-purify-three-red', 'red', 3);
    const threeLeg = {
      id: 'computer-impossible-purify-three-leg',
      kind: 'leg',
      tiles: ['blue', 'green', 'yellow'].map((color) => tile(`computer-impossible-purify-leg-${color}`, color, 3)),
      team: 1,
    };
    const preferLeg = runComputerTurn(computerState({
      hand: [impossibleThree, tile('computer-impossible-purify-unmatched-blue', 'blue', 11), tile('computer-impossible-purify-unmatched-green', 'green', 12)],
      melds: [impossibleToCleanRun, threeLeg],
      phase: 'play',
    }));
    assert.ok(preferLeg.melds.find((meld) => meld.id === threeLeg.id).tiles.some((item) => item.id === impossibleThree.id));
    assert.ok(preferLeg.melds.find((meld) => meld.id === impossibleToCleanRun.id).tiles.every((item) => item.id !== impossibleThree.id));
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

  it('en parejas baja escaleras con #2 comodín solo si está en una posición permitida', () => {
    const makeState = (values, mode = 'pairs') => {
      const runTiles = values.map((value, index) => value === null
        ? tile(`pair-wild-joker-${values.join('-')}-${index}`, null, 0, 'joker')
        : tile(`pair-wild-run-${values.join('-')}-${index}`, value === 2 ? 'blue' : 'red', value));
      return {
        runTiles,
        state: computerState({
          hand: [
            ...runTiles,
            tile(`pair-wild-unmatched-blue-${values.join('-')}`, 'blue', 11),
            tile(`pair-wild-unmatched-yellow-${values.join('-')}`, 'yellow', 12),
          ],
          phase: 'play',
          mode,
        }),
      };
    };
    const containsFullRun = (steps, runTiles) => steps.some((step) => step.melds.some((meld) =>
      runTiles.every((runTile) => meld.tiles.some((item) => item.id === runTile.id))));
    const allowedSequences = [[5, 2, 7], [2, 5, 6], [4, 5, 2, 7]];

    for (const sequence of allowedSequences) {
      const { runTiles, state } = makeState(sequence);
      const steps = runComputerTurnSteps(state);
      assert.equal(containsFullRun(steps, runTiles), true);
    }

    for (const sequence of [[4, 5, 6, 2], [2, 4, 5, 6]]) {
      const { runTiles, state } = makeState(sequence);
      const steps = runComputerTurnSteps(state);
      assert.equal(containsFullRun(steps, runTiles), false, `No debe bajar la escalera ${sequence.join('-')}`);
    }

    for (const sequence of [[5, null, 7], [null, 5, 6], [4, 5, null, 7]]) {
      const { runTiles, state } = makeState(sequence);
      const steps = runComputerTurnSteps(state);
      assert.equal(containsFullRun(steps, runTiles), true);
    }

    for (const sequence of [[4, 5, 6, null], [null, 5, 6, 7]]) {
      const { runTiles, state } = makeState(sequence);
      const steps = runComputerTurnSteps(state);
      assert.equal(containsFullRun(steps, runTiles), false);
    }

    const individual = runComputerTurnSteps(makeState([5, 2, 7], 'individual').state);
    assert.equal(individual.some((step) => step.melds.length > 0), false);
  });

  it('en parejas agrega un comodín a juegos limpios largos si el rival levantó el muerto, y prefiere la escalera', () => {
    const joker = tile('pair-support-joker', null, 0, 'joker');
    const leg = {
      id: 'pair-support-leg',
      kind: 'leg',
      tiles: ['red', 'blue', 'green', 'yellow', 'red'].map((color, index) => tile(`pair-support-leg-${index}`, color, 8)),
      team: 1,
    };
    const run = {
      id: 'pair-support-run',
      kind: 'run',
      tiles: [4, 5, 6, 7, 8].map((value) => tile(`pair-support-run-${value}`, 'red', value)),
      team: 1,
    };
    const state = computerState({
      hand: [joker, tile('pair-support-unmatched-blue', 'blue', 11), tile('pair-support-unmatched-green', 'green', 12)],
      melds: [leg, run],
      opponentDeadTaken: true,
      phase: 'play',
      mode: 'pairs',
    });

    const steps = runComputerTurnSteps(state);
    const jokerMeld = steps.flatMap((step) => step.melds).find((meld) => meld.tiles.some((item) => item.id === joker.id));

    assert.ok(jokerMeld);
    assert.equal(jokerMeld.id, run.id);
    assert.ok(steps.some((step) => step.melds.some((meld) => meld.id === leg.id && meld.tiles.length === 5)));

    const two = tile('pair-support-two', 'blue', 2);
    const twoSteps = runComputerTurnSteps(computerState({
      hand: [two, tile('pair-support-two-blue', 'blue', 11), tile('pair-support-two-green', 'green', 12)],
      melds: [leg, run],
      opponentDeadTaken: true,
      phase: 'play',
      mode: 'pairs',
    }));
    const twoMeld = twoSteps.flatMap((step) => step.melds).find((meld) => meld.tiles.some((item) => item.id === two.id));
    assert.ok(twoMeld);
    assert.equal(twoMeld.id, run.id);

    const twoWithOnlyLegSteps = runComputerTurnSteps(computerState({
      hand: [two, tile('pair-support-only-leg-blue', 'blue', 11), tile('pair-support-only-leg-green', 'green', 12)],
      melds: [leg],
      opponentDeadTaken: true,
      phase: 'play',
      mode: 'pairs',
    }));
    const twoLegMeld = twoWithOnlyLegSteps.flatMap((step) => step.melds).find((meld) => meld.tiles.some((item) => item.id === two.id));
    assert.ok(twoLegMeld);
    assert.equal(twoLegMeld.id, leg.id);

    const withoutDeadTaken = runComputerTurnSteps(computerState({
      hand: [joker, tile('pair-support-no-dead-blue', 'blue', 11), tile('pair-support-no-dead-green', 'green', 12)],
      melds: [run],
      phase: 'play',
      mode: 'pairs',
    }));
    assert.equal(withoutDeadTaken.some((step) => step.melds.some((meld) => meld.tiles.some((item) => item.id === joker.id))), false);
  });

  it('permite completar una canasta limpia de seis fichas con un comodín en parejas', () => {
    const joker = tile('pair-canasta-joker', null, 0, 'joker');
    const run = {
      id: 'pair-six-run',
      kind: 'run',
      tiles: [3, 4, 5, 6, 7, 8].map((value) => tile(`pair-six-run-${value}`, 'red', value)),
      team: 1,
    };
    const state = computerState({
      hand: [joker, tile('pair-six-unmatched-blue', 'blue', 11), tile('pair-six-unmatched-green', 'green', 12)],
      melds: [run],
      opponentDeadTaken: true,
      phase: 'play',
      mode: 'pairs',
    });

    const steps = runComputerTurnSteps(state);

    assert.ok(steps.some((step) => step.melds.some((meld) => meld.id === run.id && meld.tiles.length === 7)));
  });

  it('baja un juego con comodín para tomar directamente el muerto', () => {
    const joker = tile('computer-dead-joker', null, 0, 'joker');
    const dead = Array.from({ length: 11 }, (_, index) => tile(`computer-dead-tile-${index}`, 'yellow', index + 3));
    const state = computerState({
      hand: [tile('computer-dead-run-five', 'red', 5), tile('computer-dead-run-six', 'red', 6), joker],
      deadPiles: [[], dead],
      phase: 'play',
    });

    const steps = runComputerTurnSteps(state, { ...DEFAULT_AI_PREFERENCES, layMeldProbability: 1 });

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

  it('encadena varias combinaciones con comodín para tomar directamente el muerto ignorando layMeldProbability y retencion de juegos', () => {
    const dead = Array.from({ length: 11 }, (_, index) => tile(`computer-sequence-dead-${index}`, 'yellow', index + 3));
    const twelveLeg = {
      id: 'computer-sequence-twelve-leg',
      kind: 'leg',
      tiles: [
        tile('computer-sequence-red-twelve', 'red', 12),
        tile('computer-sequence-blue-twelve', 'blue', 12),
        tile('computer-sequence-yellow-twelve', 'yellow', 12),
      ],
      team: 1,
    };
    const state = computerState({
      hand: [
        tile('computer-sequence-yellow-four', 'yellow', 4),
        tile('computer-sequence-yellow-two', 'yellow', 2),
        tile('computer-sequence-blue-two', 'blue', 2),
        tile('computer-sequence-red-four', 'red', 4),
        tile('computer-sequence-blue-thirteen', 'blue', 13),
        tile('computer-sequence-green-four', 'green', 4),
        tile('computer-sequence-green-eight', 'green', 8),
        tile('computer-sequence-green-thirteen', 'green', 13),
      ],
      melds: [twelveLeg],
      discard: [
        tile('computer-sequence-green-twelve-one', 'green', 12),
        tile('computer-sequence-green-seven', 'green', 7),
        tile('computer-sequence-green-twelve-two', 'green', 12),
      ],
      stock: [tile('computer-sequence-stock', 'red', 10)],
      deadPiles: [[], dead],
    });

    const dataProfile = AI_PROFILES.find((profile) => profile.id === 'data');
    const dataState = {
      ...state,
      players: state.players.map((player) => player.id === 1 ? { ...player, aiProfileId: 'data' } : player),
    };
    const steps = runComputerTurnSteps(dataState, dataProfile.preferences, () => 0.99);

    const deadTakenStep = steps.find((step) => step.players[1].deadTaken);

    assert.ok(deadTakenStep);
    assert.equal(deadTakenStep.players[1].hand.length, dead.length);
    assert.ok(deadTakenStep.melds.some((meld) =>
      meld.kind === 'leg' && meld.tiles.some((item) => item.id === 'computer-sequence-blue-thirteen')
        && meld.tiles.some((item) => item.id === 'computer-sequence-green-thirteen')));
    assert.ok(deadTakenStep.melds.some((meld) =>
      meld.kind === 'run' && meld.tiles.some((item) => item.id === 'computer-sequence-green-seven')
        && meld.tiles.some((item) => item.id === 'computer-sequence-green-eight')));
    assert.equal(deadTakenStep.melds.find((meld) => meld.id === twelveLeg.id).tiles.length, 5);
  });

  it('encadena combinaciones naturales para tomar el muerto ignorando layMeldProbability', () => {
    const dead = Array.from({ length: 11 }, (_, index) => tile(`computer-natural-dead-${index}`, 'yellow', index + 3));
    const twelveLeg = {
      id: 'computer-natural-twelve-leg',
      kind: 'leg',
      tiles: [
        tile('computer-natural-red-twelve', 'red', 12),
        tile('computer-natural-blue-twelve', 'blue', 12),
        tile('computer-natural-yellow-twelve', 'yellow', 12),
      ],
      team: 1,
    };
    const state = computerState({
      hand: [
        tile('computer-natural-yellow-four', 'yellow', 4),
        tile('computer-natural-red-four', 'red', 4),
        tile('computer-natural-green-four', 'green', 4),
        tile('computer-natural-red-thirteen', 'red', 13),
        tile('computer-natural-blue-thirteen', 'blue', 13),
        tile('computer-natural-yellow-thirteen', 'yellow', 13),
        tile('computer-natural-green-five', 'green', 5),
        tile('computer-natural-green-six', 'green', 6),
      ],
      melds: [twelveLeg],
      discard: [
        tile('computer-natural-green-twelve-one', 'green', 12),
        tile('computer-natural-green-seven', 'green', 7),
        tile('computer-natural-green-twelve-two', 'green', 12),
      ],
      stock: [tile('computer-natural-stock', 'red', 10)],
      deadPiles: [[], dead],
    });
    const dataProfile = AI_PROFILES.find((profile) => profile.id === 'data');
    const dataState = {
      ...state,
      players: state.players.map((player) => player.id === 1 ? { ...player, aiProfileId: 'data' } : player),
    };

    const steps = runComputerTurnSteps(dataState, dataProfile.preferences, () => 0.99);
    const deadTakenStep = steps.find((step) => step.players[1].deadTaken);

    assert.ok(deadTakenStep);
    assert.equal(deadTakenStep.players[1].hand.length, dead.length);
    assert.ok(deadTakenStep.melds.every((meld) =>
      meld.tiles.every((item) => item.value !== 2 && item.kind !== 'joker')));
  });

  it('cierra con una canasta larga aunque layMeldProbability del perfil la rechazaría', () => {
    const state = computerState({
      hand: [
        tile('computer-long-close-red-eight-one', 'red', 8),
        tile('computer-long-close-red-eight-two', 'red', 8),
        tile('computer-long-close-blue-eight-one', 'blue', 8),
        tile('computer-long-close-blue-eight-two', 'blue', 8),
        tile('computer-long-close-green-eight-one', 'green', 8),
        tile('computer-long-close-yellow-eight-one', 'yellow', 8),
        tile('computer-long-close-yellow-eight-two', 'yellow', 8),
      ],
      deadTaken: true,
      phase: 'play',
    });
    const dataProfile = AI_PROFILES.find((profile) => profile.id === 'data');
    const dataState = {
      ...state,
      players: state.players.map((player) => player.id === 1 ? { ...player, aiProfileId: 'data' } : player),
    };

    const next = runComputerTurn(dataState, dataProfile.preferences, () => 0.99);

    assert.equal(next.phase, 'round-over');
    assert.equal(next.melds[0].tiles.length, 7);
  });

  it('reconoce una canasta de escalera con vuelta del #1 al evaluar el cierre', () => {
    const state = computerState({
      hand: [8, 9, 10, 11, 12, 13, 1].map((value) => tile(`computer-run-canasta-${value}`, 'green', value)),
      deadTaken: true,
      phase: 'play',
    });

    const next = runComputerTurn(state, { ...DEFAULT_AI_PREFERENCES, layMeldProbability: 0 });

    assert.equal(next.phase, 'round-over');
    assert.equal(next.melds[0].kind, 'run');
    assert.equal(next.melds[0].tiles.length, 7);
  });

  it('encadena juegos naturales para cortar aunque el perfil retenga juegos largos', () => {
    const canasta = {
      id: 'computer-natural-chain-canasta',
      kind: 'leg',
      tiles: Array.from({ length: 7 }, (_, index) =>
        tile(`computer-natural-chain-canasta-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 12)),
      team: 1,
    };
    const state = computerState({
      hand: [
        ...[3, 4, 5, 6, 7].map((value) => tile(`computer-natural-chain-run-${value}`, 'red', value)),
        tile('computer-natural-chain-leg-yellow', 'yellow', 8),
        tile('computer-natural-chain-leg-blue', 'blue', 8),
        tile('computer-natural-chain-leg-green', 'green', 8),
      ],
      melds: [canasta],
      deadTaken: true,
      phase: 'play',
    });
    const daneelProfile = AI_PROFILES.find((profile) => profile.id === 'daneel-olivaw');
    const daneelState = {
      ...state,
      players: state.players.map((player) => player.id === 1 ? { ...player, aiProfileId: 'daneel-olivaw' } : player),
    };

    const next = runComputerTurn(daneelState, daneelProfile.preferences, () => 0.99);

    assert.equal(next.phase, 'round-over');
    assert.ok(next.melds.some((meld) => meld.tiles.length === 5 && meld.tiles.some((item) => item.id === 'computer-natural-chain-run-3')));
    assert.ok(next.melds.some((meld) => meld.kind === 'leg' && meld.tiles.length === 3));
    assert.equal(next.players[1].hand.length, 0);
  });

  it('encadena juegos con comodín para cortar aunque el perfil retenga juegos largos', () => {
    const canasta = {
      id: 'computer-wild-chain-canasta',
      kind: 'leg',
      tiles: Array.from({ length: 7 }, (_, index) =>
        tile(`computer-wild-chain-canasta-${index}`, ['red', 'blue', 'green', 'yellow'][index % 4], 12)),
      team: 1,
    };
    const joker = tile('computer-wild-chain-joker', null, 0, 'joker');
    const state = computerState({
      hand: [
        joker,
        ...[4, 5, 6, 7].map((value) => tile(`computer-wild-chain-run-${value}`, 'red', value)),
        tile('computer-wild-chain-leg-yellow', 'yellow', 8),
        tile('computer-wild-chain-leg-blue', 'blue', 8),
        tile('computer-wild-chain-leg-green', 'green', 8),
      ],
      melds: [canasta],
      deadTaken: true,
      phase: 'play',
    });
    const daneelProfile = AI_PROFILES.find((profile) => profile.id === 'daneel-olivaw');
    const daneelState = {
      ...state,
      players: state.players.map((player) => player.id === 1 ? { ...player, aiProfileId: 'daneel-olivaw' } : player),
    };

    const next = runComputerTurn(daneelState, daneelProfile.preferences, () => 0.99);

    assert.equal(next.phase, 'round-over');
    assert.ok(next.melds.some((meld) =>
      meld.kind === 'run' && meld.tiles.length === 5 && meld.tiles.some((item) => item.id === joker.id)));
    assert.ok(next.melds.some((meld) => meld.kind === 'leg' && meld.tiles.length === 3));
    assert.equal(next.players[1].hand.length, 0);
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

    const next = runComputerTurn(state, { ...DEFAULT_AI_PREFERENCES, layMeldProbability: 1 });

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

  it('levanta el pozo para completar canasta, bajar juegos y cortar mano', () => {
    const melds = [
      {
        id: 'robotina-scenario-leg-four',
        kind: 'leg',
        tiles: ['red', 'green', 'yellow'].map((color) => tile(`robotina-scenario-four-${color}`, color, 4)),
        team: 1,
      },
      {
        id: 'robotina-scenario-yellow-run',
        kind: 'run',
        tiles: [
          tile('robotina-scenario-yellow-seven', 'yellow', 7),
          tile('robotina-scenario-red-two-wild', 'red', 2),
          ...[9, 10, 11, 12].map((value) => tile(`robotina-scenario-yellow-${value}`, 'yellow', value)),
        ],
        team: 1,
      },
      {
        id: 'robotina-scenario-red-run',
        kind: 'run',
        tiles: [
          tile('robotina-scenario-red-eight', 'red', 8),
          tile('robotina-scenario-yellow-two-wild', 'yellow', 2),
          tile('robotina-scenario-red-ten', 'red', 10),
        ],
        team: 1,
      },
      {
        id: 'robotina-scenario-green-run',
        kind: 'run',
        tiles: [6, 7, 8, 9].map((value) => tile(`robotina-scenario-green-${value}`, 'green', value)),
        team: 1,
      },
      {
        id: 'robotina-scenario-leg-twelve',
        kind: 'leg',
        tiles: [
          tile('robotina-scenario-blue-twelve-one', 'blue', 12),
          tile('robotina-scenario-blue-twelve-two', 'blue', 12),
          tile('robotina-scenario-red-twelve-one', 'red', 12),
          tile('robotina-scenario-red-twelve-two', 'red', 12),
        ],
        team: 1,
      },
    ];
    const state = computerState({
      hand: [
        tile('robotina-scenario-joker', null, 0, 'joker'),
        tile('robotina-scenario-green-one', 'green', 1),
        tile('robotina-scenario-red-two', 'red', 2),
        tile('robotina-scenario-red-thirteen', 'red', 13),
        tile('robotina-scenario-green-thirteen', 'green', 13),
        tile('robotina-scenario-green-three', 'green', 3),
      ],
      melds,
      discard: [
        tile('robotina-scenario-yellow-twelve', 'yellow', 12),
        tile('robotina-scenario-yellow-three', 'yellow', 3),
        tile('robotina-scenario-yellow-eight', 'yellow', 8),
      ],
      stock: [tile('robotina-scenario-stock', 'red', 5)],
      deadTaken: true,
      phase: 'draw',
    });
    const robotinaProfile = AI_PROFILES.find((profile) => profile.id === 'robotina');
    const robotinaState = {
      ...state,
      players: state.players.map((player) => player.id === 1 ? { ...player, aiProfileId: 'robotina' } : player),
    };

    const steps = runComputerTurnSteps(robotinaState, robotinaProfile.preferences, () => 0.99);
    const next = steps.at(-1);

    assert.equal(steps[0].discard.length, 0);
    assert.equal(next.phase, 'round-over');
    assert.equal(next.players[1].hand.length, 0);
    assert.equal(next.discard.length, 1);
    assert.equal(next.melds.find((meld) => meld.id === 'robotina-scenario-yellow-run').tiles.length, 7);
    assert.equal(next.melds.find((meld) => meld.id === 'robotina-scenario-leg-twelve').tiles.length, 5);
    assert.ok(next.melds.some((meld) =>
      meld.team === 1 && meld.kind === 'leg'
        && meld.tiles.some((item) => item.id === 'robotina-scenario-red-thirteen')
        && meld.tiles.some((item) => item.id === 'robotina-scenario-green-thirteen')
        && meld.tiles.some((item) => item.id === 'robotina-scenario-joker')));
    assert.ok(next.melds.some((meld) =>
      meld.team === 1
        && meld.tiles.some((item) => item.id === 'robotina-scenario-red-two')
        && meld.tiles.some((item) => item.id === 'robotina-scenario-green-three')
        && (meld.tiles.some((item) => item.id === 'robotina-scenario-green-one')
          || meld.tiles.some((item) => item.id === 'robotina-scenario-yellow-three'))));
  });

  it('levanta el pozo si puede vaciar el atril y tomar el muerto directo extendiendo juegos existentes', () => {
    const dead = Array.from({ length: 11 }, (_, index) => tile(`robotina-dead-priority-${index}`, 'yellow', index + 3));
    const melds = [
      {
        id: 'robotina-dead-priority-red-canasta',
        kind: 'run',
        tiles: [3, 4, 5, 6, 7, 8, 9, 10].map((value) => tile(`robotina-dead-priority-red-${value}`, 'red', value)),
        team: 1,
      },
      {
        id: 'robotina-dead-priority-green-run',
        kind: 'run',
        tiles: [6, 7, 8, 9].map((value) => tile(`robotina-dead-priority-green-${value}`, 'green', value)),
        team: 1,
      },
      {
        id: 'robotina-dead-priority-blue-run',
        kind: 'run',
        tiles: [8, 9, 10, 11].map((value) => tile(`robotina-dead-priority-blue-${value}`, 'blue', value)),
        team: 1,
      },
      {
        id: 'robotina-dead-priority-six-leg',
        kind: 'leg',
        tiles: ['blue', 'red', 'yellow'].map((color) => tile(`robotina-dead-priority-six-${color}`, color, 6)),
        team: 1,
      },
    ];
    const state = computerState({
      hand: [
        tile('robotina-dead-priority-green-two', 'green', 2),
        tile('robotina-dead-priority-red-two', 'red', 2),
        tile('robotina-dead-priority-yellow-two', 'yellow', 2),
        tile('robotina-dead-priority-blue-four-a', 'blue', 4),
        tile('robotina-dead-priority-yellow-four', 'yellow', 4),
        tile('robotina-dead-priority-blue-four-b', 'blue', 4),
        tile('robotina-dead-priority-blue-thirteen', 'blue', 13),
      ],
      melds,
      discard: [
        tile('robotina-dead-priority-green-five', 'green', 5),
        tile('robotina-dead-priority-blue-six', 'blue', 6),
      ],
      stock: [tile('robotina-dead-priority-stock', 'red', 5)],
      deadPiles: [[], dead],
    });
    const robotinaProfile = AI_PROFILES.find((profile) => profile.id === 'robotina');
    const robotinaState = {
      ...state,
      players: state.players.map((player) => player.id === 1 ? { ...player, aiProfileId: 'robotina' } : player),
    };

    const steps = runComputerTurnSteps(robotinaState, robotinaProfile.preferences, () => 0.99);
    const deadTakenStep = steps.find((step) => step.players[1].deadTaken);

    assert.equal(steps[0].discard.length, 0);
    assert.ok(deadTakenStep);
    assert.equal(deadTakenStep.players[1].hand.length, dead.length);
  });

  it('levanta el pozo para tomar el muerto indirectamente tras descartar la ficha restante', () => {
    const dead = Array.from({ length: 11 }, (_, index) => tile(`robotina-indirect-dead-${index}`, 'yellow', index + 3));
    const melds = [
      {
        id: 'robotina-indirect-red-canasta',
        kind: 'run',
        tiles: [3, 4, 5, 6, 7, 8, 9, 10].map((value) => tile(`robotina-indirect-red-${value}`, 'red', value)),
        team: 1,
      },
      {
        id: 'robotina-indirect-ones',
        kind: 'leg',
        tiles: [
          tile('robotina-indirect-red-one-a', 'red', 1),
          tile('robotina-indirect-green-one-a', 'green', 1),
          tile('robotina-indirect-green-one-b', 'green', 1),
        ],
        team: 0,
      },
      {
        id: 'robotina-indirect-green-run',
        kind: 'run',
        tiles: [9, 10, 11].map((value) => tile(`robotina-indirect-green-${value}`, 'green', value)),
        team: 1,
      },
      {
        id: 'robotina-indirect-opponent-run',
        kind: 'run',
        tiles: [
          tile('robotina-indirect-opponent-red-nine', 'red', 9),
          tile('robotina-indirect-opponent-red-ten', 'red', 10),
          tile('robotina-indirect-opponent-blue-two', 'blue', 2),
          tile('robotina-indirect-opponent-red-twelve', 'red', 12),
        ],
        team: 0,
      },
      {
        id: 'robotina-indirect-opponent-yellow-run',
        kind: 'run',
        tiles: [
          ...[9, 10, 11, 12].map((value) => tile(`robotina-indirect-opponent-yellow-${value}`, 'yellow', value)),
          tile('robotina-indirect-opponent-joker', null, 0, 'joker'),
          tile('robotina-indirect-opponent-yellow-one', 'yellow', 1),
        ],
        team: 0,
      },
      {
        id: 'robotina-indirect-seven-leg',
        kind: 'leg',
        tiles: ['blue', 'green', 'yellow'].map((color) => tile(`robotina-indirect-seven-${color}`, color, 7)),
        team: 1,
      },
      {
        id: 'robotina-indirect-opponent-one-leg',
        kind: 'leg',
        tiles: [
          tile('robotina-indirect-opponent-red-one-b', 'red', 1),
          tile('robotina-indirect-opponent-yellow-one-b', 'yellow', 1),
          tile('robotina-indirect-opponent-joker-two', null, 0, 'joker'),
        ],
        team: 0,
      },
      {
        id: 'robotina-indirect-blue-run',
        kind: 'run',
        tiles: [8, 9, 10, 11].map((value) => tile(`robotina-indirect-blue-${value}`, 'blue', value)),
        team: 1,
      },
      {
        id: 'robotina-indirect-yellow-run',
        kind: 'run',
        tiles: [9, 10, 11].map((value) => tile(`robotina-indirect-yellow-${value}`, 'yellow', value)),
        team: 1,
      },
      {
        id: 'robotina-indirect-three-leg',
        kind: 'leg',
        tiles: [
          tile('robotina-indirect-yellow-three-a', 'yellow', 3),
          tile('robotina-indirect-blue-three', 'blue', 3),
          tile('robotina-indirect-yellow-three-b', 'yellow', 3),
        ],
        team: 1,
      },
      {
        id: 'robotina-indirect-six-leg',
        kind: 'leg',
        tiles: ['yellow', 'red', 'blue'].map((color) => tile(`robotina-indirect-six-${color}`, color, 6)),
        team: 1,
      },
    ];
    const opponentHand = Array.from({ length: 9 }, (_, index) => tile(`robotina-indirect-opponent-hand-${index}`, 'green', index + 2));
    const state = computerState({
      hand: [
        tile('robotina-indirect-green-two', 'green', 2),
        tile('robotina-indirect-red-two', 'red', 2),
        tile('robotina-indirect-yellow-two', 'yellow', 2),
        tile('robotina-indirect-blue-four-a', 'blue', 4),
        tile('robotina-indirect-yellow-four', 'yellow', 4),
        tile('robotina-indirect-blue-four-b', 'blue', 4),
        tile('robotina-indirect-blue-thirteen', 'blue', 13),
      ],
      melds,
      discard: [
        tile('robotina-indirect-green-five', 'green', 5),
        tile('robotina-indirect-blue-six', 'blue', 6),
      ],
      stock: [tile('robotina-indirect-stock', 'red', 5)],
      deadPiles: [[], dead],
      opponentHand,
      opponentDeadTaken: true,
    });
    const robotinaProfile = AI_PROFILES.find((profile) => profile.id === 'robotina');
    const robotinaState = {
      ...state,
      players: state.players.map((player) => player.id === 1 ? { ...player, aiProfileId: 'robotina' } : player),
    };

    const steps = runComputerTurnSteps(robotinaState, robotinaProfile.preferences, () => 0.99);
    const deadTakenStep = steps.find((step) => step.players[1].deadTaken);

    assert.equal(steps[0].discard.length, 0);
    assert.ok(deadTakenStep);
    assert.equal(deadTakenStep.players[1].indirectDead, true);
    assert.equal(deadTakenStep.discard.at(-1).id, 'robotina-indirect-green-five');
    assert.equal(deadTakenStep.players[1].hand.length, dead.length);
    const blueRun = deadTakenStep.melds.find((meld) => meld.id === 'robotina-indirect-blue-run');
    const redCanasta = deadTakenStep.melds.find((meld) => meld.id === 'robotina-indirect-red-canasta');
    assert.ok(blueRun.tiles.some((item) => item.value === 2));
    assert.equal(redCanasta.tiles.length, 8);
    assert.ok(deadTakenStep.melds
      .filter((meld) => meld.team === 1 && meld.id !== redCanasta.id)
      .flatMap((meld) => meld.tiles)
      .filter((item) => item.value === 2).length >= 2);
  });
});
