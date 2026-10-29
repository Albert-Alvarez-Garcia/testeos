/* Pie de página común: enlaces a Privacy Policy y Terms of Service en todas las páginas. */
(function () {
    if (document.getElementById('cb-legal-footer')) return;
    // Icono de pestaña (evita el 404 de /favicon.ico en la consola)
    if (!document.querySelector('link[rel~="icon"]')) {
        const ic = document.createElement('link');
        ic.rel = 'icon';
        ic.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🃏</text></svg>";
        document.head.appendChild(ic);
    }
    const style = document.createElement('style');
    style.textContent = `
      #cb-legal-footer{width:100%;padding:14px 16px;text-align:center;font-size:12px;
        color:var(--text-muted,#9ca3af);border-top:1px solid rgb(var(--c-gold-dark,120 100 60)/.35);
        background:rgb(var(--c-bg-app,10 10 15)/.6);position:relative;z-index:5}
      #cb-legal-footer a{color:rgb(var(--c-accent,200 170 90));text-decoration:underline;margin:0 8px}
      #cb-legal-footer a:hover{filter:brightness(1.2)}`;
    document.head.appendChild(style);
    const f = document.createElement('footer');
    f.id = 'cb-legal-footer';
    const mk = (href, text) => { const a = document.createElement('a'); a.href = href; a.textContent = text; return a; };
    f.append('Card Binder Pro · ', mk('/privacy.html', 'Privacy Policy / Privacidad'), '·', mk('/terms.html', 'Terms of Service / Términos'));
    document.body.appendChild(f);
})();
