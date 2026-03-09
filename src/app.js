const express = require("express");
const cors = require("cors");
const trafficRoutes = require("./routes/trafficRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/traffic", trafficRoutes);

module.exports = app;