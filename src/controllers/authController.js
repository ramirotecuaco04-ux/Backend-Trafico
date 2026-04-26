const User = require("../models/User");
const { createHttpError, sendSuccess } = require("../utils/http");
const { normalizeTrimmedString } = require("../utils/validation");

function normalizeSyncPayload(payload = {}) {
  const normalized = {};

  if (payload.nombre !== undefined) {
    normalized.nombre = normalizeTrimmedString(payload.nombre, "nombre");
  }

  if (payload.email !== undefined) {
    normalized.email = normalizeTrimmedString(payload.email, "email", { allowNull: true });
  }

  if (payload.ubicacion !== undefined) {
    normalized.ubicacion = {
      lat: payload.ubicacion?.lat ?? null,
      lng: payload.ubicacion?.lng ?? null
    };
  }

  if (payload.siren_enabled !== undefined) {
    normalized.siren_enabled = Boolean(payload.siren_enabled);
  }

  return normalized;
}

function resolveRoleForUid(uid) {
  if (process.env.FIREBASE_ADMIN_UID && uid === process.env.FIREBASE_ADMIN_UID) {
    return "admin";
  }

  return null;
}

function toSessionUser(user) {
  if (!user) {
    return null;
  }

  return {
    _id: user._id,
    id: user._id,
    nombre: user.nombre,
    name: user.nombre,
    displayName: user.nombre,
    email: user.email,
    rol: user.rol,
    role: user.rol,
    estado: user.estado,
    firebase_uid: user.firebase_uid,
    siren_enabled: user.siren_enabled,
    assigned_intersections: user.assigned_intersections || []
  };
}

async function syncCurrentUser(req, res, next) {
  try {
    const payload = normalizeSyncPayload(req.body);
    const firebaseUid = req.auth.uid;
    const email = payload.email || req.auth.email || null;
    const nombre = payload.nombre || req.auth.name || email || firebaseUid;

    let user = await User.findOne({ firebase_uid: firebaseUid });

    if (!user) {
      const role = resolveRoleForUid(firebaseUid);

      if (!role) {
        throw createHttpError(
          "Usuario no autorizado. Debe ser registrado por un administrador antes de iniciar sesion.",
          403
        );
      }

      user = await User.create({
        firebase_uid: firebaseUid,
        email,
        nombre,
        rol: role,
        ubicacion: payload.ubicacion,
        siren_enabled: payload.siren_enabled || false,
        last_login_at: new Date(),
        last_seen_at: new Date()
      });
    } else {
      // Verificar y actualizar rol en cada login
      const adminRole = resolveRoleForUid(firebaseUid);
      if (adminRole) {
        user.rol = adminRole;
      }
      
      if (payload.nombre !== undefined) user.nombre = nombre;
      if (email !== undefined) user.email = email;
      if (payload.ubicacion !== undefined) user.ubicacion = payload.ubicacion;
      if (payload.siren_enabled !== undefined) user.siren_enabled = payload.siren_enabled;
      user.last_seen_at = new Date();
      if (!user.last_login_at) {
        user.last_login_at = new Date();
      }
      await user.save();
    }

    sendSuccess(res, toSessionUser(user));
  } catch (error) {
    next(error);
  }
}

async function getCurrentSession(req, res, next) {
  try {
    sendSuccess(res, toSessionUser(req.currentUser));
  } catch (error) {
    next(error);
  }
}

async function updatePresence(req, res, next) {
  try {
    if (!req.currentUser) {
      throw new Error("Usuario autenticado no vinculado en backend");
    }

    const payload = normalizeSyncPayload(req.body);

    if (payload.ubicacion !== undefined) {
      req.currentUser.ubicacion = payload.ubicacion;
    }

    if (payload.siren_enabled !== undefined) {
      req.currentUser.siren_enabled = payload.siren_enabled;
    }

    req.currentUser.last_seen_at = new Date();
    await req.currentUser.save();

    sendSuccess(res, toSessionUser(req.currentUser));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCurrentSession,
  syncCurrentUser,
  updatePresence
};
