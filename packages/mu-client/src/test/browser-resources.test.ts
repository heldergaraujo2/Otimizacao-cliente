import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveModelTexturePath } from '../browser/resources.js';

test('resolves a BMD texture path case-insensitively with Windows separators', () => {
  assert.equal(
    resolveModelTexturePath('Data\\Player\\DarkKnight.OZT', ['Player/darkknight.ozt']),
    'Player/darkknight.ozt',
  );
});

test('tries common MU texture extensions when a BMD path extension differs', () => {
  assert.equal(
    resolveModelTexturePath('World1\\Terrain\\Grass.tga', ['World1/Terrain/Grass.OZT']),
    'World1/Terrain/Grass.OZT',
  );
});

test('keeps the original relative path when the asset index is incomplete', () => {
  assert.equal(
    resolveModelTexturePath('Monster/Dragon/skin.OZT', ['Player/skin.OZT']),
    'Monster/Dragon/skin.OZT',
  );
});

test('returns undefined for an empty BMD texture path', () => {
  assert.equal(resolveModelTexturePath('', ['Player/skin.OZT']), undefined);
});
