const Traffic = require("../models/Traffic");
const JetsonHeartbeat = require("../models/JetsonHeartbeat");
const { createHttpError, sendSuccess } = require("../utils/http");
const {
  normalizeDate,
  normalizeLimit,
  normalizePage,
  normalizeNonNegativeNumber,
  normalizeSortDirection,
  normalizeTrimmedString,
  validateObjectId
} = require("../utils/validation");

function normalizeTrafficPayload(payload = {}) {
  if (!payload.intersection_id || String(payload.intersection_id).trim().length === 0) {
    throw createHttpError("intersection_id es obligatorio");
  }

  const normalized = {
    intersection_id: String(payload.intersection_id).trim(),
    vehicle_count: normalizeNonNegativeNumber(payload.vehicle_count, "vehicle_count"),
    pedestrian_count: normalizeNonNegativeNumber(payload.pedestrian_count, "pedestrian_count")
  };

  // Soporte para inyectar ubicación (lat/lng)
  if (payload.lat !== undefined && payload.lng !== undefined) {
    normalized.ubicacion = {
      lat: Number(payload.lat),
      lng: Number(payload.lng)
    };
  } else if (payload.ubicacion) {
    normalized.ubicacion = {
      lat: Number(payload.ubicacion.lat),
      lng: Number(payload.ubicacion.lng)
    };
  }

  const density = normalizeTrimmedString(payload.density, "density");
  const decision = normalizeTrimmedString(payload.decision, "decision");
  const cameraId = normalizeTrimmedString(payload.camera_id, "camera_id");
  const timestamp = normalizeDate(payload.timestamp, "timestamp");

  if (density !== undefined) normalized.density = density;
  if (decision !== undefined) normalized.decision = decision;
  if (cameraId !== undefined) normalized.camera_id = cameraId;
  if (timestamp !== undefined) normalized.timestamp = timestamp;

  return normalized;
}

function emitTraffic(io, record) {
  if (!io) {
    return;
  }

  io.emit("new_traffic", record);
  io.emit("traffic-decision", {
    intersection: record.intersection_id,
    decision: record.decision || null,
    vehicles: record.vehicle_count,
    pedestrians: record.pedestrian_count,
    density: record.density,
    camera_id: record.camera_id,
    timestamp: record.timestamp,
    // Enviamos lat/lng en el evento de Socket.io también
    lat: record.ubicacion?.lat || null,
    lng: record.ubicacion?.lng || null
  });
}

async function createTraffic(req, res, next) {
  try {
    const payload = normalizeTrafficPayload(req.body);
    const saved = await Traffic.create(payload);

    emitTraffic(req.io, saved);
    sendSuccess(res, saved, { event_emitted: true }, 201);
  } catch (error) {
    next(error);
  }
}

