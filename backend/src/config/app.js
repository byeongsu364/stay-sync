const express = require("express");
const env = require("./config/env");
const { connectDB } = require("./config/db");

const app = express();

app.use(express.json());

async function startServer() {

    await connectDB();

    app.listen(env.port, () => {
        console.log(`Server Running : ${env.port}`);
    });

}

startServer();