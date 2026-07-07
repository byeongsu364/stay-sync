const cron = require("node-cron");
const {
    collectAllWeatherForecasts,
} = require("../services/weatherCollectService");

/**
 * ==========================================================
 * Weather Scheduler
 * ==========================================================
 *
 * 역할
 * - 매일 06:10, 18:10에 기상청 예보 자동 수집
 * - 단기예보 + 중기예보를 weatherForecast 테이블에 저장
 * ==========================================================
 */

function startWeatherScheduler() {
    cron.schedule("10 6,18 * * *", async () => {
        try {
            console.log("[Weather Scheduler] Start");

            await collectAllWeatherForecasts();

            console.log("[Weather Scheduler] Done");
        } catch (error) {
            console.error("[Weather Scheduler] Failed:", error.message);
        }
    });
}

module.exports = {
    startWeatherScheduler,
};