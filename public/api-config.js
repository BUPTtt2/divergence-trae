if (typeof window !== 'undefined') {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.__API_BASE__ = '';
  } else {
    window.__API_BASE__ = 'https://api.yanceai.online';
  }
}
