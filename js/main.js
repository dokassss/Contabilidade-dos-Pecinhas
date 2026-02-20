/* ════════════════════
   INIT
════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Set home as active page and nav item
  document.getElementById('ni-home').classList.add('active');
  // Apply default company type (EPP)
  applyDefaultType();
  // Build all lists
  buildNFList();
  buildExtrato();
  buildPagar();
  buildReceber();
  buildTaxList();
  buildCalendar();
  buildPLHist();
  // Animate charts after short delay
  setTimeout(() => {
    buildHomeChart();
    document.getElementById('sBar').style.width = '35.4%';
  }, 200);
});
