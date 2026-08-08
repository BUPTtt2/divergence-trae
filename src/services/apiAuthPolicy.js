export function shouldAttemptTokenRefresh({ refreshToken }) {
  return typeof refreshToken === 'string' && refreshToken.length > 0;
}

export default { shouldAttemptTokenRefresh };
