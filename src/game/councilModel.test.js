import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptRecommendation,
  buildCouncilSeats,
  buildForgeReturnUrl,
  createCouncilModel,
  toggleAdvisor,
} from './councilModel.js';

const official = Array.from({ length: 12 }, (_, index) => ({
  id: index === 0 ? 'jiankang' : (index === 1 ? 'xinhe' : `official_${index + 1}`),
  source: 'official',
  name: `智囊${index + 1}`,
  perspective: index === 0 ? 'health' : (index === 1 ? 'emotional' : 'strategic'),
}));

test('catalog keeps all official advisors while recommendation is a subset and selection starts empty', () => {
  const model = createCouncilModel({
    official,
    owned: [{ id: 'owned_1', source: 'owned', name: '我的智囊' }],
    market: [],
    recommendedIds: ['jiankang', 'xinhe'],
  });

  assert.equal(model.official.length, 12);
  assert.deepEqual(model.recommended.map((advisor) => advisor.id), ['jiankang', 'xinhe']);
  assert.deepEqual(model.selectedIds, []);
  assert.equal(model.catalogById.get('owned_1').source, 'owned');
});

test('accepting recommendations and manual toggles are explicit separate actions', () => {
  const initial = createCouncilModel({ official, recommendedIds: ['jiankang', 'xinhe'] });
  const accepted = acceptRecommendation(initial);
  const changed = toggleAdvisor(accepted, 'xinhe');

  assert.deepEqual(accepted.selectedIds, ['jiankang', 'xinhe']);
  assert.deepEqual(changed.selectedIds, ['jiankang']);
  assert.equal(changed.selectionSource, 'manual');
});

test('council seats distinguish recommended advisors from selected advisors', () => {
  const model = createCouncilModel({ official, recommendedIds: ['jiankang', 'xinhe'] });
  const recommendations = buildCouncilSeats({ recommendation: model.recommended, selection: [], catalog: model });
  const selected = buildCouncilSeats({ recommendation: model.recommended, selection: ['xinhe'], catalog: model });

  assert.equal(recommendations[0].state, 'recommended');
  assert.deepEqual(selected.map((seat) => [seat.advisorId, seat.state]), [['xinhe', 'selected']]);
});

test('forge return keeps session, target seat and newly forged advisor', () => {
  assert.equal(
    buildForgeReturnUrl({ sessionId: 'sess_1', seatId: 'health', advisorId: 'custom_9' }),
    '/sandbox?resume=sess_1&seat=health&advisor=custom_9',
  );
});
