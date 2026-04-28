const TrafficLight = require("../models/TrafficLight");
const SemaphoreOverride = require("../models/SemaphoreOverride");
const { sendSuccess } = require("../utils/http");

async function getAllTrafficLights(req, res, next) {
  try {
    // 1. Obtener los semáforos (usando el formato GeoJSON de tu imagen)
    const lights = await TrafficLight.find().lean();

    // 2. Obtener overrides activos
    const activeOverrides = await SemaphoreOverride.find({ status: "active" }).lean();

    const response = lights.map(light => {
      // En GeoJSON: coordinates[0] es LNG, coordinates[1] es LAT
      const lng = light.location?.coordinates?.[0] || null;
      const lat = light.location?.coordinates?.[1] || null;

      // Buscamos si este semáforo tiene prioridad activa
      // Usamos el _id o el name como identificador según tu imagen
      const override = activeOverrides.find(o => o.intersection_id === String(light._id));

      return {
        id: String(light._id),
        name: light.name || "Semáforo sin nombre",
        lat: lat,
        lng: lng,
        state: override ? "FORCED_GREEN" : (light.status || "red").toUpperCase(),
        is_priority: !!override,
        is_active: light.is_active
      };
    });

    sendSuccess(res, response);
  } catch (error) {
    next(error);
  }
}

module.exports = { getAllTrafficLights };
