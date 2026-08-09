## **📚 DOCUMENTO MAESTRO: CARD BINDER PRO**  
**Estado del Proyecto:** Refactorizado y Desacoplado (Frontend Estático + API FastAPI + PostgreSQL en Docker)  
**Rol del Autor / Nodo:** Berto  
📑 **ÍNDICE DE CONTENIDOS**  
1. Introducción y Visión Global  
2. Arquitectura de Base de Datos (PostgreSQL)  
3. Despliegue, Infraestructura y Configuración de Entorno (.env & Docker & Makefile)  
4. Especificación y Lógica Interna de la API (Backend FastAPI)  
5. Guía de Integración y Frontend (JS Estático)  
6. Contrato de API y Protocolo de Cambios  
### **1. Introducción y Visión Global**  
**Audiencia:** Todo el equipo (General)  
Card Binder Pro es una aplicación para gestión e inventariado de cartas. El sistema cuenta con una arquitectura desacoplada en tres capas contenerizadas:  
- **Frontend:** Estático, servido mediante Nginx, encargado del visor, interfaz de usuario y gestión visual de contenedores y slots.  
- **Backend:** FastAPI, encargado de exponer los endpoints de negocio, gestionar la lógica de inventario y la persistencia.  
- **Base de Datos:** PostgreSQL, relacional, con soporte para extensiones UUID y bulk data de Scryfall.  
### **2. Arquitectura de Base de Datos (PostgreSQL)**  
**Audiencia:** Backend, Administradores de BBDD y General  
Se utiliza un esquema relacional normalizado inicializado automáticamente por Docker:  
- **containers:** Almacena ubicaciones físicas (binder, box, deck) con soporte de slots por página y límites de capacidad.  
- **cards:** Datos maestros de las cartas con restricciones de unicidad sobre los IDs de Scryfall.  
- **printings:** Versiones específicas de cada carta (sets, códigos, rarezas, acabados foil/nonfoil y URIs de imágenes oficiales).  
- **container_slots:** Mapeo de celdas individuales dentro de los contenedores físicos.  
- **card_copies:** Vinculación transaccional (dónde vive físicamente la copia, en qué slot, estado de conservación y acabados).  
### **3. Despliegue, Infraestructura y Configuración de Entorno (.env & Docker & Makefile)**  
**Audiencia:** DevOps, General  
Toda la infraestructura se orquesta mediante docker-compose. Para agilizar el desarrollo diario, se dispone de un Makefile automatizado con los comandos principales:  
- make up: Levanta todo el entorno (Base de datos PostgreSQL + API FastAPI + Frontend Nginx) en segundo plano.  
- make down: Detiene y apaga limpiamente los contenedores.  
- make logs: Muestra el registro de eventos en tiempo real de todos los servicios.  
- make import: Ejecuta scripts de importación de datos masivos.  
#### ***⚙️ Configuración del fichero de entorno (*** ***.env*** ***)***  
Para que el flujo de autenticación OAuth2 con la Intranet de 42 funcione correctamente, es requisito indispensable crear un archivo .env en la raíz del proyecto que contenga las credenciales de la aplicación registrada en la API de 42.  
Crea un archivo denominado .env con la siguiente estructura:  
Fragmento de código  
# Credenciales de la Intranet de 42 (OAuth2)  
FORTYTWO_CLIENT_ID=tu_client_id_proporcionado_por_42  
FORTYTWO_CLIENT_SECRET=tu_client_secret_proporcionado_por_42  
FORTYTWO_REDIRECT_URI=http://localhost:8000/api/auth/42/callback  
   
