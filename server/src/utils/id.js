import { v4 as uuidv4 } from 'uuid';

/**
 * 生成匿名用户 ID（uuid v4 简写，取前 8 位）
 * @returns {string} 8 位短 ID
 */
export function generateAnonymousId() {
  return uuidv4().replace(/-/g, '').slice(0, 8);
}

/**
 * 生成完整 uuid v4
 * @returns {string}
 */
export function generateUUID() {
  return uuidv4();
}

export default generateAnonymousId;
