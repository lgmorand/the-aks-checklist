(() => {
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  try {
    const saved = localStorage.getItem('aks-checklist-theme');
    document.documentElement.dataset.theme = ['light', 'dark'].includes(saved) ? saved : systemDark ? 'dark' : 'light';
  } catch (error) {
    document.documentElement.dataset.theme = systemDark ? 'dark' : 'light';
    console.warn('AKS Checklist: theme preference cannot be read from browser storage.', error);
  }
})();