**Nota de seguridad:** Este fichero .env es cargado automáticamente por el backend al arrancar mediante contenedores, permitiendo aislar las credenciales sensibles y evitando que se suban al repositorio público de control de versiones.  
### **4. Especificación y Lógica Interna de la API (Backend FastAPI)**  
**Audiencia:** Desarrolladores Backend / Nodo Principal  
El backend está desarrollado con FastAPI, estructurado modularmente con routers independientes y un sistema robusto de conexión mediante diccionarios (RealDictCursor de psycopg2).  
**Endpoints Principales:**  
- GET /api/cards/types-taxonomy: Devuelve la estructura de filtrado estática leída desde el JSON de taxonomías.  
- GET /api/containers/: Lista todos los contenedores físicos disponibles en el sistema.  
- GET /api/cards/filter?name=...&type_line=...: Endpoint de búsqueda avanzada.  
- POST /api/containers/items: Registro transaccional de una copia física en un contenedor o slot.  
- GET /api/auth/42/login & GET /api/auth/42/callback: Endpoints encargados del flujo de autenticación, intercambio de tokens y sincronización de usuarios con la Intranet de 42.  
💡 **Lógica Destacada del Backend (Patrón de Auto-Sanación / Self-Healing):** El buscador del backend implementa una estrategia híbrida inteligente (services.py):  
- **Búsqueda Local:** Primero consulta en la base de datos local de PostgreSQL utilizando patrones flexibles (ILIKE) para maximizar la velocidad.  
- **Fallback Externo Automático:** Si no encuentra resultados locales, consulta de forma transparente la API pública oficial de Scryfall (unique=prints).  
- **Autoguardado al Vuelo:** Las cartas y sus impresiones encontradas en Scryfall se insertan automáticamente en la BBDD local en el mismo momento de la petición (INSERT ... ON CONFLICT DO UPDATE / DO NOTHING), alimentando el sistema de forma orgánica sin requerir volúmenes estáticos masivos previos.  
### **5. Guía de Integración y Frontend (JS Estático)**  
**Audiencia:** Desarrolladores Frontend  
Centralizado en los scripts estáticos de la interfaz (index.html, login.html, visor-containers.html, containers.html, etc.).  
- **Configuración del Endpoint Base:** Debe apuntar obligatoriamente a la variable global de entorno o constante de conexión:  
- JavaScript  
- const API_BASE_URL = 'http://localhost:8000/api';   
- **Navegación Parametrizada por URL:** El visor soporta la lectura directa de parámetros GET en la URL, específicamente container_id. *Comportamiento:* Al cargar visor-containers.html?container_id=UUID, el script intercepta el parámetro, verifica su existencia en el listado asíncrono de contenedores, auto-selecciona el valor en el desplegable y dispara programáticamente el evento change (containerSelector.dispatchEvent(new Event('change'))) para renderizar los slots de forma fluida y transparente para el usuario.  
- **Consistencia de Estilos UI (Contenedores y Formularios):** Los elementos de entrada de texto y selectores deben incorporar estrictamente la propiedad box-sizing: border-box; junto con un ancho del 100% para evitar desbordamientos visuales en los paneles laterales de gestión.  
Se requiere consistencia estricta en el manejo de respuestas JSON y persistencia local mediante localStorage para recordar preferencias y sesiones activas del usuario (incluyendo los payloads decodificados de autenticación externa de 42).  
### **6. Contrato de API y Protocolo de Cambios**  
**Audiencia:** TODO EL EQUIPO (Crítico)  
Este sistema se rige bajo un **Contrato de API**. Esto significa que el Backend (API) y el Frontend (UI) se comunican mediante un contrato de datos estricto en formato JSON.  
**Reglas de Oro:**  
- **El Contrato es Sagrado:** La estructura de los objetos JSON (como el payload de inserción de inventario o las respuestas de filtrado) no debe ser modificada unilateralmente por el Frontend.  
- **Independencia de Diseño:** El Frontend tiene total libertad para cambiar CSS, HTML, clases, colores, maquetación o animaciones. El Backend es "ciego" a estos cambios visuales y no se verá afectado siempre que los datos enviados y recibidos sigan la estructura acordada.  
- **Protocolo de Modificación:** Si el equipo de Frontend necesita enviar datos nuevos o alterar la estructura existente:  
  - **Paso 1:** Notificar al Nodo (Berto) o al equipo de Backend.  
  - **Paso 2:** Evaluar el impacto en el esquema de Base de Datos y en la lógica de los servicios FastAPI.  
  - **Paso 3:** Actualizar este documento (el contrato maestro).  
  - **Paso 4:** Implementar el cambio de forma coordinada en ambos extremos.  
⚠️ **Cualquier alteración no notificada en el contrato romperá la comunicación entre el Front y el Back, invalidando la sincronización de la aplicación.**  
   
