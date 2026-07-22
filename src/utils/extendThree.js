import * as THREE from 'three';
import { LineGeometry, Line2, LineMaterial } from 'three-stdlib';

export const ExtendedTHREE = {
  ...THREE,
  LineGeometry,
  Line2,
  LineMaterial,
};

export function extendTHREE() {}

export { THREE };
