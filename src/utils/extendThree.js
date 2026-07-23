import * as THREE from 'three';
import { LineGeometry, Line2, LineMaterial } from 'three-stdlib';
import { extend } from '@react-three/fiber';

export const ExtendedTHREE = {
  ...THREE,
  LineGeometry,
  Line2,
  LineMaterial,
};

let _extended = false;

export function extendTHREE() {
  if (_extended) return;
  _extended = true;
  try {
    extend({ LineGeometry, Line2, LineMaterial });
  } catch (e) {
    console.warn('[extendTHREE] 扩展失败:', e.message);
  }
}

export { THREE };
