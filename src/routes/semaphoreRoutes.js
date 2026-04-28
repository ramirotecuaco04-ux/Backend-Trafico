const express = require("express");
const { getAllTrafficLights } = require("../controllers/trafficLightController");
const {
  activateSemaphoreOverride,
  getRealtimeSemaphoreState,
  getSemaphoreOverrides,
  releaseSemaphoreOverride
} = require("../controllers/semaphoreController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// NUEVO: Infraestructura estática para el renderizado inicial del mapa
//router.get("/", requireRole("admin", "vialidad", "ambulancia"), getAllTrafficLights);

// ESTADOS DINÁMICOS Y CONTROL
//router.get("/state", requireRole("admin", "ambulancia"), getRealtimeSemaphoreState);
//router.post("/overrides", requireRole("admin", "ambulancia"), activateSemaphoreOverride);
//router.patch("/overrides/:id/release", requireRole("admin", "ambulancia"), releaseSemaphoreOverride);
// AHORA: Ruta pública temporal para pruebas en el mapa
router.get("/", getAllTrafficLights);

// ESTADOS DINÁMICOS Y CONTROL (Estos déjalos protegidos por seguridad)
router.get("/state", requireRole("admin", "ambulancia"), getRealtimeSemaphoreState);
router.post("/overrides", requireRole("admin", "ambulancia"), activateSemaphoreOverride);
router.patch("/overrides/:id/release", requireRole("admin", "ambulancia"), releaseSemaphoreOverride);

module.exports = router;
