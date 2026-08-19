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

test('the completed destiny card starts folded on a phone so the 3D ceremony is visible', () => {
  assert.equal(typeof layoutState.shouldAutoOpenDecisionArtifact, 'function');
  assert.equal(layoutState.shouldAutoOpenDecisionArtifact({ phase: 'final', viewportWidth: 390 }), false);
  assert.equal(layoutState.shouldAutoOpenDecisionArtifact({ phase: 'final', viewportWidth: 1280 }), true);
  assert.equal(layoutState.shouldAutoOpenDecisionArtifact({ phase: 'committing', viewportWidth: 390 }), true);
  assert.equal(layoutState.shouldAutoOpenDecisionArtifact({ phase: 'agent_debate', viewportWidth: 390 }), false);
});

test('the compact dossier launcher does not call itself a destiny card before the final seal', () => {
  assert.equal(layoutState.decisionArtifactLauncherLabel('summary'), '打开案卷');
  assert.equal(layoutState.decisionArtifactLauncherLabel('path_reveal'), '打开案卷');
  assert.equal(layoutState.decisionArtifactLauncherLabel('final'), '打开命牌');
});

test('a restored final session always renders the revealed face of the 3D destiny card', () => {
  assert.equal(layoutState.shouldRevealDestinyCard({ phase: 'final', fateRevealed: false }), true);
  assert.equal(layoutState.shouldRevealDestinyCard({ phase: 'path_reveal', fateRevealed: false }), false);
  assert.equal(layoutState.shouldRevealDestinyCard({ phase: 'path_reveal', fateRevealed: true }), true);
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
  assert.equal(layoutState.shouldShowCompanion({ phase: 'clarify_loop', companionOpen: false, showHistoryPanel: false }), true);
  assert.equal(layoutState.shouldShowCompanion({ phase: 'summary', companionOpen: true, showHistoryPanel: false }), false);
});

test('a folded companion remains mounted only as its compact launcher', () => {
  assert.equal(layoutState.companionDockOpen(false), false);
  assert.equal(layoutState.companionDockOpen(true), true);
});

test('pending clarification automatically opens the answer workbench', () => {
  assert.equal(typeof layoutState.shouldAutoOpenCompanion, 'function');
  assert.equal(layoutState.shouldAutoOpenCompanion({
    phase: 'clarify_loop',
    awaitingAnswers: [{ question: '你最近一周的精神状态怎样？' }],
    answerPending: false,
  }), true);
  assert.equal(layoutState.shouldAutoOpenCompanion({
    phase: 'clarify_loop',
    awaitingAnswers: [],
    answerPending: false,
  }), false);
  assert.equal(layoutState.shouldAutoOpenCompanion({
    phase: 'clarify_loop',
    awaitingAnswers: [{ question: '正在提交的问题' }],
    answerPending: true,
  }), false);
});

test('the global assistant remains available inside the sandbox for starting a new deliberation', () => {
  assert.equal(layoutState.shouldShowGlobalCompass('/sandbox'), true);
  assert.equal(layoutState.shouldShowGlobalCompass('/cards'), true);
  assert.equal(layoutState.shouldShowGlobalCompass('/'), false);
  assert.equal(layoutState.shouldShowGlobalCompass('/privacy'), false);
  assert.equal(layoutState.shouldShowGlobalCompass('/ops'), false);
});
