# Frontend Role Contract

Este documento define que debe ver y hacer cada rol en el frontend.

## 1. Admin

### Pantallas
- Dashboard general
- Monitoreo de camaras e intersecciones
- Alertas
- Reportes
- Usuarios
- Mensajes operativos
- Control de overrides de semaforo

### Endpoint principal de dashboard
- `GET /api/dashboard/admin`

### Endpoints secundarios
- `GET /api/traffic`
- `GET /api/traffic/metrics`
- `GET /api/traffic/summary`
- `GET /api/traffic/heartbeats`
- `GET /api/alerts`
- `GET /api/reports`
- `GET /api/users`
- `GET /api/messages`
- `GET /api/semaphores/state`
- `GET /api/semaphores/overrides`

### Acciones permitidas
- Crear y editar usuarios
- Eliminar usuarios
- Ver metricas completas
- Ver estado de Jetson/camaras
- Enviar mensajes a vialidad o ambulancia
- Crear trafico manual
- Liberar o activar override de semaforo

### UI sugerida
- KPI cards: intersecciones, alertas activas, overrides activos, dispositivos online
- Tabla de usuarios con estado y ubicacion
- Tabla de dispositivos Jetson con heartbeat
- Mapa o panel de intersecciones
- Feed de mensajes y reportes recientes

## 2. Vialidad

### Pantallas
- Dashboard operativo
- Alertas
- Mensajes
- Reportes

### Endpoint principal de dashboard
- `GET /api/dashboard/vialidad`

### Endpoints secundarios
- `GET /api/alerts`
- `POST /api/alerts`
- `GET /api/messages`
- `PATCH /api/messages/:id/read`
- `GET /api/reports`
- `POST /api/reports`
- `PATCH /api/auth/presence`

### Acciones permitidas
- Ver alertas
- Activar alertas
- Leer mensajes del admin
- Generar reportes
- Actualizar su ubicacion durante la sesion

### UI sugerida
- Panel con alertas activas
- Lista de mensajes pendientes
- Formulario de reporte rapido
- Estado resumido de intersecciones
- Indicador de ubicacion actual del usuario

## 3. Ambulancia

### Pantallas
- Dashboard ambulancia
- Estado de semaforos en tiempo real
- Activacion manual de prioridad

### Endpoint principal de dashboard
- `GET /api/dashboard/ambulancia`

### Endpoints secundarios
- `GET /api/semaphores/state`
- `GET /api/semaphores/overrides`
- `POST /api/semaphores/overrides`
- `PATCH /api/semaphores/overrides/:id/release`
- `PATCH /api/auth/presence`

### Acciones permitidas
- Ver estado actual de semaforos/intersecciones
- Seleccionar interseccion
- Activar prioridad manual solo con sirena encendida
- Liberar prioridad manual
- Actualizar su ubicacion y estado de sirena

### Regla clave de negocio
- Si la Jetson detecta la ambulancia, el sistema puede operar normalmente segun deteccion.
- Si la Jetson no la detecta, la ambulancia puede seleccionar la interseccion y activar override manual.
- El backend solo permite prioridad manual si `siren_enabled = true`.
- El override pone la interseccion seleccionada en verde forzado.
- Los demas flujos quedan subordinados a ese override.
- El override vuelve a normalidad cuando:
  - se libera manualmente, o
  - expira automaticamente a los 15 segundos por defecto.

### UI sugerida
- Lista de intersecciones con estado en vivo
- Boton grande de `Activar verde`
- Timer visible del override
- Boton de `Desactivar prioridad`
- Indicador fuerte de sirena activa/inactiva

## 4. Login y sesion

### Flujo recomendado
1. Login con Firebase en frontend.
2. Obtener ID token.
3. Llamar `POST /api/auth/sync`.
4. Guardar sesion frontend.
5. Según `user.rol`, redirigir al dashboard correcto:
   - `admin` -> `/admin`
   - `vialidad` -> `/vialidad`
   - `ambulancia` -> `/ambulancia`

### Endpoints
- `GET /api/auth/me`
- `POST /api/auth/sync`
- `PATCH /api/auth/presence`

## 5. Eventos Socket recomendados para frontend

El frontend debe escuchar:
- `new_traffic`
- `traffic-decision`
- `alert-update`
- `jetson-heartbeat`
- `operational-message`
- `semaphore-override`
