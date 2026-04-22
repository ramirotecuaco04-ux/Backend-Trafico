const SemaphoreOverride = require("../models/SemaphoreOverride");
const Traffic = require("../models/Traffic");
const { expireOldOverrides } = require("./dashboardController");
const { createHttpError, sendSuccess } = require("../utils/http");
const {
  normalizeBoolean,
  normalizeLimit,
  normalizePage,
  normalizeSortDirection,
  normalizeTrimmedString,
  validateObjectId
} = require("../utils/validation");

function buildOverrideState(record) {
  return {
    intersection_id: record.intersection_id,
    state: "OVERRIDE_GREEN",
    road_name: record.road_name,
    triggered_by: record.triggered_by,
    trigger_role: record.trigger_role,
    siren_enabled: record.siren_enabled,
    detected_by_jetson: record.detected_by_jetson,
    activated_at: record.activated_at,
    expires_at: record.expires_at,
    release_reason: record.release_reason || null
  };
}

async function activateSemaphoreOverride(req, res, next) {
  try {
    const intersectionId = normalizeTrimmedString(req.body.intersection_id, "intersection_id", { required: true });
    const roadName = normalizeTrimmedString(req.body.road_name, "road_name", { allowNull: true }) || null;
    const sirenEnabled = normalizeBoolean(req.body.siren_enabled, "siren_enabled");
    const detectedByJetson = normalizeBoolean(req.body.detected_by_jetson, "detected_by_jetson") || false;
    const forceGreenDuration = req.body.force_green_duration_seconds
      ? Math.min(Math.max(Number(req.body.force_green_duration_seconds), 5), 120)
      : 15;

    if (!sirenEnabled) {
      throw createHttpError("La ambulancia debe tener la sirena encendida para activar prioridad", 400);
    }

    if (req.currentUser.rol !== "admin" && req.currentUser.rol !== "ambulancia") {
      throw createHttpError("Solo admin o ambulancia pueden activar prioridad", 403);
    }

    const activeOverride = await SemaphoreOverride.findOne({
      intersection_id: intersectionId,
      status: "active",
      expires_at: { $gt: new Date() }
    });

    if (activeOverride) {
      throw createHttpError("Ya existe un override activo para esta interseccion", 409);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + forceGreenDuration * 1000);

    const override = await SemaphoreOverride.create({
      intersection_id: intersectionId,
      road_name: roadName,
      triggered_by: req.currentUser._id,
      trigger_role: req.currentUser.rol === "admin" ? "admin" : "ambulancia",
      siren_enabled: sirenEnabled,
      detected_by_jetson: detectedByJetson,
      force_green_duration_seconds: forceGreenDuration,
      activated_at: now,
      expires_at: expiresAt
    });

    const populated = await SemaphoreOverride.findById(override._id).populate("triggered_by", "nombre rol");

    if (req.io) {
      req.io.emit("semaphore-override", {
        type: "activated",
        override: buildOverrideState(populated)
      });
    }

    sendSuccess(res, populated, { event_emitted: true }, 201);
  } catch (error) {
    next(error);
  }
}

async function releaseSemaphoreOverride(req, res, next) {
  try {
    validateObjectId(req.params.id, "override id");
    const override = await SemaphoreOverride.findById(req.params.id);

    if (!override) {
      throw createHttpError("Override no encontrado", 404);
    }

    if (override.status !== "active") {
      throw createHttpError("El override ya no esta activo", 409);
    }

    override.status = "released";
    override.released_at = new Date();
    override.release_reason = normalizeTrimmedString(req.body.release_reason, "release_reason") || "manual_release";
    await override.save();

    const populated = await SemaphoreOverride.findById(override._id).populate("triggered_by", "nombre rol");

    if (req.io) {
      req.io.emit("semaphore-override", {
        type: "released",
        override: buildOverrideState(populated)
      });
    }

    sendSuccess(res, populated, { event_emitted: true });
  } catch (error) {
    next(error);
  }
}

async function getSemaphoreOverrides(req, res, next) {
  try {
    await expireOldOverrides(req.io);
    const limit = normalizeLimit(req.query.limit);
    const page = normalizePage(req.query.page);
    const sortDirection = normalizeSortDirection(req.query.sort);
    const skip = (page - 1) * limit;
    const query = {};

    if (req.query.intersection_id) {
      query.intersection_id = String(req.query.intersection_id).trim();
    }

    if (req.query.status) {
      query.status = String(req.query.status).trim();
    }

    const [overrides, total] = await Promise.all([
      SemaphoreOverride.find(query)
        .populate("triggered_by", "nombre rol")
        .sort({ createdAt: sortDirection })
        .skip(skip)
        .limit(limit),
      SemaphoreOverride.countDocuments(query)
    ]);

    sendSuccess(res, overrides, {
      count: overrides.length,
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    next(error);
  }
}

async function getRealtimeSemaphoreState(req, res, next) {
  try {
    await expireOldOverrides(req.io);
    const latestTraffic = await Traffic.find({})
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    const activeOverrides = await SemaphoreOverride.find({
      status: "active",
      expires_at: { $gt: new Date() }
    }).populate("triggered_by", "nombre rol");

    const stateMap = new Map();

    for (const record of latestTraffic) {
      if (!stateMap.has(record.intersection_id)) {
        stateMap.set(record.intersection_id, {
          intersection_id: record.intersection_id,
          decision: record.decision || null,
          density: record.density || null,
          vehicle_count: record.vehicle_count || 0,
          pedestrian_count: record.pedestrian_count || 0,
          timestamp: record.timestamp,
          override: null
        });
      }
    }

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

      current.override = buildOverrideState(override);
      current.decision = "FORCED_GREEN";
      stateMap.set(override.intersection_id, current);
    }

    sendSuccess(res, Array.from(stateMap.values()));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  activateSemaphoreOverride,
  getRealtimeSemaphoreState,
  getSemaphoreOverrides,
  releaseSemaphoreOverride
};
