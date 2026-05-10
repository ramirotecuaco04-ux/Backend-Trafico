const User = require("../models/User");
const TrafficLight = require("../models/TrafficLight");
const { sendSuccess } = require("../utils/http");

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

async function updatePresence(req, res, next) {
  try {
    // REPARACIÓN: Extraer lat/lng con soporte para múltiples formatos y nombres (lat, latitude, lng, longitude)
    const lat = req.body.lat ?? req.body.latitude ?? req.body.ubicacion?.lat ?? req.body.ubicacion?.latitude;
    const lng = req.body.lng ?? req.body.longitude ?? req.body.ubicacion?.lng ?? req.body.ubicacion?.longitude;

    const updateData = {
      last_seen_at: new Date()
    };

    // Solo actualizar ubicación si se recibieron valores numéricos válidos
    if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
      updateData["ubicacion.lat"] = Number(lat);
      updateData["ubicacion.lng"] = Number(lng);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.currentUser._id,
      { $set: updateData },
      { new: true }
    );

    // 2. Lógica de Candidatos: Filtrar semáforos estáticos a < 300m
    const allLights = await TrafficLight.find().lean();

    let candidateLights = [];
    const currentLat = updatedUser.ubicacion?.lat;
    const currentLng = updatedUser.ubicacion?.lng;

    if (currentLat != null && currentLng != null) {
      candidateLights = allLights
        .map(light => {
          const lightLat = light.location?.coordinates ? light.location.coordinates[1] : (light.ubicacion?.lat || null);
          const lightLng = light.location?.coordinates ? light.location.coordinates[0] : (light.ubicacion?.lng || null);

          if (lightLat === null || lightLng === null) return null;

          return {
            id: light.name,
            name: light.name,
            lat: lightLat,
            lng: lightLng,
            distance: calculateDistance(currentLat, currentLng, lightLat, lightLng)
          };
        })
        .filter(l => l !== null && l.distance <= 300)
        .sort((a, b) => a.distance - b.distance);
    }

    // 3. Respuesta para Flutter
    sendSuccess(res, {
      status: "online",
      candidates: candidateLights,
      count: candidateLights.length,
      ubicacion: updatedUser.ubicacion // Devolver para confirmación
    });

    // 4. Emisiones Socket.io (Broadcasting para el Centro de Control / Admin)
    if (req.io && currentLat != null && currentLng != null) {
      const positionData = {
        userId: req.currentUser._id,
        lat: currentLat,
        lng: currentLng,
        role: req.currentUser.rol,
        name: req.currentUser.nombre,
        candidates: candidateLights.map(c => c.id)
      };

      // Evento genérico para mapa táctico
      req.io.emit("position_update", positionData);

      // NUEVO: Evento con payload redundante para compatibilidad total con Flutter (SessionController)
      req.io.emit("user_locations_update", {
        // Enviamos todas las formas posibles de ID
        id: req.currentUser._id.toString(),
        _id: req.currentUser._id.toString(),
        userId: req.currentUser._id.toString(),
        uid: req.currentUser._id.toString(),

        // Datos de ubicación
        lat: currentLat,
        lng: currentLng,
        latitude: currentLat,
        longitude: currentLng,

        // Información de perfil
        name: req.currentUser.nombre || req.currentUser.name,
        role: req.currentUser.rol || req.currentUser.role,
        sirenEnabled: req.body.siren_enabled || false
      });

      if (req.currentUser.rol === "ambulancia") {
        req.io.emit("ambulance-position", positionData);
      }

      console.log(`📡 Posición redundante emitida para usuario ${req.currentUser.nombre}`);
    }
  } catch (error) {
    next(error);
  }
}

async function getCurrentSession(req, res, next) {
  try {
    const user = await User.findById(req.currentUser?._id);
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
}

async function syncCurrentUser(req, res, next) {
  try {
    const user = await User.findOneAndUpdate(
      { firebase_uid: req.auth.uid },
      { last_login_at: new Date() },
      { new: true }
    );
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
}

module.exports = { getCurrentSession, syncCurrentUser, updatePresence };
