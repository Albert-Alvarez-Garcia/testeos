/* theme.js · Activa el tema azulado de 42 si la sesión guardada es de un usuario de 42.
   Incluir en el <head> de cada página:  <script src="theme.js"></script>  (después de los enlaces a CSS). */
(function () {
    var cssHref = new URL('css/theme-42.css', document.baseURI).href;

    function enable() {
        if (document.documentElement.classList.contains('theme-42')) return;
        document.documentElement.classList.add('theme-42');
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssHref;
        document.head.appendChild(link);
    }
    window.cbEnableTheme42 = enable;   // por si una página confirma con el servidor que es de 42

    try {
        var u = JSON.parse(localStorage.getItem('cardbinder_user') || 'null');
        if (u && (u.auth_type === '42' || /42/.test(String(u.badge || '')))) enable();
    } catch (e) { /* sin tema: la página se ve como siempre */ }
})();
