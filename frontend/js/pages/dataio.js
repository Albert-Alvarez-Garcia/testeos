/* Exportar / importar colección en report.html. Todo el contenido se pinta con textContent. */
(function () {
    const API = '/api/data';
    const MAX_BYTES = 2 * 1024 * 1024;
    let pending = null; // { format, content }

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    async function call(path, opts) {
        const res = await fetch(API + path, { credentials: 'same-origin', ...(opts || {}) });
        if (res.status === 401) { window.location.href = 'login.html'; throw new Error('Sesión caducada'); }
        return res;
    }

    async function errMsg(res) {
        try { const j = await res.json(); return typeof j.detail === 'string' ? j.detail : 'Datos no válidos'; }
        catch (e) { return 'Error ' + res.status; }
    }

    async function download(path, filename) {
        try {
            const res = await call(path);
            if (!res.ok) throw new Error(await errMsg(res));
            const url = URL.createObjectURL(await res.blob());
            const a = el('a'); a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (e) { alert('No se pudo descargar: ' + e.message); }
    }

    // ------------------------- Diálogo de importación -------------------------
    const dlg = el('dialog', 'fantasy-panel p-0 max-w-2xl w-full border-2 border-[rgb(var(--c-gold))] rounded-2xl backdrop:bg-black/80');
    const body = el('div', 'p-5 flex flex-col gap-4 text-sm text-[rgb(var(--c-amber-200))]');
    dlg.appendChild(body);

    function btn(text, onClick, primary) {
        const b = el('button', 'btn-fantasy text-xs py-2 px-3', text);
        b.type = 'button';
        b.addEventListener('click', onClick);
        if (primary === false) b.className += ' opacity-80';
        return b;
    }

    function closeBtn() { return btn('Cerrar', () => dlg.close(), false); }

    function showStart(message, isError) {
        pending = null;
        const input = el('input'); input.type = 'file'; input.accept = '.json,.csv,application/json,text/csv';
        input.setAttribute('aria-label', 'Archivo a importar');
        input.addEventListener('change', onFile);
        input.style.display = 'none';
        const pick = btn('📁 Elegir archivo (.csv o .json)', () => input.click());
        const parts = [
            el('h2', 'font-magic text-lg text-[rgb(var(--c-amber-300))]', 'Importar cartas'),
            el('p', '', 'Sube un archivo CSV o JSON (máx. 2 MB). Antes de guardar verás un resumen y los errores. Si hay algún error no se importa nada.'),
            btn('Descargar plantilla CSV', () => download('/template', 'plantilla-importacion.csv'), false),
            pick,
            input,
        ];
        if (message) parts.push(el('p', isError ? 'text-red-400' : '', message));
        const row = el('div', 'flex justify-end gap-2'); row.appendChild(closeBtn());
        parts.push(row);
        body.replaceChildren(...parts);
    }

    function onFile(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > MAX_BYTES) return showStart('El archivo supera los 2 MB.', true);
        const name = file.name.toLowerCase();
        const format = name.endsWith('.json') ? 'json' : name.endsWith('.csv') ? 'csv' : null;
        if (!format) return showStart('Solo se admiten archivos .csv o .json.', true);
        const reader = new FileReader();
        reader.onload = () => preview({ format, content: String(reader.result) });
        reader.onerror = () => showStart('No se pudo leer el archivo.', true);
        reader.readAsText(file);
    }

    async function send(payload, dryRun) {
        return call('/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, dry_run: dryRun }),
        });
    }

    async function preview(payload) {
        body.replaceChildren(el('p', '', 'Validando archivo...'));
        try {
            const res = await send(payload, true);
            if (!res.ok) return showStart(await errMsg(res), true);
            const s = await res.json();
            pending = payload;
            const parts = [el('h2', 'font-magic text-lg text-[rgb(var(--c-amber-300))]', 'Resumen de la importación')];
            parts.push(el('p', '', `${s.rows} filas leídas · ${s.valid_rows} válidas · ${s.copies} copias a añadir`));
            if (s.containers.length) {
                const ul = el('ul', 'list-disc pl-5');
                s.containers.forEach((c) => ul.appendChild(el('li', '', `${c.name}: +${c.to_add} (huecos libres: ${c.free})`)));
                parts.push(ul);
            }
            if (s.error_count) {
                parts.push(el('p', 'text-red-400 font-semibold', `${s.error_count} error(es). Corrige el archivo y vuelve a subirlo:`));
                const ul = el('ul', 'list-disc pl-5 max-h-48 overflow-y-auto text-red-300');
                s.errors.forEach((er) => ul.appendChild(el('li', '', (er.row ? `Fila ${er.row}: ` : '') + er.message)));
                parts.push(ul);
            }
            const row = el('div', 'flex justify-end gap-2');
            row.appendChild(btn('Elegir otro archivo', () => showStart(), false));
            if (!s.error_count) row.appendChild(btn('Confirmar importación', confirmImport));
            row.appendChild(closeBtn());
            parts.push(row);
            body.replaceChildren(...parts);
        } catch (e) { showStart(e.message, true); }
    }

    async function confirmImport() {
        if (!pending) return;
        body.replaceChildren(el('p', '', 'Importando...'));
        try {
            const res = await send(pending, false);
            if (!res.ok) return showStart(await errMsg(res), true);
            const s = await res.json();
            const ok = el('div', 'flex flex-col gap-3');
            ok.append(el('p', 'text-emerald-400 font-semibold', `Importadas ${s.imported} copias.`),
                      btn('Ver colección actualizada', () => window.location.reload()));
            body.replaceChildren(ok);
        } catch (e) { showStart(e.message, true); }
    }

    // ------------------------- Botones en la página -------------------------
    const bar = el('div', 'flex flex-wrap items-center gap-2');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Exportar e importar colección');
    const label = el('span', 'text-xs text-[rgb(var(--c-amber-200)/0.6)] font-semibold mr-1', 'Datos:');
    bar.append(
        label,
        btn('Exportar JSON', () => download('/export?format=json', 'coleccion.json')),
        btn('Exportar CSV', () => download('/export?format=csv', 'coleccion.csv')),
        btn('Importar', () => { showStart(); dlg.showModal(); })
    );
    const anchor = document.getElementById('chips');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor);
    document.body.appendChild(dlg);
})();
