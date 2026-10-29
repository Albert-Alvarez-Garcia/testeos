#!/usr/bin/env python3
"""Mueve credenciales hardcodeadas de docker-compose.yml a .env (valores intactos).
Uso (desde ~/testeo):
  python3 env_extract.py            # dry-run: solo muestra
  python3 env_extract.py --apply    # aplica (crea docker-compose.yml.bak)
  python3 env_extract.py --undo     # restaura el compose desde .bak
"""
import re, sys, shutil, os
COMPOSE = next((p for p in ('docker-compose.yml', 'docker/docker-compose.yml', 'compose.yml') if os.path.exists(p)), None)
if not COMPOSE:
    sys.exit('No encuentro docker-compose.yml')
BAK = COMPOSE + '.bak'
if '--undo' in sys.argv:
    shutil.copy(BAK, COMPOSE); print('Restaurado', COMPOSE); sys.exit()
APPLY = '--apply' in sys.argv
KEY = re.compile(r'(PASSWORD|SECRET|API_KEY|^POSTGRES_|DATABASE_URL|CLIENT_)')
# "  KEY: value"  o  "  - KEY=value"
pat_map = re.compile(r'^(\s*)([A-Z][A-Z0-9_]*):\s*(.+?)\s*$')
pat_list = re.compile(r'^(\s*-\s*)([A-Z][A-Z0-9_]*)=(.+?)\s*$')

env_path = '.env'
env = open(env_path).read() if os.path.exists(env_path) else ''
have = set(re.findall(r'^([A-Z][A-Z0-9_]*)=', env, re.M))
out, moved = [], {}
for line in open(COMPOSE).read().splitlines():
    m, kind = pat_map.match(line), 'map'
    if not m:
        m, kind = pat_list.match(line), 'list'
    if m and KEY.search(m.group(2)) and '${' not in m.group(3):
        k, v = m.group(2), m.group(3).strip()
        if kind == 'map' and v.startswith('#'):
            out.append(line); continue
        v = v.strip('"\'')
        moved[k] = v
        line = f'{m.group(1)}{k}: ${{{k}}}' if kind == 'map' else f'{m.group(1)}{k}=${{{k}}}'
    out.append(line)

if not moved:
    sys.exit('Nada que mover (ya usa ${VARIABLES} o no hay claves).')
for k, v in moved.items():
    print(f'{k}  ->  .env' + ('  (ya existía, se conserva el de .env)' if k in have else ''))
if not APPLY:
    print('\nDry-run. Ejecuta con --apply para aplicar.'); sys.exit()

shutil.copy(COMPOSE, BAK)
open(COMPOSE, 'w').write('\n'.join(out) + '\n')
add = ''.join(f'{k}={v}\n' for k, v in moved.items() if k not in have)
if add:
    with open(env_path, 'a') as f:
        f.write(('' if env.endswith('\n') or not env else '\n') + add)
allkeys = sorted(set(re.findall(r'^([A-Z][A-Z0-9_]*)=', open(env_path).read(), re.M)))
with open('.env.example', 'w') as f:
    f.write(''.join(f'{k}=\n' for k in allkeys))
print('\nHecho. .env actualizado, .env.example creado. Aplica con: make restart')
