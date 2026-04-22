const User = require("../models/User");
const { getFirebaseAdmin } = require("../config/firebase");
const { createHttpError } = require("../utils/http");

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
}

async function attachFirebaseUser(req, decodedToken) {
  const user = await User.findOne({ firebase_uid: decodedToken.uid });

  req.auth = decodedToken;
  req.currentUser = user || null;
}

async function requireAuth(req, res, next) {
  try {
    const admin = getFirebaseAdmin();

    if (!admin) {
      throw createHttpError("Firebase no esta configurado en el backend", 500);
    }

    const token = getBearerToken(req);

    if (!token) {
      throw createHttpError("Token de autenticacion requerido", 401);
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    await attachFirebaseUser(req, decodedToken);

    next();
  } catch (error) {
    if (!error.status) {
      error.status = 401;
      error.message = "Token de Firebase invalido o expirado";
    }

    next(error);
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.currentUser) {
      return next(createHttpError("Usuario autenticado no vinculado en backend", 403));
    }

    if (!allowedRoles.includes(req.currentUser.rol)) {
      return next(createHttpError("No tienes permisos para esta accion", 403));
    }

    next();
  };
}

function requireJetsonKey(req, res, next) {
  const configuredKey = process.env.JETSON_API_KEY;

  if (!configuredKey) {
    return next(createHttpError("JETSON_API_KEY no configurada en el backend", 500));
  }

  const providedKey = req.headers["x-jetson-key"];

  if (!providedKey || providedKey !== configuredKey) {
    return next(createHttpError("Clave de Jetson invalida", 401));
  }

  next();
}

module.exports = {
  requireAuth,
  requireJetsonKey,
  requireRole
};
