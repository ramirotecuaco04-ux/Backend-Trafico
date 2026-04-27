const mongoose = require("mongoose");
const Traffic = require("./src/models/Traffic");
require("dotenv").config();

async function seed() {
  try {
    console.log("Conectando a MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Conectado exitosamente.");

    const semaphores = [
      {
        intersection_id: "SEMAFORO_VISTA_1",
        ubicacion: {
          lat: 19.464537,
          lng: -97.687112
        },
        vehicle_count: 5,
        pedestrian_count: 2,
        density: "medium",
        decision: "GREEN",
        camera_id: "CAM_01",
        timestamp: new Date()
      },
      {
        intersection_id: "SEMAFORO_VISTA_2",
        ubicacion: {
          lat: 19.4646203468796,
          lng: -97.68705383339818
        },
        vehicle_count: 12,
        pedestrian_count: 0,
        density: "high",
        decision: "RED",
        camera_id: "CAM_02",
        timestamp: new Date()
      }
    ];

    console.log("Limpiando registros antiguos de estas intersecciones...");
    await Traffic.deleteMany({
      intersection_id: { $in: ["SEMAFORO_VISTA_1", "SEMAFORO_VISTA_2"] }
    });

    console.log("Insertando nuevos semáforos...");
    await Traffic.insertMany(semaphores);

    console.log("¡Éxito! Semáforos inyectados correctamente.");
    console.log("Coordenadas inyectadas:");
    console.log("1. 19.464537, -97.687112");
    console.log("2. 19.464620, -97.687053");

    process.exit(0);
  } catch (error) {
    console.error("Error al inyectar datos:", error);
    process.exit(1);
  }
}

seed();
