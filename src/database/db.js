const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error("FATAL ERROR: MONGO_URI no está definida en las variables de entorno.");
      process.exit(1);
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log("✅ MongoDB Atlas conectado exitosamente");
  } catch (err) {
    console.error("❌ Error de conexión a MongoDB:", err.message);
    // En Render, es mejor dejar que el proceso continúe o reintente si es un fallo transitorio
    // pero si es configuración, el status 1 es informativo.
    console.log("Reintentando conexión en 5 segundos...");
    setTimeout(connectDB, 5000);
  }
};

connectDB();

module.exports = mongoose.connection;
