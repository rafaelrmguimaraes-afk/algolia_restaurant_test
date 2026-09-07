/* Native details gives mobile filters keyboard support without a modal or library.
   Desktop always shows the sidebar; mobile starts with results within easy reach. */
(() => {
  const filters = document.getElementById('mobile-filters');
  const mobile = window.matchMedia('(max-width: 700px)');
  function updateLayout() { filters.open = !mobile.matches; }
  updateLayout();
  mobile.addEventListener('change', updateLayout);
})();
