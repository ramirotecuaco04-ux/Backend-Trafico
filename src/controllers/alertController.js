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
 * Utilidad interna para mapear alertas incluyendo el estado de lectura para el usuario actual.
 */
function mapAlertResponse(alert, userId) {
  const alertObj = alert.toObject ? alert.toObject() : alert;
  return {
    ...alertObj,
    is_read: userId ? alertObj.read_by?.some(id => String(id) === String(userId)) : false
  };
}

function normalizeAlertPayload(payload = {}, { partial = false } = {}) {
  const normalized = {};

  if (!partial || payload.mensaje !== undefined) {
    normalized.mensaje = normalizeTrimmedString(payload.mensaje, "mensaje", { required: true });
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

    if (payload.tipo === "ambulance" || req.currentUser.rol === "ambulancia") {
      payload.activa = true;
      if (!payload.tipo) payload.tipo = "ambulance";
      if (!payload.prioridad) payload.prioridad = "alta";
    }

    const alert = await Alert.create(payload);

    if (req.io) {
      req.io.emit("alert-update", alert);
      req.io.emit("nueva_alerta", mapAlertResponse(alert, req.currentUser._id));
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

      // Si se piden alertas activas, filtramos las que ya leyó este usuario específico
      // para que no cuenten como pendientes en el contador del frontend.
      if (isActive && userId) {
        query.read_by = { $ne: userId };
      }
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

    if (!alert) {
      throw createHttpError("Alerta no encontrada", 404);
    }

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

    if (!alert) {
      throw createHttpError("Alerta no encontrada", 404);
    }

    if (req.io) {
      req.io.emit("alert-update", alert);
    }

    sendSuccess(res, mapAlertResponse(alert, req.currentUser?._id), { event_emitted: true });
  } catch (error) {
    next(error);
  }
}

async function markAllAsRead(req, res, next) {
  try {
    const userId = req.currentUser._id;

    // Marcamos todas las alertas activas como leídas por este usuario
    await Alert.updateMany(
      { activa: true, read_by: { $ne: userId } },
      { $addToSet: { read_by: userId } }
    );

    sendSuccess(res, { message: "Todas las alertas marcadas como leídas" });
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
