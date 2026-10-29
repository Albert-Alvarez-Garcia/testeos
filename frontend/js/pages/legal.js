/* Selector de idioma EN/ES de las páginas legales. */
(function () {
    const KEY = 'cb_legal_lang';
    let lang = 'en';
    try { lang = localStorage.getItem(KEY) || (/^es/i.test(navigator.language) ? 'es' : 'en'); } catch (e) {}
    function apply(l) {
        document.documentElement.lang = l;
        document.querySelectorAll('[data-lang]').forEach((el) => { el.hidden = el.dataset.lang !== l; });
        document.querySelectorAll('[data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === l)));
        try { localStorage.setItem(KEY, l); } catch (e) {}
    }
    document.querySelectorAll('[data-set-lang]').forEach((b) => b.addEventListener('click', () => apply(b.dataset.setLang)));
    apply(lang);
})();
