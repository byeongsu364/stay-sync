const express = require("express");
const cors = require("cors");

const env = require("./src/config/env");
const { connectDB } = require("./src/config/db");
const chatRoutes = require("./src/routes/chatRoutes");
const { startWeatherScheduler } = require("./src/jobs/weatherScheduler");

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

    startWeatherScheduler();

    app.listen(env.PORT, () => {
        console.log(`Server Running : ${env.PORT}`);
    });
}

startServer();