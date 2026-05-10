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

    // Desactivar alertas asociadas a la expiración automática
    await Alert.updateMany({ intersection_id: item.intersection_id, activa: true }, { activa: false });

    if (io) {
      // 1. Notificación detallada de expiración
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

      // 2. Evento global solicitado para limpiar el estado FORCED_GREEN en el mapa del Admin
      io.emit("emergency-override-released", {
        intersection_id: item.intersection_id,
        status: "NORMAL"
      });

      console.log(`⏰ Prioridad expirada automáticamente en: ${item.intersection_id}. Estado NORMAL emitido.`);
    }
  }
}

/**
 * Mapea una alerta del modelo de base de datos al formato esperado por el Frontend (Flutter)
 * Genera dinámicamente titulo, subtitulo y description para evitar "Sin descripción".
 */
function mapAlertForFrontend(alert, currentUserId = null) {
  const alertObj = alert.toObject ? alert.toObject() : alert;
  const description = alertObj.description || alertObj.mensaje || "Prioridad de paso activada";

  // Calculamos is_read basándonos en si el ID del usuario está en el arreglo read_by
  // Si no hay currentUserId o no hay read_by, por defecto es false (no leída).
  const isRead = currentUserId && alertObj.read_by
    ? alertObj.read_by.some(id => String(id) === String(currentUserId))
    : false;

  return {
    id: alertObj._id.toString(),
    tipo: alertObj.tipo || "sistema",
    titulo: alertObj.titulo || (
      alertObj.tipo === "ambulancia" ? "¡EMERGENCIA DETECTADA!" :
      (alertObj.tipo === "override" ? "PRIORIDAD DE PASO" : "ALERTA DE SISTEMA")
    ),
    subtitulo: alertObj.subtitulo || (alertObj.intersection_id ? "Intersección: " + alertObj.intersection_id : "Aviso General"),
    mensaje: alertObj.mensaje || description,
    description: description, // Campo clave para el feed de Flutter (¡Evita 'Sin descripción'!)
    prioridad: alertObj.prioridad === "alta" ? "high" : (alertObj.prioridad === "baja" ? "low" : "medium"),
    activa: alertObj.activa !== undefined ? alertObj.activa : true,
    is_read: !!isRead,
    timestamp: alertObj.createdAt
  };
}

async function buildRealtimeIntersectionState() {
  // 1. Obtener todos los semáforos registrados (Infraestructura base)
  const allLights = await TrafficLight.find({}).lean();

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
      name: light.name,
      decision: "NORMAL",
      density: "low",
      vehicle_count: 0,
      pedestrian_count: 0,
      timestamp: light.updatedAt || new Date(),
      override: null,
      lat: light.location?.coordinates ? light.location.coordinates[1] : null,
      lng: light.location?.coordinates ? light.location.coordinates[0] : null,
      is_active: light.is_active
    });
  }

  // Actualizar con datos de tráfico reales si existen
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
        is_active: true
      });
    }
  }

  // Aplicar Overrides (Prioridad máxima)
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
      // Muestra solo las 10 más recientes para la lista
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
      // Contador real sin límite (ESTO ES LO QUE EL FRONTEND NECESITA)
      Alert.countDocuments({ activa: true, read_by: { $ne: userId } })
    ]);

    const intersections = await buildRealtimeIntersectionState();
    const onlineDevices = heartbeats.filter((item) => item.last_seen_at > offlineThreshold).length;

    sendSuccess(res, {
      totals: {
        intersections: intersections.length,
        active_alerts: totalUnreadAlerts, // Conteo real y persistente
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

    const [activeAlerts, messages, ownReports, intersections, totalUnreadAlerts] = await Promise.all([
      // Lista de alerts recientes
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
      profile: {
        _id: req.currentUser._id,
        nombre: req.currentUser.nombre,
        rol: req.currentUser.rol,
        ubicacion: req.currentUser.ubicacion || null,
        assigned_intersections: req.currentUser.assigned_intersections || []
      },
      counters: {
        active_alerts: totalUnreadAlerts, // Conteo real y persistente
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
      // Solo alertas no leídas por el usuario actual
      Alert.find({ activa: true, read_by: { $ne: userId } }).sort({ createdAt: -1 }).limit(5),
      Alert.countDocuments({ activa: true, read_by: { $ne: userId } })
    ]);

    sendSuccess(res, {
      profile: {
        _id: req.currentUser._id,
        nombre: req.currentUser.nombre,
        rol: req.currentUser.rol,
        siren_enabled: req.currentUser.siren_enabled,
        ubicacion: req.currentUser.ubicacion || null,
        assigned_intersections: req.currentUser.assigned_intersections || []
      },
      counters: {
        active_alerts: totalUnreadAlerts // Conteo real y persistente
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
  getAdminDashboard,
  getAmbulanciaDashboard,
  getVialidadDashboard
};
