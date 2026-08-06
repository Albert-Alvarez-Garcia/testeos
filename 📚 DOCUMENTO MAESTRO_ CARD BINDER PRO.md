# **📚 DOCUMENTO MAESTRO: CARD BINDER PRO**

**Estado del Proyecto:** Refactorizado y Desacoplado (Frontend Estático \+ API FastAPI \+ PostgreSQL en Docker)

**Rol del Autor / Nodo Principal:** Berto

## **📑 ÍNDICE DE CONTENIDOS**

1. [Introducción y Visión Global](https://www.google.com/search?q=%231-introducci%C3%B3n-y-visi%C3%B3n-global)  
2. [Arquitectura de Base de Datos (PostgreSQL)](https://www.google.com/search?q=%232-arquitectura-de-base-de-datos-postgresql)  
3. [Despliegue e Infraestructura (Docker & Makefile)](https://www.google.com/search?q=%233-despliegue-e-infraestructura-docker--makefile)  
4. [Especificación y Lógica Interna de la API (Backend FastAPI)](https://www.google.com/search?q=%234-especificaci%C3%B3n-y-l%C3%B3gica-interna-de-la-api-backend-fastapi)  
5. [Guía de Integración y Frontend (JS Estático)](https://www.google.com/search?q=%235-gu%C3%ADa-de-integraci%C3%B3n-y-frontend-js-est%C3%A1tico)  
6. [Contrato de API y Protocolo de Cambios](https://www.google.com/search?q=%236-contrato-de-api-y-protocolo-de-cambios)

## **1\. Introducción y Visión Global**

**Audiencia:** Todo el equipo (General)

Card Binder Pro es una aplicación para gestión e inventariado de cartas. El sistema cuenta con una arquitectura desacoplada en tres capas contenerizadas:

* **Frontend:** Estático, servido mediante Nginx, encargado del visor, interfaz de usuario y gestión visual de contenedores y slots.  
* **Backend:** FastAPI, encargado de exponer los endpoints de negocio, gestionar la lógica de inventario y la persistencia.  
* **Base de Datos:** PostgreSQL, relacional, con soporte para extensiones UUID y bulk data de Scryfall.

## **2\. Arquitectura de Base de Datos (PostgreSQL)**

**Audiencia:** Backend, Administradores de BBDD y General

Se utiliza un esquema relacional normalizado inicializado automáticamente por Docker:

* `containers`: Almacena ubicaciones físicas (`binder`, `box`, `deck`) con soporte de slots por página y límites de capacidad.  
* `cards`: Datos maestros de las cartas con restricciones de unicidad sobre los IDs de Scryfall.  
* `printings`: Versiones específicas de cada carta (sets, códigos, rarezas, acabados foil/nonfoil y URIs de imágenes oficiales).  
* `container_slots`: Mapeo de celdas individuales dentro de los contenedores físicos.  
* `card_copies`: Vinculación transaccional (dónde vive físicamente la copia, en qué slot, estado de conservación y acabados).

## **3\. Despliegue e Infraestructura (Docker & Makefile)**

**Audiencia:** DevOps, General

Toda la infraestructura se orquesta mediante `docker-compose`. Para agilizar el desarrollo diario, se dispone de un Makefile automatizado con los comandos principales:

* `make up`: Levanta todo el entorno (Base de datos PostgreSQL \+ API FastAPI \+ Frontend Nginx) en segundo plano.  
* `make down`: Detiene y apaga limpiamente los contenedores.  
* `make logs`: Muestra el registro de eventos en tiempo real de todos los servicios.  
* `make import`: Ejecuta scripts de importación de datos masivos.

## **4\. Especificación y Lógica Interna de la API (Backend FastAPI)**

**Audiencia:** Desarrolladores Backend / Nodo Principal

El backend está desarrollado con FastAPI, estructurado modularmente con routers independientes y un sistema robusto de conexión mediante diccionarios (`RealDictCursor` de `psycopg2`).

**Endpoints Principales:**

* `GET /api/cards/types-taxonomy`: Devuelve la estructura de filtrado estática leída desde el JSON de taxonomías.  
* `GET /api/containers/`: Lista todos los contenedores físicos disponibles en el sistema.  
* `GET /api/cards/filter?name=...&type_line=...`: Endpoint de búsqueda avanzada.  
* `POST /api/containers/items`: Registro transaccional de una copia física en un contenedor o slot.

💡 **Lógica Destacada del Backend (Patrón de Auto-Sanación / Self-Healing):**

El buscador del backend implementa una estrategia híbrida inteligente (`services.py`):

1. **Búsqueda Local:** Primero consulta en la base de datos local de PostgreSQL utilizando patrones flexibles (`ILIKE`) para maximizar la velocidad.  
2. **Fallback Externo Automático:** Si no encuentra resultados locales, consulta de forma transparente la API pública oficial de Scryfall (`unique=prints`).  
3. **Autoguardado al Vuelo:** Las cartas y sus impresiones encontradas en Scryfall se insertan automáticamente en la BBDD local en el mismo momento de la petición (`INSERT ... ON CONFLICT DO UPDATE / DO NOTHING`), alimentando el sistema de forma orgánica sin requerir volúmenes estáticos masivos previos.

## **5\. Guía de Integración y Frontend (JS Estático)**

**Audiencia:** Desarrolladores Frontend

Centralizado en los scripts estáticos de la interfaz (`visor-containers.html`, `containers.html`, etc.).

* **Configuración del Endpoint Base:** Debe apuntar obligatoriamente a la variable global de entorno o constante de conexión:  
* JavaScript

const API\_BASE\_URL \= 'http://localhost:8000/api';

*   
*   
* **Navegación Parametrizada por URL:**  
  * El visor soporta la lectura directa de parámetros GET en la URL, específicamente `container_id`.  
  * *Comportamiento:* Al cargar `visor-containers.html?container_id=UUID`, el script intercepta el parámetro, verifica su existencia en el listado asíncrono de contenedores, auto-selecciona el valor en el desplegable y dispara programáticamente el evento `change` (`containerSelector.dispatchEvent(new Event('change'))`) para renderizar los slots de forma fluida y transparente para el usuario.  
* **Consistencia de Estilos UI (Contenedores y Formularios):**  
  * Los elementos de entrada de texto y selectores (`<input>`, `<select>`) deben incorporar estrictamente la propiedad `box-sizing: border-box;` junto con un ancho del `100%` para evitar desbordamientos visuales en los paneles laterales de gestión.  
* Se requiere consistencia estricta en el manejo de respuestas JSON y persistencia local mediante `localStorage` para recordar preferencias del usuario.

## **6\. Contrato de API y Protocolo de Cambios**

**Audiencia:** TODO EL EQUIPO (Crítico)

Este sistema se rige bajo un **Contrato de API**. Esto significa que el Backend (API) y el Frontend (UI) se comunican mediante un contrato de datos estricto en formato JSON.

**Reglas de Oro:**

* **El Contrato es Sagrado:** La estructura de los objetos JSON (como el payload de inserción de inventario o las respuestas de filtrado) no debe ser modificada unilateralmente por el Frontend.  
* **Independencia de Diseño:** El Frontend tiene total libertad para cambiar CSS, HTML, clases, colores, maquetación o animaciones. El Backend es "ciego" a estos cambios visuales y no se verá afectado siempre que los datos enviados y recibidos sigan la estructura acordada.  
* **Protocolo de Modificación:** Si el equipo de Frontend necesita enviar datos nuevos o alterar la estructura existente:  
  * **Paso 1:** Notificar al Nodo (Berto) o al equipo de Backend.  
  * **Paso 2:** Evaluar el impacto en el esquema de Base de Datos y en la lógica de los servicios FastAPI.  
  * **Paso 3:** Actualizar este documento (el contrato maestro).  
  * **Paso 4:** Implementar el cambio de forma coordinada en ambos extremos.

⚠️ *Cualquier alteración no notificada en el contrato romperá la comunicación entre el Front y el Back, invalidando la sincronización de la aplicación.*

