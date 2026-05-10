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

    const alertUpdate = await Alert.updateMany({ intersection_id: item.intersection_id, activa: true }, { activa: false });

    if (alertUpdate.acknowledged) {
      console.log("[MSG-SERVER] ¿Se actualizó el registro?: SÍ");
    }

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

      io.emit("emergency-override-released", {
        intersection_id: item.intersection_id,
        status: "NORMAL"
      });

      console.log(`⏰ Prioridad expirada automáticamente en: ${item.intersection_id}. Estado NORMAL emitido.`);
    }
  }
}

/**
 * Mapea un usuario al formato redundante solicitado para compatibilidad total.
 */
function mapUserForFrontend(user) {
  if (!user) return null;
  const raw = user.toObject ? user.toObject() : user;
  const ubicacion = raw.ubicacion || {};

  return {
    ...raw,
    id: raw._id.toString(),
    _id: raw._id.toString(),
    userId: raw._id.toString(),
    uid: raw._id.toString(),

    nombre: raw.nombre,
    name: raw.nombre,
    displayName: raw.nombre,

    rol: raw.rol,
    role: raw.rol,

    lat: ubicacion.lat ?? null,
    lng: ubicacion.lng ?? null,
    latitude: ubicacion.lat ?? null,
    longitude: ubicacion.lng ?? null,

    ubicacion: {
      lat: ubicacion.lat ?? null,
      lng: ubicacion.lng ?? null
    }
  };
}

/**
 * Mapea una alerta al formato redundante.
 */
function mapAlertForFrontend(alert, currentUserId = null) {
  if (!alert) return null;
  const alertObj = alert.toObject ? alert.toObject() : alert;
  const description = alertObj.description || alertObj.mensaje || "Prioridad de paso activada";

  const isRead = currentUserId && alertObj.read_by
    ? alertObj.read_by.some(id => String(id) === String(currentUserId))
    : false;

  let prioridadMapped = "medium";
  const p = String(alertObj.prioridad || "").toLowerCase();
  if (p === "alta" || p === "high") {
    prioridadMapped = "high";
  } else if (p === "critica" || p === "critical") {
    prioridadMapped = "critical";
  } else if (p === "baja" || p === "low") {
    prioridadMapped = "low";
  }

  const ubicacion = alertObj.ubicacion || {};

  return {
    ...alertObj,
    _id: alertObj._id.toString(),
    id: alertObj._id.toString(),
    tipo: alertObj.tipo || "sistema",
    titulo: alertObj.titulo || (
      alertObj.tipo === "ambulancia" ? "¡EMERGENCIA DETECTADA!" :
      (alertObj.tipo === "override" ? "PRIORIDAD DE PASO" : "ALERTA DE SISTEMA")
    ),
    subtitulo: alertObj.subtitulo || (alertObj.intersection_id ? "Intersección: " + alertObj.intersection_id : "Aviso General"),
    mensaje: alertObj.mensaje || description,
    description: description,
    prioridad: prioridadMapped,
    activa: alertObj.activa !== undefined ? alertObj.activa : true,
    is_read: !!isRead,
    timestamp: alertObj.createdAt || alertObj.timestamp || new Date(),
    createdAt: alertObj.createdAt || alertObj.timestamp || new Date(),
    intersection_id: alertObj.intersection_id,

    // Redundancia de ubicación para alertas
    lat: ubicacion.lat ?? null,
    lng: ubicacion.lng ?? null,
    latitude: ubicacion.lat ?? null,
    longitude: ubicacion.lng ?? null,
    ubicacion: {
      lat: ubicacion.lat ?? null,
      lng: ubicacion.lng ?? null
    }
  };
}

