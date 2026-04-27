const User = require("../models/User");
const { createHttpError, sendSuccess } = require("../utils/http");
const { getFirebaseAdmin } = require("../config/firebase");
const {
  normalizeLimit,
  normalizePage,
  normalizeSortDirection,
  normalizeTrimmedString,
  validateObjectId
} = require("../utils/validation");

function toUserResponse(user) {
  if (!user) {
    return user;
  }

  const raw = typeof user.toObject === "function" ? user.toObject() : { ...user };
  return {
    ...raw,
    id: raw._id,
    name: raw.nombre || "",
    displayName: raw.nombre || "",
    role: raw.rol || "",
    // Mapeo explícito para Flutter
    lat: raw.ubicacion?.lat || null,
    lng: raw.ubicacion?.lng || null
  };
}

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

  if (payload.password !== undefined) {
    normalized.password = normalizeTrimmedString(payload.password, "password", { required: !partial });
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

  // Soporte para ubicación (lat/lng)
  if (payload.ubicacion !== undefined || payload.lat !== undefined || payload.lng !== undefined) {
    const lat = payload.ubicacion?.lat ?? payload.lat;
    const lng = payload.ubicacion?.lng ?? payload.lng;

    normalized.ubicacion = {
      lat: lat !== undefined ? Number(lat) : null,
      lng: lng !== undefined ? Number(lng) : null
    };
  }

  return normalized;
}

async function createUser(req, res, next) {
  try {
    const payload = normalizeUserPayload(req.body);
    
    if (!payload.email) {
      throw createHttpError("Correo es obligatorio", 400);
    }
    
    if (!payload.password) {
      throw createHttpError("Contraseña es obligatoria", 400);
    }

    const admin = getFirebaseAdmin();
    if (!admin) {
      throw createHttpError("Firebase no esta configurado en el backend", 500);
    }

    let firebaseUid;
    try {
      const userRecord = await admin.auth().createUser({
        email: payload.email,
        password: payload.password,
        displayName: payload.nombre
      });
      firebaseUid = userRecord.uid;
    } catch (firebaseError) {
      if (firebaseError.code === 'auth/email-already-exists') {
        throw createHttpError("El correo ya está registrado en Firebase", 400);
      }
      throw createHttpError(`Error en Firebase: ${firebaseError.message}`, 400);
    }

    const userData = {
      ...payload,
      firebase_uid: firebaseUid,
      estado: "activo",
      siren_enabled: false
    };

    const user = await User.create(userData);
    sendSuccess(res, toUserResponse(user), undefined, 201);
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

    sendSuccess(res, users.map(toUserResponse), {
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

    sendSuccess(res, toUserResponse(user));
  } catch (error) {
    next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    validateObjectId(req.params.id, "user id");
    
    const currentUser = await User.findById(req.params.id);
    if (!currentUser) {
      throw createHttpError("Usuario no encontrado", 404);
    }

    if (req.body.password && currentUser.firebase_uid) {
      try {
        const admin = getFirebaseAdmin();
        if (admin) {
          await admin.auth().updateUser(currentUser.firebase_uid, {
            password: req.body.password
          });
        }
      } catch (firebaseError) {
        throw createHttpError(`Error actualizando contraseña en Firebase: ${firebaseError.message}`, 400);
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      normalizeUserPayload(req.body, { partial: true }),
      { new: true, runValidators: true }
    );

    sendSuccess(res, toUserResponse(user));
  } catch (error) {
    next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    validateObjectId(req.params.id, "user id");
    const user = await User.findById(req.params.id);

    if (!user) {
      throw createHttpError("Usuario no encontrado", 404);
    }

    if (user.firebase_uid) {
      try {
        const admin = getFirebaseAdmin();
        if (admin) {
          await admin.auth().deleteUser(user.firebase_uid);
        }
      } catch (firebaseError) {
        console.warn(`No se pudo eliminar de Firebase: ${firebaseError.message}`);
      }
    }

    await User.findByIdAndDelete(req.params.id);

    sendSuccess(res, {
      deleted: true,
      user_id: req.params.id,
      firebase_uid: user.firebase_uid
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
