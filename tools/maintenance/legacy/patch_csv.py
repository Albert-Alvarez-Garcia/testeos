#!/usr/bin/env python3
"""Añade 'Exportar CSV' a Mi Colección (junto al de JSON). Desde ~/testeo:
   python3 patch_csv.py   |   python3 patch_csv.py --undo"""
import os, shutil, sys
F = 'frontend/js/pages/coleccion.js'
if '--undo' in sys.argv:
    if os.path.exists(F + '.cbak'): shutil.copy(F + '.cbak', F); print('restaurado', F)
    sys.exit()
s = open(F).read()
if 'exportCsv' in s: sys.exit('Ya aplicado.')
A1 = '    async function exportJson() {'
A2 = "        $('exportBtn').addEventListener('click', exportJson);"
for a in (A1, A2):
    if a not in s: sys.exit(f'AVISO: ancla no encontrada: {a.strip()}')
shutil.copy(F, F + '.cbak')
FUNC = r'''    // Exportar CSV (se genera en el navegador a partir de la exportación JSON)
    function csvCell(v) {
        if (v === null || v === undefined) return '';
        let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;   // evita inyección de fórmulas en hojas de cálculo
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function flattenRow(o, prefix, out) {
        for (const [k, v] of Object.entries(o)) {
            const key = prefix ? prefix + '.' + k : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) flattenRow(v, key, out);
            else out[key] = Array.isArray(v) ? v.join(' | ') : v;
        }
        return out;
    }

    async function exportCsv() {
        const btn = $('exportCsvBtn');
        btn.disabled = true;
        try {
            const { res } = await api('/collection/export', { raw: true });
            const data = await res.json();
            const rows = (data.copies || []).map((c) => flattenRow(c, '', {}));
            if (!rows.length) throw new Error('No hay cartas que exportar');
            const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
            const lines = [cols.map(csvCell).join(',')].concat(rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')));
            download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `coleccion-${today()}.csv`);
            toast('Colección exportada en CSV.');
        } catch (e) {
            toast(`No se pudo exportar: ${e.message}`, 'error');
        } finally {
            btn.disabled = false;
        }
    }

'''
s = s.replace(A1, FUNC + A1, 1)
WIRE = A2 + '''
        const csvBtn = $('exportBtn').cloneNode(false);
        csvBtn.id = 'exportCsvBtn';
        csvBtn.textContent = 'Exportar CSV';
        $('exportBtn').insertAdjacentElement('afterend', csvBtn);
        csvBtn.addEventListener('click', exportCsv);'''
s = s.replace(A2, WIRE, 1)
open(F, 'w').write(s)
print('ok. Aplica con: make restart')
