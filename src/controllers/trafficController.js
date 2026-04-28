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
  if (!io) return;
  io.emit("new_traffic", record);
  io.emit("traffic-decision", {
    intersection: record.intersection_id,
    decision: record.decision || null,
    vehicles: record.vehicle_count,
    pedestrians: record.pedestrian_count,
    density: record.density,
    camera_id: record.camera_id,
    timestamp: record.timestamp,
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

async function listTraffic(req, res, next) {
  try {
    const limit = normalizeLimit(req.query.limit);
    const page = normalizePage(req.query.page);
    const sortDirection = normalizeSortDirection(req.query.sort);
    const skip = (page - 1) * limit;
    const query = {};
    const startDate = normalizeDate(req.query.start_date, "start_date");
    const endDate = normalizeDate(req.query.end_date, "end_date");

    if (req.query.intersection_id) query.intersection_id = String(req.query.intersection_id).trim();
    if (req.query.camera_id) query.camera_id = String(req.query.camera_id).trim();
    if (req.query.decision) query.decision = String(req.query.decision).trim();
    if (req.query.density) query.density = String(req.query.density).trim();

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }

    const [records, total] = await Promise.all([
      Traffic.find(query).sort({ timestamp: sortDirection }).skip(skip).limit(limit),
      Traffic.countDocuments(query)
    ]);

    sendSuccess(res, records, { count: records.length, total, page, limit });
  } catch (error) {
    next(error);
  }
}

async function getTrafficById(req, res, next) {
  try {
    validateObjectId(req.params.id, "traffic id");
    const record = await Traffic.findById(req.params.id);
    if (!record) throw createHttpError("Registro de trafico no encontrado", 404);
    sendSuccess(res, record);
  } catch (error) {
    next(error);
  }
}

async function getTrafficSummary(req, res, next) {
  try {
    const records = await Traffic.find({}).sort({ timestamp: -1 }).limit(100).lean();
    const latestByIntersection = new Map();
    for (const record of records) {
      if (!latestByIntersection.has(record.intersection_id)) {
        latestByIntersection.set(record.intersection_id, {
          ...record,
          lat: record.ubicacion?.lat || null,
          lng: record.ubicacion?.lng || null
        });
      }
    }
    sendSuccess(res, { by_intersection: Array.from(latestByIntersection.values()) });
  } catch (error) {
    next(error);
  }
}

async function getTrafficMetrics(req, res, next) {
  try {
    const rangeHours = normalizeLimit(req.query.hours, 24, 24 * 30);
    const startDate = new Date(Date.now() - rangeHours * 60 * 60 * 1000);
    const records = await Traffic.find({ timestamp: { $gte: startDate } }).lean();
    sendSuccess(res, { total_records: records.length });
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
    const streamUrl = normalizeTrimmedString(req.body.stream_url, "stream_url", { allowNull: true });

    const heartbeat = await JetsonHeartbeat.findOneAndUpdate(
      { device_id: deviceId },
      {
        device_id: deviceId,
        camera_id: cameraId || null,
        intersection_id: intersectionId || null,
        status,
        ip_address: ipAddress || null,
        stream_url: streamUrl || null, // Guardamos la URL de Ngrok
        last_seen_at: new Date(),
        metadata: req.body.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
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
    const heartbeats = await JetsonHeartbeat.find({}).sort({ last_seen_at: -1 }).lean();
    sendSuccess(res, heartbeats);
  } catch (error) {
    next(error);
  }
}

async function getJetsonHeartbeatById(req, res, next) {
  try {
    validateObjectId(req.params.id, "heartbeat id");
    const heartbeat = await JetsonHeartbeat.findById(req.params.id).lean();
    if (!heartbeat) throw createHttpError("Heartbeat no encontrado", 404);
    sendSuccess(res, heartbeat);
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
