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

function normalizeAlertPayload(payload = {}, { partial = false } = {}) {
  const normalized = {};

  if (!partial || payload.mensaje !== undefined) {
    normalized.mensaje = normalizeTrimmedString(payload.mensaje, "mensaje", { required: true });
  }

  if (payload.description !== undefined) {
    normalized.description = normalizeTrimmedString(payload.description, "description");
  }

  if (payload.tipo !== undefined) {
    normalized.tipo = String(payload.tipo).trim();
  }

  if (payload.prioridad !== undefined) {
    normalized.prioridad = String(payload.prioridad).trim();
  }

  if (payload.intersection_id !== undefined) {
    normalized.intersection_id = payload.intersection_id
      ? String(payload.intersection_id).trim()
      : null;
  }

  if (payload.activa !== undefined) {
    normalized.activa = Boolean(payload.activa);
  }

  if (payload.ubicacion !== undefined) {
    normalized.ubicacion = {
      lat: payload.ubicacion?.lat ?? null,
      lng: payload.ubicacion?.lng ?? null
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

    // Lógica específica para ambulancias
    if (payload.tipo === "ambulance" || req.currentUser.rol === "ambulancia") {
      payload.activa = true;
      if (!payload.tipo) payload.tipo = "ambulance";
      if (!payload.prioridad) payload.prioridad = "alta";
    }

    const alert = await Alert.create(payload);

    // Notificación vía WebSockets
    if (req.io) {
      req.io.emit("alert-update", alert);
      req.io.emit("nueva_alerta", {
        ...alert.toObject(),
        description: alert.mensaje,
        created_by_role: req.currentUser.rol
      });
    }

    sendSuccess(res, alert, { event_emitted: true }, 201);
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
    const startDate = normalizeDate(req.query.start_date, "start_date");
    const endDate = normalizeDate(req.query.end_date, "end_date");

    if (req.query.activa !== undefined) {
      query.activa = normalizeBoolean(req.query.activa, "activa");
    }

    if (req.query.tipo) {
      query.tipo = String(req.query.tipo).trim();
    }

    if (req.query.prioridad) {
      query.prioridad = String(req.query.prioridad).trim();
    }

    if (req.query.intersection_id) {
      query.intersection_id = String(req.query.intersection_id).trim();
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    const [alerts, total, unreadCount] = await Promise.all([
      Alert.find(query).sort({ createdAt: sortDirection }).skip(skip).limit(limit),
      Alert.countDocuments(query),
      // Contar alertas activas no leídas por el usuario actual
      Alert.countDocuments({
        activa: true,
        read_by: { $ne: req.currentUser._id }
      })
    ]);

    sendSuccess(res, alerts, {
      count: alerts.length,
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      unread_count: unreadCount,
      has_new: unreadCount > 0 // Propiedad solicitada para el punto rojo en el frontend
    });
  } catch (error) {
    next(error);
  }
}

async function getAlertById(req, res, next) {
  try {
    validateObjectId(req.params.id, "alert id");
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      throw createHttpError("Alerta no encontrada", 404);
    }

    // Marcar como leída individualmente al consultar el detalle
    if (!alert.read_by.includes(req.currentUser._id)) {
      alert.read_by.push(req.currentUser._id);
      await alert.save();
    }

    sendSuccess(res, alert);
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

    if (!alert) {
      throw createHttpError("Alerta no encontrada", 404);
    }

    if (req.io) {
      req.io.emit("alert-update", alert);
    }

    sendSuccess(res, alert, { event_emitted: true });
  } catch (error) {
    next(error);
  }
}

/**
 * Marca todas las alertas como leídas para el usuario actual.
 * Si el usuario es Admin, también las marca como inactivas globalmente para limpiar el feed.
 */
async function markAllAsRead(req, res, next) {
  try {
    const userId = req.currentUser._id;

    // 1. Agregar el ID del usuario a la lista de 'leído por'
    await Alert.updateMany(
      { activa: true, read_by: { $ne: userId } },
      { $addToSet: { read_by: userId } }
    );

    // 2. Si es Admin o Vialidad, podemos desactivarlas globalmente para limpiar la vista de emergencia
    // (Dependiendo de si queremos que el estado de 'emergencia' persista hasta que alguien lo cierre)
    if (req.currentUser.rol === "admin") {
      await Alert.updateMany({ activa: true }, { $set: { activa: false } });
    }

    if (req.io) {
      req.io.emit("alerts-cleared", { by: req.currentUser.nombre });
    }

    sendSuccess(res, { message: "Todas las alertas han sido marcadas como leídas" });
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
