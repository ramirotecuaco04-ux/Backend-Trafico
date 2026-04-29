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
    const { lat, lng } = req.body;

    // 1. Persistir ubicación dinámica
    await User.findByIdAndUpdate(req.currentUser._id, {
      "ubicacion.lat": lat,
      "ubicacion.lng": lng,
      last_seen_at: new Date()
    });

    // 2. Lógica de Candidatos: Filtrar semáforos estáticos a < 300m
    const allLights = await TrafficLight.find({ is_active: true }).lean();
    const candidateLights = allLights
      .map(light => {
        // Extraer coordenadas de GeoJSON o usar ubicacion opcional si existe (compatibilidad)
        const lightLat = light.location?.coordinates ? light.location.coordinates[1] : (light.ubicacion?.lat || null);
        const lightLng = light.location?.coordinates ? light.location.coordinates[0] : (light.ubicacion?.lng || null);

        if (lat === undefined || lng === undefined || lightLat === null || lightLng === null) {
          return null;
        }

        return {
          id: light.name,
          name: light.name,
          lat: lightLat,
          lng: lightLng,
          distance: calculateDistance(lat, lng, lightLat, lightLng)
        };
      })
      .filter(l => l !== null && l.distance <= 300)
      .sort((a, b) => a.distance - b.distance);

    // 3. Respuesta para Flutter (para activar OnTap y cambios de icono)
    sendSuccess(res, {
      status: "online",
      candidates: candidateLights,
      count: candidateLights.length
    });

    // 4. Emitir a otros (Centro de Control)
    if (req.io) {
      req.io.emit("ambulance-position", {
        userId: req.currentUser._id,
        lat,
        lng,
        candidates: candidateLights.map(c => c.id)
      });
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
