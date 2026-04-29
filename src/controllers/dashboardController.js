const Alert = require("../models/Alert");
const JetsonHeartbeat = require("../models/JetsonHeartbeat");
const OperationalMessage = require("../models/OperationalMessage");
const Report = require("../models/Report");
const SemaphoreOverride = require("../models/SemaphoreOverride");
const Traffic = require("../models/Traffic");
const TrafficLight = require("../models/TrafficLight");
const User = require("../models/User");
const { sendSuccess } = require("../utils/http");

async function expireOldOverrides(io) {
  const now = new Date();
  const expired = await SemaphoreOverride.find({
    status: "active",
    expires_at: { $lte: now }
  });

  if (!expired.length) {
    return;
  }

  for (const item of expired) {
    item.status = "expired";
    item.released_at = now;
    item.release_reason = item.release_reason || "auto_timeout";
    await item.save();

    if (io) {
      io.emit("semaphore-override", {
        type: "expired",
        override: {
          intersection_id: item.intersection_id,
          state: "NORMAL",
          road_name: item.road_name,
          trigger_role: item.trigger_role,
          siren_enabled: item.siren_enabled,
          detected_by_jetson: item.detected_by_jetson,
          activated_at: item.activated_at,
          expires_at: item.expires_at,
          release_reason: item.release_reason
        }
      });
    }
  }
}

async function buildRealtimeIntersectionState() {
  // 1. Obtener todos los semáforos registrados (Infraestructura base)
  const allLights = await TrafficLight.find({ is_active: true }).lean();

  // 2. Obtener el tráfico más reciente
  const latestTraffic = await Traffic.find({})
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();

  // 3. Obtener overrides activos
  const activeOverrides = await SemaphoreOverride.find({
    status: "active",
    expires_at: { $gt: new Date() }
  }).populate("triggered_by", "nombre rol");

  const stateMap = new Map();

  // Inicializar el mapa con todos los semáforos de la base de datos
  for (const light of allLights) {
    stateMap.set(light.name, {
      intersection_id: light.name,
      decision: "NORMAL",
      density: "low",
      vehicle_count: 0,
      pedestrian_count: 0,
      timestamp: light.updatedAt || new Date(),
      override: null,
      lat: light.location?.coordinates ? light.location.coordinates[1] : null,
      lng: light.location?.coordinates ? light.location.coordinates[0] : null
    });
  }

  // Actualizar con datos de tráfico reales si existen
  for (const record of latestTraffic) {
    const existing = stateMap.get(record.intersection_id);
    if (existing) {
      // Solo actualizamos si el registro de tráfico es más reciente o el actual es el default
      stateMap.set(record.intersection_id, {
        ...existing,
        decision: record.decision || existing.decision,
        density: record.density || existing.density,
        vehicle_count: record.vehicle_count,
        pedestrian_count: record.pedestrian_count,
        timestamp: record.timestamp
      });
    } else {
      // Si la intersección no está en TrafficLight, la agregamos igual para no perder datos
      stateMap.set(record.intersection_id, {
        intersection_id: record.intersection_id,
        decision: record.decision || null,
        density: record.density || null,
        vehicle_count: record.vehicle_count || 0,
        pedestrian_count: record.pedestrian_count || 0,
        timestamp: record.timestamp,
        override: null,
        lat: record.ubicacion?.lat || null,
        lng: record.ubicacion?.lng || null
      });
    }
  }

  // Aplicar Overrides (Prioridad máxima)
  for (const override of activeOverrides) {
    const current = stateMap.get(override.intersection_id) || {
      intersection_id: override.intersection_id,
      decision: null,
      density: null,
      vehicle_count: 0,
      pedestrian_count: 0,
      timestamp: null,
      override: null
    };

    current.override = {
      id: override._id,
      road_name: override.road_name,
      trigger_role: override.trigger_role,
      triggered_by: override.triggered_by,
      siren_enabled: override.siren_enabled,
      detected_by_jetson: override.detected_by_jetson,
      activated_at: override.activated_at,
      expires_at: override.expires_at
    };
    current.decision = "FORCED_GREEN";
    stateMap.set(override.intersection_id, current);
  }

  return Array.from(stateMap.values());
}

