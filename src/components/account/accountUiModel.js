export function isProfileModalControlled(showModal) {
  return showModal !== undefined;
}

export function getAccountEntry(status) {
  if (status === 'loading') {
    return {
      label: '账号加载中',
      disabled: true,
      intent: 'none',
    };
  }

  return {
    label: status === 'registered' ? '我的账号' : '登录 / 注册',
    disabled: false,
    intent: 'account',
  };
}

