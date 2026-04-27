const Alert = require("../models/Alert");
const { createHttpError, sendSuccess } = require("../utils/http");
const {
  normalizeBoolean,
  normalizeDate,
  normalizeLimit,
  normalizePage,
  normalizeSortDirection,
  normalizeTrimmedString,
  validateObjectId
} = require("../utils/validation");

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
    if (!req.currentUser || !["admin", "vialidad"].includes(req.currentUser.rol)) {
      throw createHttpError("Solo admin o vialidad pueden crear alertas", 403);
    }

    const alert = await Alert.create(normalizeAlertPayload(req.body));

    if (req.io) {
      req.io.emit("alert-update", alert);
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

      if (startDate) {
        query.createdAt.$gte = startDate;
      }

      if (endDate) {
        query.createdAt.$lte = endDate;
      }
    }

    const [alerts, total] = await Promise.all([
      Alert.find(query).sort({ createdAt: sortDirection }).skip(skip).limit(limit),
      Alert.countDocuments(query)
    ]);

    sendSuccess(res, alerts, {
      count: alerts.length,
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

module.exports = {
  createAlert,
  getAlertById,
  getAlerts,
  updateAlert
};
