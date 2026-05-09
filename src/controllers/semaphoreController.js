const SemaphoreOverride = require("../models/SemaphoreOverride");
const Traffic = require("../models/Traffic");
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

    // 1. Verificar que el semáforo existe en la infraestructura estática
    const light = await TrafficLight.findOne({ name: intersection_id });
    if (!light) throw createHttpError("Semáforo no encontrado en la infraestructura", 404);

    // 2. Evitar duplicados activos
    const existing = await SemaphoreOverride.findOne({ intersection_id, status: "active" });
    if (existing) throw createHttpError("Ya hay una prioridad activa para este semáforo", 409);

    const duration = force_green_duration_seconds || 30;
    const expiresAt = new Date(Date.now() + duration * 1000);

    // 3. Crear Override
    const override = await SemaphoreOverride.create({
      intersection_id,
      triggered_by: req.currentUser._id,
      trigger_role: req.currentUser.rol,
      siren_enabled: !!siren_enabled,
      expires_at: expiresAt,
      status: "active"
    });

    // 4. Feedback Visual Inmediato vía Sockets (Broadcasting a todos con req.io)
    if (req.io) {
      // Notificación de estado para el mapa
      req.io.emit("emergency-override-active", {
        intersection_id,
        status: "FORCED_GREEN",
        override_id: override._id
      });

      // Alerta general para el Centro de Control (Estructura exacta requerida por el Frontend)
      req.io.emit("nueva_alerta", {
        id: override._id,
        tipo: "ambulancia",
        titulo: "¡EMERGENCIA DETECTADA!",
        subtitulo: "Intersección: " + intersection_id,
        mensaje: "Prioridad de paso activada por unidad de emergencia",
        activa: true,
        prioridad: "high"
      });
    }

    sendSuccess(res, buildOverrideState(override), { message: "Prioridad activada correctamente" }, 201);
  } catch (error) {
    next(error);
  }
}

async function releaseSemaphoreOverride(req, res, next) {
  try {
    const { id } = req.params;

    let override;
    if (id.length > 20) {
      override = await SemaphoreOverride.findById(id);
    } else {
      override = await SemaphoreOverride.findOne({ intersection_id: id, status: "active" });
    }

    if (!override) throw createHttpError("No se encontró una prioridad activa para liberar", 404);

    override.status = "released";
    override.released_at = new Date();
    override.release_reason = "manual_cancel_by_user";
    await override.save();

    if (req.io) {
      req.io.emit("emergency-override-released", {
        intersection_id: override.intersection_id,
        status: "NORMAL",
        message: "Prioridad cancelada manualmente"
      });
    }

    sendSuccess(res, { status: "released", intersection_id: override.intersection_id });
  } catch (error) {
    next(error);
  }
}

async function getRealtimeSemaphoreState(req, res, next) {
  try {
    const lights = await TrafficLight.find({}).lean();
    const activeOverrides = await SemaphoreOverride.find({ status: "active" }).lean();

    const response = lights.map(l => {
      const ov = activeOverrides.find(o => o.intersection_id === l.name);

      return {
        intersection_id: l.name,
        name: l.name,
        lat: l.location?.coordinates ? l.location.coordinates[1] : (l.ubicacion?.lat || null),
        lng: l.location?.coordinates ? l.location.coordinates[0] : (l.ubicacion?.lng || null),
        decision: ov ? "FORCED_GREEN" : (l.status || "NORMAL"),
        is_priority: !!ov,
        state: ov ? "FORCED_GREEN" : (l.status || "NORMAL")
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
