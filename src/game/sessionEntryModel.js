export function sessionEntryAction({ kiosk = false, hasActiveSession = false } = {}) {
  if (kiosk) {
    return {
      label: '下一位 · 开新局',
      description: '清除此设备上的本位访客内容',
      destructive: true,
      mode: 'kiosk-handoff',
    };
  }

  return {
    label: '新开推演',
    description: hasActiveSession ? '当前进度会保留为未完成推演' : '建立一份新的决策案卷',
    destructive: false,
    mode: 'new-deliberation',
  };
}

export default sessionEntryAction;
