const PROFILE_ERROR_MESSAGES = {
  INVALID_AVATAR: '头像格式或大小不符合要求',
  INVALID_NICKNAME: '昵称不能为空且不能超过 16 个字',
  INVALID_BIO: '签名不能超过 80 个字',
  INVALID_COLOR: '主色格式不正确',
  AUTH_REQUIRED: '登录状态已失效，请重新登录',
};

export async function requestAccountProfileUpdate({
  apiBaseUrl,
  token,
  profile,
  fetchImpl = fetch,
}) {
  if (!token) throw new Error('登录状态已失效，请重新登录');

  const response = await fetchImpl(`${apiBaseUrl}/api/auth/me`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(profile),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(PROFILE_ERROR_MESSAGES[data.error] || data.message || '资料同步失败，请稍后重试');
  }
  if (!data.user) throw new Error('资料同步响应不完整');
  return data.user;
}

