const Alert = require("../models/Alert");
const JetsonHeartbeat = require("../models/JetsonHeartbeat");
const OperationalMessage = require("../models/OperationalMessage");
const Report = require("../models/Report");
const SemaphoreOverride = require("../models/SemaphoreOverride");
const Traffic = require("../models/Traffic");
const TrafficLight = require("../models/TrafficLight"); // Importamos el modelo estático
const User = require("../models/User");
const { sendSuccess } = require("../utils/http");

async function expireOldOverrides(io) {
  const now = new Date();
  const expired = await SemaphoreOverride.find({
    status: "active",
    expires_at: { $lte: now }
  });

  if (!expired.length) return;

  for (const item of expired) {
    item.status = "expired";
    item.released_at = now;
    await item.save();

    if (io) {
      io.emit("semaphore-status-change", {
        intersection_id: item.intersection_id,
        new_state: "NORMAL"
      });
    }
  }
}

async function buildAmbulanceMapData() {
  // 1. Obtener la infraestructura estática (donde están las coordenadas)
  const lights = await TrafficLight.find().lean();

  // 2. Obtener overrides activos
  const activeOverrides = await SemaphoreOverride.find({ status: "active" }).lean();

  // 3. Obtener último tráfico para densidad
  const latestTraffic = await Traffic.find({}).sort({ timestamp: -1 }).limit(50).lean();

  return lights.map(l => {
    const override = activeOverrides.find(o => o.intersection_id === String(l._id));
    const traffic = latestTraffic.find(t => t.intersection_id === String(l._id));

    return {
      intersection_id: String(l._id),
      name: l.name || "Semáforo",
      lat: l.location?.coordinates?.[1] || null, // LATITUD
      lng: l.location?.coordinates?.[0] || null, // LONGITUD
      decision: override ? "FORCED_GREEN" : (l.status || "RED").toUpperCase(),
      density: traffic?.density || "low",
      is_priority: !!override
    };
  });
}

async function getAdminDashboard(req, res, next) {
    // ... manteniendo lógica existente para admin ...
    try {
        await expireOldOverrides(req.io);
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [latestTraffic, activeAlerts, activeOverrides, users] = await Promise.all([
            Traffic.find({}).sort({ timestamp: -1 }).limit(20).lean(),
            Alert.find({ activa: true }).sort({ createdAt: -1 }).limit(10).lean(),
            SemaphoreOverride.find({ status: "active" }).populate("triggered_by", "nombre rol"),
            User.find({}).lean()
        ]);
        const intersections = await buildAmbulanceMapData();
        sendSuccess(res, { totals: { intersections: intersections.length }, intersections, users_summary: users });
    } catch (e) { next(e); }
}

async function getVialidadDashboard(req, res, next) {
  try {
    await expireOldOverrides(req.io);
    const intersections = await buildAmbulanceMapData();
    sendSuccess(res, { intersections });
  } catch (error) {
    next(error);
  }
}

async function getAmbulanciaDashboard(req, res, next) {
  try {
    await expireOldOverrides(req.io);

    // Obtener los datos del mapa con COORDENADAS
    const intersections = await buildAmbulanceMapData();

    const currentOverride = await SemaphoreOverride.findOne({
      triggered_by: req.currentUser._id,
      status: "active"
    }).sort({ createdAt: -1 });

    sendSuccess(res, {
      profile: {
        id: req.currentUser._id,
        nombre: req.currentUser.nombre,
        rol: req.currentUser.rol,
        ubicacion: req.currentUser.ubicacion || null
      },
      current_override: currentOverride,
      intersections: intersections, // AQUÍ VAN LAS COORDENADAS QUE FLUTTER NECESITA
      instructions: {
        can_force_green: true,
        siren_required: true,
        interaction_radius_meters: 300
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  expireOldOverrides,
  getAdminDashboard,
  getAmbulanciaDashboard,
  getVialidadDashboard
};