async function getAdminDashboard(req, res, next) {
  try {
    await expireOldOverrides(req.io);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const offlineThreshold = new Date(Date.now() - 10 * 60 * 1000);

    const [
      latestTraffic,
      activeAlerts,
      activeOverrides,
      recentReports,
      users,
      heartbeats,
      recentMessages
    ] = await Promise.all([
      Traffic.find({}).sort({ timestamp: -1 }).limit(20).lean(),
      Alert.find({ activa: true }).sort({ createdAt: -1 }).limit(10).lean(),
      SemaphoreOverride.find({ status: "active", expires_at: { $gt: new Date() } })
        .populate("triggered_by", "nombre rol")
        .sort({ createdAt: -1 }),
      Report.find({ createdAt: { $gte: since24h } }).sort({ createdAt: -1 }).limit(10).populate("creado_por", "nombre rol"),
      User.find({}).lean(),
      JetsonHeartbeat.find({}).sort({ last_seen_at: -1 }).lean(),
      OperationalMessage.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("from_user", "nombre rol")
        .populate("to_user", "nombre rol")
    ]);

    const intersections = await buildRealtimeIntersectionState();
    const onlineDevices = heartbeats.filter((item) => item.last_seen_at > offlineThreshold).length;

    sendSuccess(res, {
      totals: {
        intersections: intersections.length,
        active_alerts: activeAlerts.length,
        active_overrides: activeOverrides.length,
        users: users.length,
        online_devices: onlineDevices,
        vialidad_online: users.filter((user) => user.rol === "vialidad" && user.last_seen_at).length,
        ambulancias_online: users.filter((user) => user.rol === "ambulancia" && user.last_seen_at).length
      },
      intersections,
      active_alerts: activeAlerts,
      active_overrides: activeOverrides,
      recent_reports: recentReports,
      recent_messages: recentMessages,
      latest_traffic: latestTraffic,
      users_summary: users.map((user) => ({
        _id: user._id,
        id: user._id,
        nombre: user.nombre,
        name: user.nombre,
        displayName: user.nombre,
        rol: user.rol,
        role: user.rol,
        estado: user.estado,
        last_seen_at: user.last_seen_at,
        ubicacion: user.ubicacion || null
      }))
    });
  } catch (error) {
    next(error);
  }
}

async function getVialidadDashboard(req, res, next) {
  try {
    await expireOldOverrides(req.io);
    const currentUserId = req.currentUser._id;

    const [activeAlerts, messages, ownReports, intersections] = await Promise.all([
      Alert.find({ activa: true }).sort({ createdAt: -1 }).limit(20).lean(),
      OperationalMessage.find({
        $or: [
          { to_role: "vialidad" },
          { to_user: currentUserId },
          { from_user: currentUserId }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("from_user", "nombre rol")
        .populate("to_user", "nombre rol"),
      Report.find({
        $or: [
          { creado_por: currentUserId },
          { estado: "abierto" },
          { estado: "en_proceso" }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("creado_por", "nombre rol"),
      buildRealtimeIntersectionState()
    ]);

    const unreadMessages = messages.filter((message) =>
      !message.read_by.some((readerId) => String(readerId) === String(currentUserId))
    ).length;

    sendSuccess(res, {
      profile: {
        _id: req.currentUser._id,
        nombre: req.currentUser.nombre,
        rol: req.currentUser.rol,
        ubicacion: req.currentUser.ubicacion || null,
        assigned_intersections: req.currentUser.assigned_intersections || []
      },
      counters: {
        active_alerts: activeAlerts.length,
        unread_messages: unreadMessages,
        reports_visible: ownReports.length
      },
      active_alerts: activeAlerts,
      messages,
      reports: ownReports,
      intersections: intersections.map((item) => ({
        intersection_id: item.intersection_id,
        decision: item.decision,
        density: item.density,
        timestamp: item.timestamp,
        override: item.override,
        lat: item.lat,
        lng: item.lng
      }))
    });
  } catch (error) {
    next(error);
  }
}

async function getAmbulanciaDashboard(req, res, next) {
  try {
    await expireOldOverrides(req.io);
    const intersections = await buildRealtimeIntersectionState();
    const currentOverride = await SemaphoreOverride.findOne({
      triggered_by: req.currentUser._id,
      status: "active",
      expires_at: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    sendSuccess(res, {
      profile: {
        _id: req.currentUser._id,
        nombre: req.currentUser.nombre,
        rol: req.currentUser.rol,
        siren_enabled: req.currentUser.siren_enabled,
        ubicacion: req.currentUser.ubicacion || null,
        assigned_intersections: req.currentUser.assigned_intersections || []
      },
      current_override: currentOverride,
      intersections: intersections.map((item) => ({
        intersection_id: item.intersection_id,
        decision: item.decision,
        density: item.density,
        timestamp: item.timestamp,
        override: item.override,
        lat: item.lat,
        lng: item.lng
      })),
      instructions: {
        can_force_green: true,
        siren_required: true,
        default_duration_seconds: 15,
        manual_override_requires_intersection_selection: true
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
