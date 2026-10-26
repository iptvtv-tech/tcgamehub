// Applies the equipped arcade theme before the page paints (so there's no flash of the
// default colours). tokens.js checks ownership and corrects this once it loads.
(function () {
  try {
    var t = localStorage.getItem('arcade:theme');
    if (t && t !== 'classic' && /^[a-z]+$/.test(t)) document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage unavailable */ }
})();
