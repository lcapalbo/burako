export type AiProfile = {
  id: string;
  name: string;
  avatar: string;
  preferences: null;
};

export const AI_PROFILES = [
  { id: 'bender', name: 'Bender', avatar: '/avatars/bender.svg', preferences: null },
  { id: 'daneel-olivaw', name: 'R. Daneel Olivaw', avatar: '/avatars/daneel_olivaw.svg', preferences: null },
  { id: 'data', name: 'Data', avatar: '/avatars/data.svg', preferences: null },
  { id: 'hal-9000', name: 'HAL 9000', avatar: '/avatars/hal_9000.svg', preferences: null },
  { id: 'multivac', name: 'Multivac', avatar: '/avatars/multivac.svg', preferences: null },
  { id: 'r2-d2', name: 'R2-D2', avatar: '/avatars/r2d2.svg', preferences: null },
  { id: 'robotina', name: 'Robotina', avatar: '/avatars/robotina.svg', preferences: null },
  { id: 'sonny', name: 'Sonny', avatar: '/avatars/sonny_ns-5.svg', preferences: null },
  { id: 'bot', name: 'Bot', avatar: '/avatars/bot.svg', preferences: null },
  { id: 'computer', name: 'Computadora', avatar: '/avatars/computer.svg', preferences: null },
  { id: 'npc', name: 'NPC', avatar: '/avatars/npc.svg', preferences: null },
  { id: 'robot', name: 'Robot', avatar: '/avatars/robot.svg', preferences: null },
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
