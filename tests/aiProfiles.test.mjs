import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AI_PROFILES, normalizeAiPlayer, selectRandomAiProfile, selectUniqueAiProfiles } from '../.test-build/aiProfiles.js';

describe('perfiles de IA', () => {
  it('selecciona perfiles de manera determinista y sin repetirlos', () => {
    const selected = selectUniqueAiProfiles(3, () => 0);
    const opponents = selectUniqueAiProfiles(2, () => 0, ['hal-9000']);

    assert.deepEqual(selected.map((profile) => profile.id), ['bender', 'daneel-olivaw', 'data']);
    assert.equal(new Set(selected.map((profile) => profile.id)).size, selected.length);
    assert.ok(opponents.every((profile) => profile.id !== 'hal-9000'));
    assert.equal(selectRandomAiProfile(() => 0.99).id, AI_PROFILES.at(-1).id);
  });

  it('rechaza una cantidad de perfiles mayor que el catálogo', () => {
    assert.throws(() => selectUniqueAiProfiles(AI_PROFILES.length + 1), /cantidad de perfiles/);
  });

  it('normaliza jugadores guardados sin perfil y conserva el perfil ya asignado', () => {
    const fallbackProfile = selectRandomAiProfile(() => 0.5);
    const legacyPlayer = normalizeAiPlayer({ name: 'La computadora' }, () => 0.5);
    const savedPlayer = normalizeAiPlayer({ name: 'Nombre anterior', aiProfileId: 'hal-9000' });

    assert.equal(legacyPlayer.aiProfileId, fallbackProfile.id);
    assert.equal(legacyPlayer.name, fallbackProfile.name);
    assert.equal(savedPlayer.aiProfileId, 'hal-9000');
    assert.equal(savedPlayer.name, 'HAL 9000');
  });

  it('incluye los avatares genéricos disponibles', () => {
    assert.deepEqual(
      AI_PROFILES.filter((profile) => ['bot', 'computer', 'npc', 'robot'].includes(profile.id)).map((profile) => profile.avatar),
      ['/avatars/bot.svg', '/avatars/computer.svg', '/avatars/npc.svg', '/avatars/robot.svg'],
    );
  });
});
