const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Atlas conectado"))
  .catch(err => console.error("Error MongoDB:", err));