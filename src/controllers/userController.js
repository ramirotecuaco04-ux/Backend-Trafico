const User = require("../models/User");
const { createHttpError, sendSuccess } = require("../utils/http");
const {
  normalizeLimit,
  normalizePage,
  normalizeSortDirection,
  normalizeTrimmedString,
  validateObjectId
} = require("../utils/validation");

function normalizeUserPayload(payload = {}, { partial = false } = {}) {
  const normalized = {};

  if (!partial || payload.nombre !== undefined) {
    normalized.nombre = normalizeTrimmedString(payload.nombre, "nombre", { required: true });
  }

  if (payload.email !== undefined) {
    normalized.email = payload.email
      ? normalizeTrimmedString(payload.email, "email")
      : null;
  }

  if (payload.firebase_uid !== undefined) {
    normalized.firebase_uid = payload.firebase_uid
      ? normalizeTrimmedString(payload.firebase_uid, "firebase_uid")
      : null;
  }

  if (!partial || payload.rol !== undefined) {
    normalized.rol = normalizeTrimmedString(payload.rol, "rol", { required: true });
  }

  if (payload.estado !== undefined) {
    normalized.estado = String(payload.estado).trim();
  }

  if (payload.siren_enabled !== undefined) {
    normalized.siren_enabled = Boolean(payload.siren_enabled);
  }

  if (payload.assigned_intersections !== undefined) {
    normalized.assigned_intersections = Array.isArray(payload.assigned_intersections)
      ? payload.assigned_intersections
        .map((item) => String(item || "").trim())
        .filter(Boolean)
      : [];
  }

  if (payload.ubicacion !== undefined) {
    normalized.ubicacion = {
      lat: payload.ubicacion?.lat ?? null,
      lng: payload.ubicacion?.lng ?? null
    };
  }

  return normalized;
}

async function createUser(req, res, next) {
  try {
    const user = await User.create(normalizeUserPayload(req.body));
    sendSuccess(res, user, undefined, 201);
  } catch (error) {
    next(error);
  }
}

async function getUsers(req, res, next) {
  try {
    const limit = normalizeLimit(req.query.limit);
    const page = normalizePage(req.query.page);
    const sortDirection = normalizeSortDirection(req.query.sort);
    const skip = (page - 1) * limit;
    const query = {};

    if (req.query.rol) {
      query.rol = String(req.query.rol).trim();
    }

    if (req.query.estado) {
      query.estado = String(req.query.estado).trim();
    }

    if (req.query.nombre) {
      query.nombre = { $regex: String(req.query.nombre).trim(), $options: "i" };
    }

    if (req.query.firebase_uid) {
      query.firebase_uid = String(req.query.firebase_uid).trim();
    }

    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: sortDirection }).skip(skip).limit(limit),
      User.countDocuments(query)
    ]);

    sendSuccess(res, users, {
      count: users.length,
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    next(error);
  }
}

async function getUserById(req, res, next) {
  try {
    validateObjectId(req.params.id, "user id");
    const user = await User.findById(req.params.id);

    if (!user) {
      throw createHttpError("Usuario no encontrado", 404);
    }

    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      normalizeUserPayload(req.body, { partial: true }),
      { new: true, runValidators: true }
    );

    if (!user) {
      throw createHttpError("Usuario no encontrado", 404);
    }

    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    validateObjectId(req.params.id, "user id");
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      throw createHttpError("Usuario no encontrado", 404);
    }

    sendSuccess(res, {
      deleted: true,
      user_id: req.params.id
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createUser,
  deleteUser,
  getUserById,
  getUsers,
  updateUser
};
