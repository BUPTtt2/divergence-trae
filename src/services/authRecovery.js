export async function recoverAccessToken({ refresh, anonymous }) {
  const refreshed = await refresh();
  if (refreshed) return refreshed;
  const result = await anonymous();
  return result?.offline ? null : (result?.accessToken || null);
}
