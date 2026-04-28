const SemaphoreOverride = require("../models/SemaphoreOverride");
const TrafficLight = require("../models/TrafficLight");
const { expireOldOverrides } = require("./dashboardController");
const { createHttpError, sendSuccess } = require("../utils/http");

function buildOverrideState(record) {
  return {
    id: record._id,
    intersection_id: record.intersection_id,
    state: "FORCED_GREEN",
    triggered_by: record.triggered_by,
    activated_at: record.activated_at,
    expires_at: record.expires_at,
    status: record.status
  };
}

async function activateSemaphoreOverride(req, res, next) {
  try {
    const { intersection_id, siren_enabled, force_green_duration_seconds } = req.body;
    if (!intersection_id) throw createHttpError("intersection_id es requerido", 400);

    const light = await TrafficLight.findOne({ _id: intersection_id });
    if (!light) throw createHttpError("Semáforo no encontrado", 404);

    const existing = await SemaphoreOverride.findOne({ intersection_id, status: "active" });
    if (existing) throw createHttpError("Ya hay una prioridad activa", 409);

    const duration = force_green_duration_seconds || 30;
    const expiresAt = new Date(Date.now() + duration * 1000);

    const override = await SemaphoreOverride.create({
      intersection_id,
      triggered_by: req.currentUser._id,
      trigger_role: req.currentUser.rol,
      siren_enabled: !!siren_enabled,
      expires_at: expiresAt,
      status: "active"
    });

    if (req.io) {
      req.io.emit("semaphore-status-change", {
        intersection_id,
        new_state: "FORCED_GREEN",
        override_id: override._id
      });
    }

    sendSuccess(res, buildOverrideState(override), undefined, 201);
  } catch (error) {
    next(error);
  }
}

async function releaseSemaphoreOverride(req, res, next) {
  try {
    const { id } = req.params;
    let override = await SemaphoreOverride.findOne({
      $or: [{ _id: id.length > 20 ? id : null }, { intersection_id: id }],
      status: "active"
    });

    if (!override) throw createHttpError("No hay prioridad activa para liberar", 404);

    override.status = "released";
    override.released_at = new Date();
    await override.save();

    if (req.io) {
      req.io.emit("semaphore-status-change", {
        intersection_id: override.intersection_id,
        new_state: "NORMAL"
      });
    }

    sendSuccess(res, { status: "released", intersection_id: override.intersection_id });
  } catch (error) {
    next(error);
  }
}

async function getRealtimeSemaphoreState(req, res, next) {
  try {
    // LEER DE LA COLECCIÓN QUE MOSTRASTE EN LA IMAGEN
    const lights = await TrafficLight.find().lean();
    const activeOverrides = await SemaphoreOverride.find({ status: "active" }).lean();

    const response = lights.map(l => {
      const ov = activeOverrides.find(o => o.intersection_id === String(l._id));

      // EXTRACCIÓN CORRECTA DE GEOJSON (según tu imagen)
      // index 0 = LNG, index 1 = LAT
      const lng = l.location?.coordinates?.[0] || null;
      const lat = l.location?.coordinates?.[1] || null;

      return {
        intersection_id: String(l._id),
        name: l.name || "Semáforo",
        lat: lat,
        lng: lng,
        decision: ov ? "FORCED_GREEN" : (l.status || "RED").toUpperCase(),
        is_priority: !!ov,
        is_active: l.is_active
      };
    });

    sendSuccess(res, response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  activateSemaphoreOverride,
  getRealtimeSemaphoreState,
  releaseSemaphoreOverride
};
