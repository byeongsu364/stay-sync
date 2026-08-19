const path = require("path");
const { spawn } = require("child_process");
const axios = require("axios");
const env = require("../config/env");

let routeServerProcess = null;

function isLocalRouteServer() {
    try {
        const url = new URL(env.routeServer.url);
        return ["127.0.0.1", "localhost"].includes(url.hostname);
    } catch (error) {
        return false;
    }
}

async function isHealthy() {
    try {
        const response = await axios.get(`${env.routeServer.url}/health`, {
            timeout: 700,
        });
        return response.data?.status === "ok";
    } catch (error) {
        return false;
    }
}

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitUntilHealthy() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        if (await isHealthy()) return true;
        await wait(250);
    }
    return false;
}

async function ensureRouteServer() {
    if (await isHealthy()) return;

    if (!env.routeServer.autoStart || !isLocalRouteServer()) {
        console.warn(`Road Network Server is unavailable: ${env.routeServer.url}`);
        return;
    }

    const routeServerDirectory = path.join(__dirname, "..", "..", "route-server");
    const uvicornPath = path.join(routeServerDirectory, ".venv", "bin", "uvicorn");
    const routeUrl = new URL(env.routeServer.url);

    routeServerProcess = spawn(
        uvicornPath,
        ["app:app", "--host", routeUrl.hostname, "--port", routeUrl.port || "8000"],
        {
            cwd: routeServerDirectory,
            stdio: "inherit",
        },
    );
    routeServerProcess.once("exit", () => {
        routeServerProcess = null;
    });

    if (!await waitUntilHealthy()) {
        throw new Error("도로망 서버가 제한 시간 안에 시작되지 않았습니다.");
    }
    console.log(`Road Network Server Ready : ${env.routeServer.url}`);
}

function stopRouteServer() {
    if (routeServerProcess && !routeServerProcess.killed) {
        routeServerProcess.kill("SIGTERM");
    }
}

module.exports = {
    isHealthy,
    ensureRouteServer,
    stopRouteServer,
};
