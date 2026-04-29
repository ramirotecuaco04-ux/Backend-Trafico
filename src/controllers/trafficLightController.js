const TrafficLight = require("../models/TrafficLight");
const SemaphoreOverride = require("../models/SemaphoreOverride");
const { sendSuccess } = require("../utils/http");

async function getAllTrafficLights(req, res, next) {
  try {
    // 1. Obtener la infraestructura estática
    const lights = await TrafficLight.find().lean();

    // 2. Cruzar con estados dinámicos (Overrides activos)
    const activeOverrides = await SemaphoreOverride.find({
      status: "active",
      expires_at: { $gt: new Date() }
    }).lean();

    const response = lights.map(light => {
      try {
        const override = activeOverrides.find(o => o.intersection_id === light.name || o.intersection_id === light._id.toString());

        // Manejo robusto de coordenadas GeoJSON [long, lat]
        let lat = null;
        let lng = null;

        if (light.location && light.location.coordinates) {
          lng = light.location.coordinates[0];
          lat = light.location.coordinates[1];
        } else if (light.ubicacion) {
          lat = light.ubicacion.lat;
          lng = light.ubicacion.lng;
        }

        return {
          id: light._id,
          intersection_id: light.name, // Usamos name como ID de intersección si no hay un campo específico
          name: light.name,
          lat: lat,
          lng: lng,
          status: light.status || "red",
          state: override ? "FORCED_GREEN" : (light.status || "NORMAL"),
          has_priority: !!override
        };
      } catch (itemError) {
        console.error(`Error procesando semáforo ${light._id}:`, itemError);
        return null; // Filtrar después si hay error en un item
      }
    }).filter(item => item !== null);

    sendSuccess(res, response);
  } catch (error) {
    console.error("Error global en getAllTrafficLights:", error);
    next(error);
  }
}

module.exports = { getAllTrafficLights };
