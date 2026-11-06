/* Paletas de maná compartidas. La preferencia local se usa hasta sincronizarla con el perfil. */
(function () {
    var cssHref = new URL('/css/theme-42.css', window.location.origin).href;
    var themes = ['white', 'blue', 'black', 'red', 'green', '42'];
    var user = null;
    try { user = JSON.parse(localStorage.getItem('cardbinder_user') || 'null'); } catch (e) { /* sesión corrupta */ }
    var is42 = !!user && (user.auth_type === '42' || /42/.test(String(user.badge || '')));
    var savedTheme = null;
    var themeStorageKey = user && user.username
        ? 'cardbinder_theme:' + encodeURIComponent(String(user.username).toLowerCase())
        : 'cardbinder_theme';
    try {
        savedTheme = localStorage.getItem(themeStorageKey);
        if (!savedTheme) {
            savedTheme = localStorage.getItem('cardbinder_theme');
            if (themes.includes(savedTheme) && (savedTheme !== '42' || is42)) {
                localStorage.setItem(themeStorageKey, savedTheme);
            }
        }
    } catch (e) { /* almacenamiento deshabilitado */ }
    if (savedTheme === '42' && !is42) savedTheme = null;
    // El tema inicial debe coincidir con una opción visible del selector.
    var initialTheme = themes.includes(savedTheme) ? savedTheme : (is42 ? '42' : 'white');

    function setTheme(name, persist) {
        if (!themes.includes(name) || (name === '42' && !is42)) name = is42 ? '42' : 'white';
        document.documentElement.dataset.manaTheme = name;
        document.documentElement.classList.toggle('theme-42', name === '42');
        if (name === '42' && !document.querySelector('link[data-theme-42]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssHref;
            link.dataset.theme42 = 'true';
            document.head.appendChild(link);
        }
        if (persist) {
            try { localStorage.setItem(themeStorageKey, name); } catch (e) { /* preferencia solo de sesión */ }
            if (window.fetch) {
                fetch('/api/profile/preferences', {
                    method: 'PATCH',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ theme: name })
                }).then(function (response) {
                    if (!response.ok) console.warn('No se pudo guardar el tema en el perfil. Se mantiene en este navegador.');
                }).catch(function () {
                    console.warn('No se pudo sincronizar el tema con el perfil. Se mantiene en este navegador.');
                });
            }
        }
        document.dispatchEvent(new CustomEvent('cb:theme', { detail: { theme: name } }));
        return name;
    }

    function enable() {
        // Un tema elegido por el usuario tiene prioridad sobre el valor inicial de la cuenta.
        is42 = true;
        if (!savedTheme) setTheme('42', false);
    }
    window.cbSetManaTheme = function (name) { savedTheme = setTheme(name, true); };
    window.cbApplyManaTheme = function (name) {
        if (!themes.includes(name) || (name === '42' && !is42)) return;
        savedTheme = setTheme(name, false);
    };
    window.cbEnableTheme42 = enable;
    setTheme(initialTheme, false);
})();
