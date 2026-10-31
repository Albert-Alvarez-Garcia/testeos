RESET        = \033[0m
PINK         = \033[1;35m
BLUE         = \033[1;36m
GREEN        = \033[1;32m
YELLOW       = \033[1;33m
VIOLET       = \033[38;2;185;39;233m

.PHONY: help preflight up seed emergency emergency-pack status test down restart logs download import clean logo prune

EMERGENCY_ZIP ?= /tmp/card-binder-emergency.zip

# Muestra el logo y la ayuda por defecto al ejecutar solo 'make'
help: logo
	@echo ""
	@echo "$(BLUE)📋 CARD BINDER PRO - HELP & COMMANDS$(RESET)"
	@echo "$(YELLOW)======================================$(RESET)"
	@echo "  $(GREEN)make up      $(RESET)Prepara requisitos locales y levanta la aplicación"
	@echo "  $(GREEN)make down    $(RESET)Detiene y apaga todos los contenedores limpiamente"
	@echo "  $(GREEN)make restart $(RESET)Reconstruye y reinicia los contenedores (incluye React)"
	@echo "  $(GREEN)make logs    $(RESET)Muestra los logs en tiempo real (todos los servicios)"
	@echo "  $(GREEN)make download$(RESET)Descarga el Bulk Data de Scryfall a la carpeta local data/"
	@echo "  $(GREEN)make preflight$(RESET)Prepara .env/certificado y valida requisitos locales"
	@echo "  $(GREEN)make status $(RESET)Muestra los contenedores y su estado"
	@echo "  $(GREEN)make test   $(RESET)Comprueba HTTPS, API y PostgreSQL; opcional: BASE_URL=https://IP:8443"
	@echo "  $(GREEN)make import  $(RESET)Ejecuta el script de Python para importar los datos a Postgres"
	@echo "  $(GREEN)make seed    $(RESET)Prepara la base de datos con el catálogo de cartas"
	@echo "  $(GREEN)make emergency $(RESET)Arranca con el catálogo de emergencia del ZIP externo"
	@echo "  $(GREEN)make emergency-pack $(RESET)Crea el ZIP externo desde el bulk local (requiere Internet para imágenes)"
	@echo "  $(GREEN)make clean   $(RESET)$(PINK)ATENCIÓN:$(RESET) Apaga contenedores y borra el volumen de datos"
	@echo "  $(GREEN)make prune   $(RESET)Purga y elimina contenedores en desuso"
	@echo ""

# Imprime el arte ASCII directamente con colores ANSI
logo:
	@echo -e "$(YELLOW)@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@"
	@echo -e "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%@@@@@@@@@@@@@@@@@@@@@@@@@@@@%@@@@@%%%@@%%@@@@@@\033[0m"
	@echo -e "\033[33m@@@@@@@@@#*##*#@@@@@#==++++%@@@%++##%###@@@@@%*+==+#%++@+=+++=+@@#+=-=++==#@@@@@"
	@echo -e "@@@@@@@@+------+@@@%========@@%===------=@@@*-=====--===-====+-**==+++=-===%@@@@"
	@echo -e "@@@@@@@#-=****+=+@@%==*###+=%@%==+******-#@*-=##*+++*#=--=###==+-=#%#+++#+-%@@@@"
	@echo -e "@@@@@@@*=-=#%%%+-#@@%==#%%*-%@@#=-=+#%%#=*@==%%*---=+*-#*=+%#=+==#%*=---*@@@@@@"
	@echo -e "@@@@@@@@%+-#%%%#==@@@#-+%%*-#@@@+-=--*%#=+%-*%#=+%%====@@+=##-+-+%#=+%*-==@@@@@@"
	@echo -e "@@@@@@@@@+=#####*-*@@==####==@@#-=====##==*-*#+-%@@+-=+%@+=#*-+-*#*-#@#--+@@@@@@"
	@echo -e "@@@@@@@@#-+#=+###==#+=*####+-#@+=*===-*#+-+-*#+=@@+=---=#+=#*-+-*#*-#@@#*@@@@@@@"
	@echo -e "@@@@@@@@*-++--+##*---=*+####=+#-++-==-+##==-*#+-%#-==++==+=#*-*-+##=+@@@@@%#@@@@"
	@echo -e "@@@@@@@@==-=++=*##=-+=--+###+-==*=**-==##+--=#*-++==+#+=++=#*-+==##*-=+++=--+@@@"
	@echo -e "@@@@@@@#-++-%%==###*#==+=*##*==+#*#+--=##*===+#*----+*-+%==##====+##*======-+@@@"
	@echo -e "@@@@@@@+=*==@@*-*###*-*%==###=-+##+-+==*+*+--=+#*++=**-#=-+*++-+===+##**+=-=%@@@"
	@echo -e "@@@@@@@==+-#@@%=+###*-%@+=*##*-=====@+=-----#+-==---=+-+=----#@+=--==--=*@@@@@@"
	@echo -e "@@@@@@#-*==@@@@+=###+=@@%-+###==+++@@@**#*+*@@#++*%%=--====*%##@@@%*+=++#@@@*%@@\033[0m"
	@echo -e "\033[35m@@@@@@+=*-*@@@@#-*%%*-#@@+=#%%+=%@@@@@@@@@@@@@@@@@@@@##@%*%@@@@@@@@@@@@@@@@***%@"
	@echo -e "@@@@@%-+*-%@@@@%=+%%#=+@@*-*%%*-#@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%*#*#@"
	@echo -e "@@@@@+-*+=%@@@@@+=#%%*-%@%-*%%#==%@@%%@%##@@@@@@%%@%@@@%%##@@@@@@@#%@@@@@%@%**@@"
	@echo -e "@@@@*-+#+-+@@@@@*=####-*@*-*####==#@%%@#%%@@%%@%@##%#%%%%%%@@%%%%%##%%%%#%@@@@@@"
	@echo -e "@@@+-=##*=-%@@@@#-*##=-#+=+**++**=-%@%@%@#@#@%%%@#@%%%%@%@#@#@%#@#@%@#@%@%@@@@@@"
	@echo -e "@@#-=+=--==%@@@@%-+#=-#@===-----==-#@#@#%#@#@%@@@@@#@@%%%%#@#@%#@%%#@#@#@%@@@@@@"
	@echo -e "@@#---+***%@@@@@@====#@@*-=*#%%#+=+@@%%@%%%@%%@@@%@@%%%@%%%%@%%@%@%@%%%%@@%@@@@@"
	@echo -e "@@@*+%@@@@@@@@@@@*-=#@@@@%%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%@@@@@@@\033[0m"

# Descarga el JSON de Scryfall a la carpeta local data/
download:
	python3 scripts/download_bulk.py
	@echo "✨ Descarga del JSON finalizada."

# Ejecuta el script de importación desde el JSON local
import:
	@test -f data/default-cards.jsonl.gz || { echo "Falta data/default-cards.jsonl.gz; ejecuta make download." >&2; exit 1; }
	docker compose exec -T backend python3 scripts/import_bulk.py
	@echo "✨ Importación a base de datos finalizada."

# Arranque más descarga/importación inicial; seguro repetirlo si el catálogo ya existe.
seed: up
	@if [ ! -f data/default-cards.jsonl.gz ]; then $(MAKE) download; fi
	$(MAKE) import

# Arranque alternativo explícito. El ZIP se mantiene fuera del repositorio.
emergency:
	@test -f "$(EMERGENCY_ZIP)" || { echo "Falta $(EMERGENCY_ZIP); copia ahí card-binder-emergency.zip." >&2; exit 1; }
	python3 tools/install_emergency_catalog.py "$(EMERGENCY_ZIP)"
	$(MAKE) up
	docker compose exec -T -e CARD_DATA_FILE=/app/data/emergency/default-cards.jsonl.gz backend python3 scripts/import_bulk.py
	@echo "Catálogo de emergencia importado; las cartas incluidas usan imágenes locales."

emergency-pack:
	python3 tools/build_emergency_catalog.py "$(EMERGENCY_ZIP)"

# Valida el .env privado y crea/valida el certificado TLS local.
preflight:
	@python3 tools/prepare_local.py
	@docker compose config -q

# Un comando no interactivo para validar, construir y levantar todo el entorno.
up: preflight
	docker compose up --build -d --wait --wait-timeout 120
	@echo "🚀 Entorno desacoplado levantado correctamente (Base de datos + API FastAPI + Frontend Nginx)."

# Estado visible para la evaluación.
status:
	docker compose ps

# Pruebas de humo de solo lectura; requiere haber iniciado los servicios.
test:
	python3 tools/smoke_test.py $(BASE_URL)

# Para y apaga los contenedores
down:
	docker compose down --remove-orphans
	@echo "🛑 Contenedores detenidos."

# Limpieza profunda de contenedores detenidos, redes y caché de Docker sin usar
prune:
	docker system prune -f
	@echo "💀 Se hizo la purga de contenedores."


# Reconstruye y recrea los servicios sin borrar los volúmenes de datos.
restart: preflight
	docker compose up --build -d --wait --wait-timeout 120 --force-recreate
	@echo "🔄 Contenedores reiniciados y aplicación de React compilada."

# Muestra los logs en tiempo real de todos los servicios
logs:
	docker compose logs -f

# Limpia contenedores y borra el volumen de datos
clean:
	docker compose down -v --rmi local
	@echo "⚠️ Contenedores, volúmenes e imágenes del proyecto eliminados."
