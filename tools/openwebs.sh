#!/bin/bash

# Dirección URL objetivo
URL="http://localhost:8080"

# Cantidad de ventanas a abrir
CANTIDAD=6

echo "Abriendo $CANTIDAD ventanas de incógnito en $URL..."

# Bucle para abrir las ventanas
for ((i=1; i<=CANTIDAD; i++)); do
    # 'google-chrome' o 'chromium-browser' según tu distribución
    google-chrome --incognito "$URL" &
    
    # Pequeña pausa opcional (0.2 segundos) para no saturar el gestor de ventanas de golpe
    sleep 0.2
done

echo "¡Listo! Ventanas abiertas."