// ... resto de funciones (listTraffic, getTrafficById, getTrafficSummary, etc) se mantienen igual ...
async function listTraffic(req, res, next) {
  try {
    const limit = normalizeLimit(req.query.limit);
    const page = normalizePage(req.query.page);
    const sortDirection = normalizeSortDirection(req.query.sort);
    const skip = (page - 1) * limit;
    const query = {};
    const startDate = normalizeDate(req.query.start_date, "start_date");
    const endDate = normalizeDate(req.query.end_date, "end_date");

    if (req.query.intersection_id) {
      query.intersection_id = String(req.query.intersection_id).trim();
    }

    if (req.query.camera_id) {
      query.camera_id = String(req.query.camera_id).trim();
    }

    if (req.query.decision) {
      query.decision = String(req.query.decision).trim();
    }

    if (req.query.density) {
      query.density = String(req.query.density).trim();
    }

    if (startDate || endDate) {
      query.timestamp = {};

      if (startDate) {
        query.timestamp.$gte = startDate;
      }

      if (endDate) {
        query.timestamp.$lte = endDate;
      }
    }

    const [records, total] = await Promise.all([
      Traffic.find(query).sort({ timestamp: sortDirection }).skip(skip).limit(limit),
      Traffic.countDocuments(query)
    ]);

    sendSuccess(res, records, {
      count: records.length,
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    next(error);
  }
}

async function getTrafficById(req, res, next) {
  try {
    validateObjectId(req.params.id, "traffic id");
    const record = await Traffic.findById(req.params.id);

    if (!record) {
      throw createHttpError("Registro de trafico no encontrado", 404);
    }

    sendSuccess(res, record);
  } catch (error) {
    next(error);
  }
}

async function getTrafficSummary(req, res, next) {
  try {
    const sampleLimit = normalizeLimit(req.query.limit, 100, 500);
    const records = await Traffic.find({})
      .sort({ timestamp: -1 })
      .limit(sampleLimit)
      .lean();

    const latestByIntersection = new Map();
    let totalVehicles = 0;
    let totalPedestrians = 0;

    for (const record of records) {
      totalVehicles += record.vehicle_count || 0;
      totalPedestrians += record.pedestrian_count || 0;

      if (!latestByIntersection.has(record.intersection_id)) {
        latestByIntersection.set(record.intersection_id, {
          intersection_id: record.intersection_id,
          vehicle_count: record.vehicle_count || 0,
          pedestrian_count: record.pedestrian_count || 0,
          density: record.density || null,
          decision: record.decision || null,
          camera_id: record.camera_id || null,
          timestamp: record.timestamp,
          lat: record.ubicacion?.lat || null,
          lng: record.ubicacion?.lng || null
        });
      }
    }

    sendSuccess(res, {
      generated_at: new Date(),
      sample_size: records.length,
      totals: {
        vehicles: totalVehicles,
        pedestrians: totalPedestrians,
        intersections: latestByIntersection.size
      },
      by_intersection: Array.from(latestByIntersection.values())
    });
  } catch (error) {
    next(error);
  }
}

async function getTrafficMetrics(req, res, next) {
  try {
    const rangeHours = normalizeLimit(req.query.hours, 24, 24 * 30);
    const startDate = new Date(Date.now() - rangeHours * 60 * 60 * 1000);

    const records = await Traffic.find({ timestamp: { $gte: startDate } })
      .sort({ timestamp: -1 })
      .lean();

    const byIntersection = new Map();
    const byHour = new Map();
    let totalVehicles = 0;
    let totalPedestrians = 0;

    for (const record of records) {
      totalVehicles += record.vehicle_count || 0;
      totalPedestrians += record.pedestrian_count || 0;

      const currentIntersection = byIntersection.get(record.intersection_id) || {
        intersection_id: record.intersection_id,
        records: 0,
        total_vehicles: 0,
        total_pedestrians: 0,
        latest_density: null,
        latest_decision: null,
        last_seen_at: null,
        lat: record.ubicacion?.lat || null,
        lng: record.ubicacion?.lng || null
      };

      currentIntersection.records += 1;
      currentIntersection.total_vehicles += record.vehicle_count || 0;
      currentIntersection.total_pedestrians += record.pedestrian_count || 0;

      if (!currentIntersection.last_seen_at || new Date(record.timestamp) > new Date(currentIntersection.last_seen_at)) {
        currentIntersection.latest_density = record.density || null;
        currentIntersection.latest_decision = record.decision || null;
        currentIntersection.last_seen_at = record.timestamp;
      }

      byIntersection.set(record.intersection_id, currentIntersection);

      const hourKey = new Date(record.timestamp).toISOString().slice(0, 13) + ":00:00.000Z";
      const currentHour = byHour.get(hourKey) || {
        hour: hourKey,
        vehicles: 0,
        pedestrians: 0,
        records: 0
      };

      currentHour.vehicles += record.vehicle_count || 0;
      currentHour.pedestrians += record.pedestrian_count || 0;
      currentHour.records += 1;
      byHour.set(hourKey, currentHour);
    }

    const topIntersections = Array.from(byIntersection.values())
      .sort((a, b) => b.total_vehicles - a.total_vehicles)
      .slice(0, 5);

    const hourlySeries = Array.from(byHour.values()).sort((a, b) => a.hour.localeCompare(b.hour));

    sendSuccess(res, {
      generated_at: new Date(),
      range_hours: rangeHours,
      totals: {
        records: records.length,
        vehicles: totalVehicles,
        pedestrians: totalPedestrians,
        intersections: byIntersection.size,
        avg_vehicles_per_record: records.length ? Number((totalVehicles / records.length).toFixed(2)) : 0,
        avg_pedestrians_per_record: records.length ? Number((totalPedestrians / records.length).toFixed(2)) : 0
      },
      top_intersections: topIntersections,
      hourly_series: hourlySeries
    });
  } catch (error) {
    next(error);
  }
}

async function registerJetsonHeartbeat(req, res, next) {
  try {
    const deviceId = normalizeTrimmedString(req.body.device_id, "device_id", { required: true });
    const cameraId = normalizeTrimmedString(req.body.camera_id, "camera_id", { allowNull: true });
    const intersectionId = normalizeTrimmedString(req.body.intersection_id, "intersection_id", { allowNull: true });
    const status = normalizeTrimmedString(req.body.status, "status") || "online";
    const ipAddress = normalizeTrimmedString(req.body.ip_address, "ip_address", { allowNull: true });

    const heartbeat = await JetsonHeartbeat.findOneAndUpdate(
      { device_id: deviceId },
      {
        device_id: deviceId,
        camera_id: cameraId === undefined ? null : cameraId,
        intersection_id: intersectionId === undefined ? null : intersectionId,
        status,
        ip_address: ipAddress === undefined ? null : ipAddress,
        last_seen_at: new Date(),
        metadata: req.body.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    );

    if (req.io) {
      req.io.emit("jetson-heartbeat", heartbeat);
    }

    sendSuccess(res, heartbeat, { event_emitted: true }, 201);
  } catch (error) {
    next(error);
  }
}

async function getJetsonHeartbeats(req, res, next) {
  try {
    const offlineAfterMinutes = normalizeLimit(req.query.offline_after_minutes, 10, 24 * 60);
    const threshold = new Date(Date.now() - offlineAfterMinutes * 60 * 1000);
    const limit = normalizeLimit(req.query.limit, 50, 200);
    const page = normalizePage(req.query.page);
    const skip = (page - 1) * limit;
    const query = {};

    if (req.query.device_id) {
      query.device_id = String(req.query.device_id).trim();
    }

    if (req.query.intersection_id) {
      query.intersection_id = String(req.query.intersection_id).trim();
    }

    if (req.query.camera_id) {
      query.camera_id = String(req.query.camera_id).trim();
    }

    const [heartbeats, total] = await Promise.all([
      JetsonHeartbeat.find(query).sort({ last_seen_at: -1 }).skip(skip).limit(limit).lean(),
      JetsonHeartbeat.countDocuments(query)
    ]);

    const normalized = heartbeats.map((heartbeat) => ({
      ...heartbeat,
      computed_status: heartbeat.last_seen_at < threshold ? "offline" : heartbeat.status || "online"
    }));

    sendSuccess(res, normalized, {
      count: normalized.length,
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      offline_after_minutes: offlineAfterMinutes
    });
  } catch (error) {
    next(error);
  }
}

async function getJetsonHeartbeatById(req, res, next) {
  try {
    validateObjectId(req.params.id, "heartbeat id");
    const offlineAfterMinutes = normalizeLimit(req.query.offline_after_minutes, 10, 24 * 60);
    const threshold = new Date(Date.now() - offlineAfterMinutes * 60 * 1000);
    const heartbeat = await JetsonHeartbeat.findById(req.params.id).lean();

    if (!heartbeat) {
      throw createHttpError("Heartbeat no encontrado", 404);
    }

    sendSuccess(res, {
      ...heartbeat,
      computed_status: heartbeat.last_seen_at < threshold ? "offline" : heartbeat.status || "online"
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createTraffic,
  getJetsonHeartbeatById,
  getJetsonHeartbeats,
  getTrafficById,
  getTrafficMetrics,
  getTrafficSummary,
  listTraffic,
  registerJetsonHeartbeat
};