async function buildRealtimeIntersectionState() {
  const allLights = await TrafficLight.find({}).lean();

  const latestTraffic = await Traffic.find({})
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();

  const activeOverrides = await SemaphoreOverride.find({
    status: "active",
    expires_at: { $gt: new Date() }
  }).populate("triggered_by", "nombre rol");

  const stateMap = new Map();

  for (const light of allLights) {
    stateMap.set(light.name, {
      intersection_id: light.name,
      name: light.name,
      decision: "NORMAL",
      density: "low",
      vehicle_count: 0,
      pedestrian_count: 0,
      timestamp: light.updatedAt || new Date(),
      override: null,
      lat: light.location?.coordinates ? light.location.coordinates[1] : (light.ubicacion?.lat || null),
      lng: light.location?.coordinates ? light.location.coordinates[0] : (light.ubicacion?.lng || null),
      latitude: light.location?.coordinates ? light.location.coordinates[1] : (light.ubicacion?.lat || null),
      longitude: light.location?.coordinates ? light.location.coordinates[0] : (light.ubicacion?.lng || null),
      is_active: light.is_active
    });
  }

  for (const record of latestTraffic) {
    const existing = stateMap.get(record.intersection_id);
    if (existing) {
      stateMap.set(record.intersection_id, {
        ...existing,
        decision: record.decision || existing.decision,
        density: record.density || existing.density,
        vehicle_count: record.vehicle_count,
        pedestrian_count: record.pedestrian_count,
        timestamp: record.timestamp
      });
    } else {
      stateMap.set(record.intersection_id, {
        intersection_id: record.intersection_id,
        name: record.intersection_id,
        decision: record.decision || null,
        density: record.density || null,
        vehicle_count: record.vehicle_count || 0,
        pedestrian_count: record.pedestrian_count || 0,
        timestamp: record.timestamp,
        override: null,
        lat: record.ubicacion?.lat || null,
        lng: record.ubicacion?.lng || null,
        latitude: record.ubicacion?.lat || null,
        longitude: record.ubicacion?.lng || null,
        is_active: true
      });
    }
  }

  for (const override of activeOverrides) {
    const current = stateMap.get(override.intersection_id) || {
      intersection_id: override.intersection_id,
      name: override.intersection_id,
      decision: null,
      density: null,
      vehicle_count: 0,
      pedestrian_count: 0,
      timestamp: null,
      override: null,
      is_active: true
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
    const userId = req.currentUser._id;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const offlineThreshold = new Date(Date.now() - 10 * 60 * 1000);

    const [
      latestTraffic,
      activeAlerts,
      activeOverrides,
      recentReports,
      users,
      heartbeats,
      recentMessages,
      totalUnreadAlerts
    ] = await Promise.all([
      Traffic.find({}).sort({ timestamp: -1 }).limit(20).lean(),
      Alert.find({ activa: true, read_by: { $ne: userId } }).sort({ createdAt: -1 }).limit(10),
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
        .populate("to_user", "nombre rol"),
      Alert.countDocuments({ activa: true, read_by: { $ne: userId } })
    ]);

    const intersections = await buildRealtimeIntersectionState();
    const onlineDevices = heartbeats.filter((item) => item.last_seen_at > offlineThreshold).length;

    sendSuccess(res, {
      totals: {
        intersections: intersections.length,
        active_alerts: totalUnreadAlerts,
        active_overrides: activeOverrides.length,
        users: users.length,
        online_devices: onlineDevices,
        vialidad_online: users.filter((user) => user.rol === "vialidad" && user.last_seen_at).length,
        ambulancias_online: users.filter((user) => user.rol === "ambulancia" && user.last_seen_at).length
      },
      intersections,
      semaphores: intersections,
      active_alerts: activeAlerts.map(a => mapAlertForFrontend(a, userId)),
      active_overrides: activeOverrides,
      recent_reports: recentReports,
      recent_messages: recentMessages,
      latest_traffic: latestTraffic,
      users_summary: users.map(mapUserForFrontend)
    });
  } catch (error) {
    next(error);
  }
}

async function getVialidadDashboard(req, res, next) {
  try {
    await expireOldOverrides(req.io);
    const currentUserId = req.currentUser._id;

    const [activeAlerts, messages, ownReports, intersections, totalUnreadAlerts] = await Promise.all([
      Alert.find({ activa: true, read_by: { $ne: currentUserId } }).sort({ createdAt: -1 }).limit(20),
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
      buildRealtimeIntersectionState(),
      Alert.countDocuments({ activa: true, read_by: { $ne: currentUserId } })
    ]);

    const unreadMessages = messages.filter((message) =>
      !message.read_by.some((readerId) => String(readerId) === String(currentUserId))
    ).length;

    sendSuccess(res, {
      profile: mapUserForFrontend(req.currentUser),
      counters: {
        active_alerts: totalUnreadAlerts,
        unread_messages: unreadMessages,
        reports_visible: ownReports.length
      },
      active_alerts: activeAlerts.map(a => mapAlertForFrontend(a, currentUserId)),
      messages,
      reports: ownReports,
      intersections,
      semaphores: intersections
    });
  } catch (error) {
    next(error);
  }
}

async function getAmbulanciaDashboard(req, res, next) {
  try {
    await expireOldOverrides(req.io);
    const userId = req.currentUser._id;
    const intersections = await buildRealtimeIntersectionState();

    const [currentOverride, activeAlerts, totalUnreadAlerts] = await Promise.all([
      SemaphoreOverride.findOne({
        triggered_by: userId,
        status: "active",
        expires_at: { $gt: new Date() }
      }).sort({ createdAt: -1 }),
      Alert.find({ activa: true, read_by: { $ne: userId } }).sort({ createdAt: -1 }).limit(5),
      Alert.countDocuments({ activa: true, read_by: { $ne: userId } })
    ]);

    sendSuccess(res, {
      profile: mapUserForFrontend(req.currentUser),
      counters: {
        active_alerts: totalUnreadAlerts
      },
      active_alerts: activeAlerts.map(a => mapAlertForFrontend(a, userId)),
      current_override: currentOverride,
      intersections,
      semaphores: intersections,
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
  mapAlertForFrontend,
  getAdminDashboard,
  getAmbulanciaDashboard,
  getVialidadDashboard
};
