const net = require("node:net");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

function portInUse(host, port) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port });
        socket.setTimeout(1000);
        socket.once("connect", () => { socket.destroy(); resolve(true); });
        socket.once("error", (error) => {
            socket.destroy();
            if (["ECONNREFUSED", "EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) resolve(false);
            else reject(error);
        });
        socket.once("timeout", () => {
            socket.destroy();
            reject(new Error(`${host}:${port} 포트 상태 확인 시간 초과`));
        });
    });
}

(async () => {
    const backendPort = Number(process.env.PORT || 4000);
    for (const port of [backendPort, 5173]) {
        const occupied = await Promise.all([portInUse("127.0.0.1", port), portInUse("::1", port)]);
        if (occupied.some(Boolean)) {
            throw new Error(`${port}번 포트가 이미 사용 중입니다. 중복 실행하지 않습니다. 기존 개발 서버를 사용하거나 해당 서버를 종료한 뒤 다시 실행해주세요.`);
        }
    }
})().catch((error) => {
    console.error(`[Stay Sync] ${error.message}`);
    process.exitCode = 1;
});
