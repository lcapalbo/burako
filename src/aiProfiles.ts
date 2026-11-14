import type { MeldKind } from './game.js';

export type AiPreferences = {
  discardPileWindow: number;
  preferredMeldKind: MeldKind;
  meldKindPreferenceBonus: number;
  avoidOpponentCanastaDiscards: boolean;
  layMeldProbability: number;
  ownMeldPozoEvaluationProbability: number;
};

export type AiProfile = {
  id: string;
  name: string;
  avatar: string;
  preferences: AiPreferences;
};

export const DEFAULT_AI_PREFERENCES: AiPreferences = {
  discardPileWindow: 10,
  preferredMeldKind: 'run',
  meldKindPreferenceBonus: 2,
  avoidOpponentCanastaDiscards: false,
  layMeldProbability: 1,
  ownMeldPozoEvaluationProbability: 1,
};

const preferences = (overrides: Partial<AiPreferences>): AiPreferences => ({
  ...DEFAULT_AI_PREFERENCES,
  ...overrides,
});

export const AI_PROFILES = [
  { id: 'bender', name: 'Bender', avatar: '/avatars/bender.svg', preferences: preferences({ discardPileWindow: 4, preferredMeldKind: 'leg', meldKindPreferenceBonus: 5, layMeldProbability: 0.8, ownMeldPozoEvaluationProbability: 0.25 }) },
  { id: 'daneel-olivaw', name: 'R. Daneel Olivaw', avatar: '/avatars/daneel_olivaw.svg', preferences: preferences({ avoidOpponentCanastaDiscards: true, ownMeldPozoEvaluationProbability: 0.9 }) },
  { id: 'data', name: 'Data', avatar: '/avatars/data.svg', preferences: preferences({ discardPileWindow: 8, meldKindPreferenceBonus: 3, avoidOpponentCanastaDiscards: true, layMeldProbability: 0.85, ownMeldPozoEvaluationProbability: 0.7 }) },
  { id: 'hal-9000', name: 'HAL 9000', avatar: '/avatars/hal_9000.svg', preferences: preferences({ preferredMeldKind: 'leg', meldKindPreferenceBonus: 6, avoidOpponentCanastaDiscards: true, layMeldProbability: 0.7, ownMeldPozoEvaluationProbability: 0.4 }) },
  { id: 'multivac', name: 'Multivac', avatar: '/avatars/multivac.svg', preferences: preferences({ avoidOpponentCanastaDiscards: true }) },
  { id: 'r2-d2', name: 'R2-D2', avatar: '/avatars/r2d2.svg', preferences: preferences({ discardPileWindow: 5, preferredMeldKind: 'leg', meldKindPreferenceBonus: 4, ownMeldPozoEvaluationProbability: 0 }) },
  { id: 'robotina', name: 'Robotina', avatar: '/avatars/robotina.svg', preferences: preferences({ discardPileWindow: 6, preferredMeldKind: 'leg', meldKindPreferenceBonus: 5, layMeldProbability: 0.65, ownMeldPozoEvaluationProbability: 0.3 }) },
  { id: 'sonny', name: 'Sonny', avatar: '/avatars/sonny_ns-5.svg', preferences: preferences({ discardPileWindow: 8, meldKindPreferenceBonus: 3, avoidOpponentCanastaDiscards: true, ownMeldPozoEvaluationProbability: 0.6 }) },
  { id: 'bot', name: 'Bot', avatar: '/avatars/bot.svg', preferences: preferences({ discardPileWindow: 3, preferredMeldKind: 'leg', meldKindPreferenceBonus: 4, layMeldProbability: 0.55, ownMeldPozoEvaluationProbability: 0.2 }) },
  { id: 'computer', name: 'Computadora', avatar: '/avatars/computer.svg', preferences: DEFAULT_AI_PREFERENCES },
  { id: 'npc', name: 'NPC', avatar: '/avatars/npc.svg', preferences: preferences({ discardPileWindow: 4, preferredMeldKind: 'leg', meldKindPreferenceBonus: 6, layMeldProbability: 0.45, ownMeldPozoEvaluationProbability: 0.1 }) },
  { id: 'robot', name: 'Robot', avatar: '/avatars/robot.svg', preferences: preferences({ discardPileWindow: 7, meldKindPreferenceBonus: 4, avoidOpponentCanastaDiscards: true, layMeldProbability: 0.8, ownMeldPozoEvaluationProbability: 0.45 }) },
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
