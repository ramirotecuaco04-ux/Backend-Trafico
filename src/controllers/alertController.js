const Alert = require("../models/Alert");
const { createHttpError, sendSuccess } = require("../utils/http");
const {
  normalizeLimit,
  normalizePage,
  normalizeSortDirection,
  normalizeDate,
  normalizeBoolean,
  normalizeTrimmedString,
  validateObjectId
} = require("../utils/validation");

/**
 * Mapea la alerta para el cliente, calculando el estado de lectura y ocultando datos internos de DB.
 */
function mapAlertResponse(alert, userId) {
  const alertObj = alert.toObject ? alert.toObject() : alert;
  const is_read = userId && alertObj.read_by
    ? alertObj.read_by.some(id => String(id) === String(userId))
    : false;

  delete alertObj.read_by;

  return {
    ...alertObj,
    is_read: !!is_read
  };
}

/**
 * Normaliza el payload de la alerta.
 * Se asegura de que para el tipo 'override' no se exijan campos de emergencia de ambulancia.
 */
function normalizeAlertPayload(payload = {}, { partial = false } = {}) {
  const normalized = {};

  // Determinamos el tipo para ajustar la validación
  if (payload.tipo !== undefined) {
    let tipo = String(payload.tipo).trim().toLowerCase();
    if (tipo === "ambulance") tipo = "ambulancia";
    normalized.tipo = tipo;
  }

  const isOverride = normalized.tipo === "override";

  // Mensaje y descripción
  if (!partial || payload.mensaje !== undefined) {
    normalized.mensaje = normalizeTrimmedString(payload.mensaje, "mensaje", { required: false });
  }
  if (payload.description !== undefined) {
    normalized.description = normalizeTrimmedString(payload.description, "description");
  }

  // Prioridad con mapeo para compatibilidad con Frontend (Flutter usa high/low)
  if (payload.prioridad !== undefined) {
    let prio = String(payload.prioridad).trim().toLowerCase();
    if (prio === "high") prio = "alta";
    if (prio === "medium") prio = "media";
    if (prio === "low") prio = "baja";
    normalized.prioridad = prio;
  }

  if (payload.intersection_id !== undefined) {
    normalized.intersection_id = payload.intersection_id ? String(payload.intersection_id).trim() : null;
  }

  if (payload.activa !== undefined) {
    normalized.activa = normalizeBoolean(payload.activa, "activa");
  }

  // Título y subtítulo
  if (payload.titulo !== undefined) normalized.titulo = normalizeTrimmedString(payload.titulo, "titulo");
  if (payload.subtitulo !== undefined) normalized.subtitulo = normalizeTrimmedString(payload.subtitulo, "subtitulo");

  if (payload.ubicacion !== undefined) {
    normalized.ubicacion = {
      lat: (payload.ubicacion?.lat != null) ? Number(payload.ubicacion.lat) : null,
      lng: (payload.ubicacion?.lng != null) ? Number(payload.ubicacion.lng) : null
    };
  }

  return normalized;
}

async function createAlert(req, res, next) {
  try {
    const allowedRoles = ["admin", "vialidad", "ambulancia"];
    if (!req.currentUser || !allowedRoles.includes(req.currentUser.rol)) {
      throw createHttpError("No tienes permisos para crear alertas", 403);
    }

    const payload = normalizeAlertPayload(req.body);

    // Identificar si es una alerta de emergencia o prioridad manual
    const isAmbulance = payload.tipo === "ambulancia" || req.currentUser.rol === "ambulancia";
    const isOverride = payload.tipo === "override";
    const isEmergency = isAmbulance || isOverride;

    if (isEmergency) {
      payload.activa = true;

      // Normalización de tipos
      if (!payload.tipo) {
        payload.tipo = isAmbulance ? "ambulancia" : "override";
      }

      // Prioridad por defecto
      if (!payload.prioridad) {
        payload.prioridad = isAmbulance ? "alta" : "media";
      }

      // Fallbacks para contenido visual (Evita que el frontend muestre campos vacíos)
      if (!payload.titulo) {
        payload.titulo = isOverride ? "PRIORIDAD DE PASO" : "¡EMERGENCIA DETECTADA!";
      }

      if (!payload.mensaje) {
        payload.mensaje = payload.description ||
          (isOverride ? "Prioridad activada por administrador" : "Alerta de emergencia en curso");
      }
    }

    payload.read_by = [];
    const alert = await Alert.create(payload);

    if (req.io) {
      const alertData = mapAlertResponse(alert, req.currentUser._id);
      req.io.emit("alert-update", alert);
      req.io.emit("nueva_alerta", alertData);
    }

    sendSuccess(res, mapAlertResponse(alert, req.currentUser._id), { event_emitted: true }, 201);
  } catch (error) {
    next(error);
  }
}

async function getAlerts(req, res, next) {
  try {
    const limit = normalizeLimit(req.query.limit);
    const page = normalizePage(req.query.page);
    const sortDirection = normalizeSortDirection(req.query.sort);
    const skip = (page - 1) * limit;
    const query = {};
    const userId = req.currentUser?._id;

    if (req.query.activa !== undefined) {
      const isActive = normalizeBoolean(req.query.activa, "activa");
      query.activa = isActive;
      if (isActive && userId && req.query.include_read !== 'true') {
        query.read_by = { $ne: userId };
      }
    }

    if ((req.query.unread === "true" || req.query.only_unread === "true") && userId) {
      query.read_by = { $ne: userId };
    }

    if (req.query.tipo) query.tipo = String(req.query.tipo).trim();
    if (req.query.prioridad) query.prioridad = String(req.query.prioridad).trim();

    const startDate = normalizeDate(req.query.start_date, "start_date");
    const endDate = normalizeDate(req.query.end_date, "end_date");
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    const [alerts, total] = await Promise.all([
      Alert.find(query).sort({ createdAt: sortDirection }).skip(skip).limit(limit),
      Alert.countDocuments(query)
    ]);

    const mappedAlerts = alerts.map(a => mapAlertResponse(a, userId));

    sendSuccess(res, mappedAlerts, {
      count: mappedAlerts.length,
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    next(error);
  }
}

async function getAlertById(req, res, next) {
  try {
    validateObjectId(req.params.id, "alert id");
    const alert = await Alert.findById(req.params.id);
    if (!alert) throw createHttpError("Alerta no encontrada", 404);
    sendSuccess(res, mapAlertResponse(alert, req.currentUser?._id));
  } catch (error) {
    next(error);
  }
}

async function updateAlert(req, res, next) {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      normalizeAlertPayload(req.body, { partial: true }),
      { new: true, runValidators: true }
    );
    if (!alert) throw createHttpError("Alerta no encontrada", 404);
    if (req.io) req.io.emit("alert-update", alert);
    sendSuccess(res, mapAlertResponse(alert, req.currentUser?._id), { event_emitted: true });
  } catch (error) {
    next(error);
  }
}

async function markAllAsRead(req, res, next) {
  try {
    const userId = req.currentUser._id;
    const result = await Alert.updateMany(
      { read_by: { $ne: userId } },
      { $addToSet: { read_by: userId } }
    );

    sendSuccess(res, {
      message: "Todas las alertas han sido marcadas como leídas correctamente",
      modified_count: result.modifiedCount || 0
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createAlert,
  getAlertById,
  getAlerts,
  updateAlert,
  markAllAsRead
};
