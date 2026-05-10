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
 * Garantiza que el Frontend reciba una bandera 'is_read' clara y permanente.
 */
function mapAlertResponse(alert, userId) {
  const alertObj = alert.toObject ? alert.toObject() : alert;

  // Calculamos is_read basándonos en si el ID del usuario está en el arreglo read_by
  // Si no hay userId o no hay read_by, por defecto es false (no leída).
  const is_read = userId && alertObj.read_by
    ? alertObj.read_by.some(id => String(id) === String(userId))
    : false;

  // Eliminamos el arreglo read_by para no exponer IDs de otros usuarios y mantener el JSON limpio
  delete alertObj.read_by;

  return {
    ...alertObj,
    is_read: !!is_read
  };
}

function normalizeAlertPayload(payload = {}, { partial = false } = {}) {
  const normalized = {};

  // Mensaje ahora es opcional para evitar errores 400 si el frontend no lo envía (usa description/titulo)
  if (!partial || payload.mensaje !== undefined) {
    normalized.mensaje = normalizeTrimmedString(payload.mensaje, "mensaje", { required: false });
  }

  if (payload.tipo !== undefined) normalized.tipo = String(payload.tipo).trim();
  if (payload.prioridad !== undefined) normalized.prioridad = String(payload.prioridad).trim();
  if (payload.intersection_id !== undefined) {
    normalized.intersection_id = payload.intersection_id ? String(payload.intersection_id).trim() : null;
  }
  if (payload.activa !== undefined) normalized.activa = Boolean(payload.activa);

  // Soporte para campos extendidos que envía el Frontend
  if (payload.titulo !== undefined) normalized.titulo = normalizeTrimmedString(payload.titulo, "titulo");
  if (payload.subtitulo !== undefined) normalized.subtitulo = normalizeTrimmedString(payload.subtitulo, "subtitulo");
  if (payload.description !== undefined) normalized.description = normalizeTrimmedString(payload.description, "description");

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

    // Ajuste de emergencia (ambulancia)
    if (payload.tipo === "ambulance" || payload.tipo === "ambulancia" || req.currentUser.rol === "ambulancia") {
      payload.activa = true;
      if (!payload.tipo || payload.tipo === "ambulance") payload.tipo = "ambulancia";
      if (!payload.prioridad) payload.prioridad = "alta";

      // Si no hay mensaje pero hay título/descripción, los usamos como fallback
      if (!payload.mensaje) {
        payload.mensaje = payload.titulo || payload.description || "Alerta de emergencia";
      }
    }

    // Garantizamos que el arreglo de leídos esté vacío al crear una nueva alerta
    payload.read_by = [];

    const alert = await Alert.create(payload);

    if (req.io) {
      // Emitimos la alerta mapeada para que el frontend la reciba con is_read: false inmediatamente
      const alertData = mapAlertResponse(alert, req.currentUser._id);
      req.io.emit("alert-update", alert); // Evento técnico
      req.io.emit("nueva_alerta", alertData); // Evento de negocio
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

    // Filtro por estado activo (incidente en curso)
    if (req.query.activa !== undefined) {
      const isActive = normalizeBoolean(req.query.activa, "activa");
      query.activa = isActive;

      // Si se piden alertas activas (pendientes), por defecto excluimos las ya leídas por el usuario
      if (isActive && userId && req.query.include_read !== 'true') {
        query.read_by = { $ne: userId };
      }
    }

    // Filtro explícito para alertas NO leídas (alias de utilidad)
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

/**
 * Marca todas las alertas como leídas para el usuario actual.
 */
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
