import test from 'node:test';
import assert from 'node:assert/strict';

import * as layoutState from './layoutState.js';

const { initialCompanionOpen, isPresentationPhase, sandboxLayoutClass } = layoutState;

test('companion starts folded so it never competes with the work area', () => {
  assert.equal(initialCompanionOpen(), false);
});

test('decision phases reserve one dock while keeping the 3D stage visible', () => {
  assert.equal(sandboxLayoutClass('summary', true), 'decision-artifact-is-open');
  assert.equal(sandboxLayoutClass('final', false), 'decision-artifact-is-open');
  assert.equal(sandboxLayoutClass('final', false, false), '');
});

test('conversation phases only reserve the companion dock while it is open', () => {
  assert.equal(sandboxLayoutClass('clarify_loop', true), 'companion-is-open');
  assert.equal(sandboxLayoutClass('agent_debate', false), '');
});

test('case review, council selection, and final dossier use presentation mode', () => {
  assert.equal(isPresentationPhase('case_file_confirm'), true);
  assert.equal(isPresentationPhase('agent_select'), true);
  assert.equal(isPresentationPhase('summary'), true);
  assert.equal(isPresentationPhase('final'), true);
  assert.equal(isPresentationPhase('agent_debate'), false);
});

test('one main surface always mutes arena labels and traces behind it', () => {
  assert.equal(typeof layoutState.shouldMuteArena, 'function');
  assert.equal(layoutState.shouldMuteArena({ phase: 'agent_debate', companionOpen: true, showHistoryPanel: false }), true);
  assert.equal(layoutState.shouldMuteArena({ phase: 'agent_debate', companionOpen: false, showHistoryPanel: true }), true);
  assert.equal(layoutState.shouldMuteArena({ phase: 'summary', companionOpen: false, showHistoryPanel: false }), true);
  assert.equal(layoutState.shouldMuteArena({ phase: 'agent_debate', companionOpen: false, showHistoryPanel: false }), false);
});

test('history and the council workbench are mutually exclusive surfaces', () => {
  assert.equal(layoutState.shouldShowCompanion({ phase: 'agent_debate', companionOpen: true, showHistoryPanel: true }), false);
  assert.equal(layoutState.shouldShowCompanion({ phase: 'agent_debate', companionOpen: true, showHistoryPanel: false }), true);
  assert.equal(layoutState.shouldShowCompanion({ phase: 'summary', companionOpen: true, showHistoryPanel: false }), false);
});

test('sandbox uses its own companion navigation instead of the global floating compass', () => {
  assert.equal(layoutState.shouldShowGlobalCompass('/sandbox'), false);
  assert.equal(layoutState.shouldShowGlobalCompass('/cards'), true);
});
