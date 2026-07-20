RESET        = \033[0m
PINK         = \033[1;35m
BLUE         = \033[1;36m
GREEN        = \033[1;32m
YELLOW       = \033[1;33m
VIOLET       = \033[38;2;185;39;233m

.PHONY: help up down restart logs download import clean logo

# Muestra el logo y la ayuda por defecto al ejecutar solo 'make'
help: logo
	@echo ""
	@echo "$(BLUE)📋 CARD BINDER PRO - HELP & COMMANDS$(RESET)"
	@echo "$(YELLOW)======================================$(RESET)"
	@echo "  $(GREEN)make up      $(RESET)- Levanta la base de datos y la API en segundo plano"
	@echo "  $(GREEN)make down    $(RESET)- Detiene y apaga todos los contenedores limpiamente"
	@echo "  $(GREEN)make restart $(RESET)- Reinicia los contenedores"
	@echo "  $(GREEN)make logs    $(RESET)- Muestra los logs en tiempo real (API y Base de datos)"
	@echo "  $(GREEN)make download$(RESET)- Descarga el Bulk Data de Scryfall a la carpeta local data/"
	@echo "  $(GREEN)make import  $(RESET)- Ejecuta el script de Python para importar los datos a Postgres"
	@echo "  $(GREEN)make clean   $(RESET)- $(PINK)ATENCIÓN:$(RESET) Apaga contenedores y borra el volumen de datos"
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
	@echo -e "@@@@@@@==+-#@@%=+###*-%@+=*##*-=====@+=-----#+-==---=+-+-+=----#@+=--==--=*@@@@@"
	@echo -e "@@@@@@#-*==@@@@+=###+=@@%-+###==+++@@@**#*+*@@#++*%%=--====*%##@@@%*+=++#@@@*%@@\033[0m"
	@echo -e "\033[35m@@@@@@+=*-*@@@@#-*%%*-#@@+=#%%+=%@@@@@@@@@@@@@@@@@@@@##@%*%@@@@@@@@@@@@@@@@***%@"
	@echo -e "@@@@@%-+*-%@@@@%=+%%#=+@@*-*%%*-#@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%*#*#@"
	@echo -e "@@@@@+-*+=%@@@@@+=#%%*-%@%-*%%#==%@@%%@%##@@@@@@%%@%@@@%%##@@@@@@@#%@@@@@%@%**@@"
	@echo -e "@@@@*-+#+-+@@@@@*=####-*@*-*####==#@%%@#%%@@%%@%@##%#%%%%%%@@%%%%%##%%%%#%@@@@@@"
	@echo -e "@@@+-=##*=-%@@@@#-*##=-#+=+**++**=-%@%@%@#@#@%%%@#@%%%%@%@#@#@%#@#@%@#@#%@%@@@@@"
	@echo -e "@@#-=+=--==%@@@@%-+#=-#@===-----==-#@#@#%#@#@%@@@@@#@@%%%%#@#@%#@%%#@#@#@%@@@@@@"
	@echo -e "@@#---+***%@@@@@@====#@@*-=*#%%#+=+@@%%@%%%@%%@@@%@@%%%@%%%%@%%@%@%@%%%%@@%@@@@@"
	@echo -e "@@@*+%@@@@@@@@@@@*-=#@@@@%%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%@@@@@@@\033[0m"


# Descarga el JSON de Scryfall a la carpeta local data/
download:
	python3 scripts/download_bulk.py
	@echo "✨ Descarga del JSON finalizada."

# Ejecuta el script de importación desde el JSON local
import:
	python3 scripts/import_bulk.py
	@echo "✨ Importación a base de datos finalizada."


# Levanta todos los contenedores en segundo plano (con build automático)
up:
	docker-compose up --build -d
	@echo "🚀 Entorno levantado correctamente (Base de datos + API)."

# Para y apaga los contenedores
down:
	docker-compose down
	@echo "🛑 Contenedores detenidos."

# Reinicia los contenedores
restart:
	docker-compose down && docker-compose up --build -d
	@echo "🔄 Contenedores reiniciados."

# Muestra los logs en tiempo real de todos los servicios
logs:
	docker-compose logs -f

# Limpia contenedores y borra el volumen de datos
clean:
	docker-compose down -v
	@echo "⚠️ Contenedores y volumen de datos eliminados."