# API Contract

Backend base URL:
- `http://localhost:4000`
- En Render usa tu dominio desplegado.

Autenticacion:
- Firebase ID token en header `Authorization: Bearer <token>`
- Para rutas de Jetson usa header `x-jetson-key: <JETSON_API_KEY>`

Formato de respuesta exitosa:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Formato de error:

```json
{
  "success": false,
  "error": {
    "message": "Descripcion del error",
    "status": 400,
    "path": "/api/traffic",
    "details": null
  }
}
```

## Health

- `GET /api/health`

## Auth

- `GET /api/auth/me`
  Requiere Firebase token.

- `POST /api/auth/sync`
  Requiere Firebase token.
  Crea o sincroniza el usuario Mongo usando `firebase_uid`.

Payload sugerido:

```json
{
  "nombre": "Ramiro",
  "email": "ramirotecuaco04@gmail.com",
  "ubicacion": {
    "lat": 14.6349,
    "lng": -90.5069
  }
}
```

## Traffic

- `GET /api/traffic`
  Query params:
  - `page`
  - `limit`
  - `sort=asc|desc`
  - `intersection_id`
  - `camera_id`
  - `decision`
  - `density`
  - `start_date`
  - `end_date`

- `GET /api/traffic/:id`

- `GET /api/traffic/summary`
  Query params:
  - `limit`

- `GET /api/traffic/metrics`
  Query params:
  - `hours`

- `POST /api/traffic`
  Requiere Firebase token y rol `admin`.
- `POST /api/traffic/jetson`
  Requiere `x-jetson-key`.

Payload sugerido para tráfico:

```json
{
  "intersection_id": "INT-01",
  "vehicle_count": 18,
  "pedestrian_count": 4,
  "density": "high",
  "decision": "GREEN_A",
  "camera_id": "CAM-01",
  "timestamp": "2026-04-21T20:30:00.000Z"
}
```

## Jetson Heartbeat

- `GET /api/traffic/heartbeats`
  Query params:
  - `page`
  - `limit`
  - `offline_after_minutes`
  - `device_id`
  - `camera_id`
  - `intersection_id`

- `GET /api/traffic/heartbeats/:id`

- `POST /api/traffic/jetson/heartbeat`
  Requiere `x-jetson-key`.

Payload sugerido para heartbeat:

```json
{
  "device_id": "JETSON-NANO-01",
  "camera_id": "CAM-01",
  "intersection_id": "INT-01",
  "status": "online",
  "ip_address": "192.168.1.10",
  "metadata": {
    "temperature": 51,
    "fps": 24
  }
}
```

## Reports

Todas las rutas de reportes requieren Firebase token.

- `GET /api/reports`
  Query params:
  - `page`
  - `limit`
  - `sort=asc|desc`
  - `estado`
  - `tipo`
  - `prioridad`
  - `intersection_id`
  - `start_date`
  - `end_date`

- `GET /api/reports/:id`
- `POST /api/reports`
- `PATCH /api/reports/:id`
  `PATCH` requiere rol `admin`.

## Alerts

Todas las rutas de alertas requieren Firebase token.

- `GET /api/alerts`
  Query params:
  - `page`
  - `limit`
  - `sort=asc|desc`
  - `activa`
  - `tipo`
  - `prioridad`
  - `intersection_id`
  - `start_date`
  - `end_date`

- `GET /api/alerts/:id`
- `POST /api/alerts`
- `PATCH /api/alerts/:id`
  `PATCH` requiere rol `admin`.

## Users

Todas las rutas de usuarios requieren Firebase token.

- `GET /api/users`
  Query params:
  - `page`
  - `limit`
  - `sort=asc|desc`
  - `rol`
  - `estado`
  - `nombre`

- `GET /api/users/:id`
- `POST /api/users`
- `PATCH /api/users/:id`
  `POST` y `PATCH` requieren rol `admin`.

## Socket Events

Eventos emitidos por el backend:
- `new_traffic`
- `traffic-decision`
- `alert-update`
- `jetson-heartbeat`
