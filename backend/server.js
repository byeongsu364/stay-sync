const express = require("express");
const cors = require("cors");

const env = require("./src/config/env");
const { connectDB } = require("./src/config/db");
const chatRoutes = require("./src/routes/chatRoutes");
const { startWeatherScheduler } = require("./src/jobs/weatherScheduler");
const {
    ensureRouteServer,
    stopRouteServer,
} = require("./src/services/routeServerProcessService");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Stay Sync Backend API is running",
    });
});

app.use("/api/chat", chatRoutes);

async function startServer() {
    await connectDB();
    await ensureRouteServer();

    startWeatherScheduler();

    app.listen(env.port, () => {
        console.log(`Server Running : ${env.port}`);
    });
}

process.once("SIGINT", () => {
    stopRouteServer();
    process.exit(0);
});

process.once("SIGTERM", () => {
    stopRouteServer();
    process.exit(0);
});

startServer().catch((error) => {
    console.error("Server Startup Error:", error.message);
    stopRouteServer();
    process.exit(1);
});
