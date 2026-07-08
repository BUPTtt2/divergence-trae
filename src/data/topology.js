/**
 * Decision tree topology (positions + parent-child)
 * Used for SVG layout rendering and path traversal
 */

export const TOPOLOGY = {
  root: {
    x: 0.5,
    y: 0.08,
    children: ['fog_salary', 'fog_team', 'fog_growth'],
  },
  fog_salary: {
    x: 0.17,
    y: 0.25,
    children: ['crossroad_opt', 'crossroad_pess'],
    parent: 'root',
  },
  fog_team: {
    x: 0.5,
    y: 0.25,
    children: ['crossroad_opt', 'crossroad_pess'],
    parent: 'root',
  },
  fog_growth: {
    x: 0.83,
    y: 0.25,
    children: ['crossroad_opt', 'crossroad_pess'],
    parent: 'root',
  },
  crossroad_opt: {
    x: 0.35,
    y: 0.45,
    children: ['deep_accept', 'deep_reject'],
    parent: 'dynamic',
  },
  crossroad_pess: {
    x: 0.65,
    y: 0.45,
    children: ['deep_accept', 'deep_reject'],
    parent: 'dynamic',
  },
  deep_accept: {
    x: 0.35,
    y: 0.62,
    children: ['fate_accept'],
    parent: 'dynamic',
  },
  deep_reject: {
    x: 0.65,
    y: 0.62,
    children: ['fate_reject'],
    parent: 'dynamic',
  },
  fate_accept: {
    x: 0.35,
    y: 0.8,
    children: [],
    parent: 'deep_accept',
  },
  fate_reject: {
    x: 0.65,
    y: 0.8,
    children: [],
    parent: 'deep_reject',
  },
};
