const TrafficLight = require("../models/TrafficLight");
const SemaphoreOverride = require("../models/SemaphoreOverride");
const { sendSuccess } = require("../utils/http");

async function getAllTrafficLights(req, res, next) {
  try {
    // 1. Obtener la infraestructura estática
    const lights = await TrafficLight.find().lean();

    // 2. Cruzar con estados dinámicos (Overrides activos)
    const activeOverrides = await SemaphoreOverride.find({ status: "active" });

    const response = lights.map(light => {
      const override = activeOverrides.find(o => o.intersection_id === light.intersection_id);
      return {
        id: light.intersection_id,
        name: light.nombre,
        lat: light.ubicacion.lat,
        lng: light.ubicacion.lng,
        state: override ? "FORCED_GREEN" : light.estado_actual,
        has_priority: !!override
      };
    });

    sendSuccess(res, response);
  } catch (error) {
    next(error);
  }
}

module.exports = { getAllTrafficLights };
