import type { MeldKind } from './game.js';

export type AiPreferences = {
  discardPileWindow: number;
  preferredMeldKind: MeldKind;
  meldKindPreferenceBonus: number;
  avoidOpponentCanastaDiscards: boolean;
  avoidOpponentMeldExtensions: boolean;
  layMeldProbability: number;
  ownMeldDiscardPileEvaluationProbability: number;
};

export type AiProfile = {
  id: string;
  name: string;
  avatar: string;
  preferences: AiPreferences;
};

export const DEFAULT_AI_PREFERENCES: AiPreferences = {
  discardPileWindow: 20, // Cantidad máxima de fichas superiores del pozo que analiza.
  preferredMeldKind: 'run', // Tipo de combinación que recibe una bonificación al elegir qué bajar.
  meldKindPreferenceBonus: 2, // Magnitud de la preferencia por pierna o escalera.
  avoidOpponentCanastaDiscards: false, // Evita descartes que ayuden a completar o limpiar canastas rivales.
  avoidOpponentMeldExtensions: false, // Evita que rivales sin canasta lleven sus juegos a cinco o seis fichas.
  layMeldProbability: 1, // Probabilidad de bajar una combinación disponible.
  ownMeldDiscardPileEvaluationProbability: 1, // Probabilidad de levantar el pozo para extender juegos propios.
};

const preferences = (overrides: Partial<AiPreferences>): AiPreferences => ({
  ...DEFAULT_AI_PREFERENCES,
  ...overrides,
});

export const AI_PROFILES = [
  { id: 'bender', name: 'Bender', avatar: '/avatars/bender.svg', preferences: preferences({ discardPileWindow: 8, preferredMeldKind: 'leg', meldKindPreferenceBonus: 5, avoidOpponentMeldExtensions: true, layMeldProbability: 0.8, ownMeldDiscardPileEvaluationProbability: 0.6 }) },
  { id: 'daneel-olivaw', name: 'R. Daneel Olivaw', avatar: '/avatars/daneel_olivaw.svg', preferences: preferences({ avoidOpponentCanastaDiscards: true, avoidOpponentMeldExtensions: true, ownMeldDiscardPileEvaluationProbability: 0.9 }) },
  { id: 'data', name: 'Data', avatar: '/avatars/data.svg', preferences: preferences({ discardPileWindow: 16, meldKindPreferenceBonus: 3, avoidOpponentCanastaDiscards: true, avoidOpponentMeldExtensions: true, layMeldProbability: 0.85, ownMeldDiscardPileEvaluationProbability: 0.7 }) },
  { id: 'hal-9000', name: 'HAL 9000', avatar: '/avatars/hal_9000.svg', preferences: preferences({ preferredMeldKind: 'leg', meldKindPreferenceBonus: 6, avoidOpponentCanastaDiscards: true, layMeldProbability: 0.7, ownMeldDiscardPileEvaluationProbability: 0.6 }) },
  { id: 'multivac', name: 'Multivac', avatar: '/avatars/multivac.svg', preferences: preferences({ avoidOpponentCanastaDiscards: true, avoidOpponentMeldExtensions: true }) },
  { id: 'r2-d2', name: 'R2-D2', avatar: '/avatars/r2d2.svg', preferences: preferences({ discardPileWindow: 10, preferredMeldKind: 'leg', meldKindPreferenceBonus: 4, ownMeldDiscardPileEvaluationProbability: 0.6 }) },
  { id: 'robotina', name: 'Robotina', avatar: '/avatars/robotina.svg', preferences: preferences({ discardPileWindow: 12, preferredMeldKind: 'leg', meldKindPreferenceBonus: 5, layMeldProbability: 0.65, ownMeldDiscardPileEvaluationProbability: 0.6 }) },
  { id: 'sonny', name: 'Sonny', avatar: '/avatars/sonny_ns-5.svg', preferences: preferences({ discardPileWindow: 16, meldKindPreferenceBonus: 3, avoidOpponentCanastaDiscards: true, ownMeldDiscardPileEvaluationProbability: 0.6 }) },
  { id: 'bot', name: 'Bot', avatar: '/avatars/bot.svg', preferences: preferences({ discardPileWindow: 6, preferredMeldKind: 'leg', meldKindPreferenceBonus: 4, layMeldProbability: 0.55, ownMeldDiscardPileEvaluationProbability: 0.6 }) },
  { id: 'computer', name: 'Computadora', avatar: '/avatars/computer.svg', preferences: DEFAULT_AI_PREFERENCES },
  { id: 'npc', name: 'NPC', avatar: '/avatars/npc.svg', preferences: preferences({ discardPileWindow: 8, preferredMeldKind: 'leg', meldKindPreferenceBonus: 6, layMeldProbability: 0.45, ownMeldDiscardPileEvaluationProbability: 0.6 }) },
  { id: 'robot', name: 'Robot', avatar: '/avatars/robot.svg', preferences: preferences({ discardPileWindow: 14, meldKindPreferenceBonus: 4, avoidOpponentCanastaDiscards: true, layMeldProbability: 0.8, ownMeldDiscardPileEvaluationProbability: 0.6 }) },
] as const satisfies readonly AiProfile[];

export type AiProfileId = (typeof AI_PROFILES)[number]['id'];

export function getAiProfileById(id: string | null | undefined): (typeof AI_PROFILES)[number] | null {
  return AI_PROFILES.find((profile) => profile.id === id) ?? null;
}

export function selectUniqueAiProfiles(
  count: number,
  random = Math.random,
  excludedProfileIds: readonly AiProfileId[] = [],
): (typeof AI_PROFILES)[number][] {
  const excluded = new Set(excludedProfileIds);
  const available = AI_PROFILES.filter((profile) => !excluded.has(profile.id));
  if (!Number.isInteger(count) || count < 0 || count > available.length) {
    throw new RangeError('La cantidad de perfiles de IA solicitada no es válida.');
  }

  const selected: (typeof AI_PROFILES)[number][] = [];
  while (selected.length < count) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError('El generador aleatorio debe devolver un valor entre 0 y 1.');
    }
    const index = Math.floor(sample * available.length);
    selected.push(available.splice(index, 1)[0]);
  }
  return selected;
}

export function selectRandomAiProfile(random = Math.random): (typeof AI_PROFILES)[number] {
  const [profile] = selectUniqueAiProfiles(1, random);
  if (!profile) throw new Error('No hay perfiles de IA disponibles.');
  return profile;
}

export function normalizeAiPlayer<T extends { name: string; aiProfileId?: string | null }>(
  player: T,
  random = Math.random,
): T & { aiProfileId: AiProfileId } {
  const profile = getAiProfileById(player.aiProfileId) ?? selectRandomAiProfile(random);
  return { ...player, name: profile.name, aiProfileId: profile.id };
}

export function normalizeAiPlayers<T extends { name: string; aiProfileId?: string | null }>(
  players: readonly T[],
  random = Math.random,
): (T & { aiProfileId: AiProfileId | null })[] {
  const used = new Set<AiProfileId>();
  return players.map((player, index) => {
    if (index === 0) return { ...player, aiProfileId: null };
    const savedProfile = getAiProfileById(player.aiProfileId);
    const profile = savedProfile && !used.has(savedProfile.id)
      ? savedProfile
      : selectUniqueAiProfiles(1, random, [...used])[0];
    if (!profile) throw new Error('No hay suficientes perfiles de IA para esta partida.');
    used.add(profile.id);
    return { ...player, name: profile.name, aiProfileId: profile.id };
  });
}
