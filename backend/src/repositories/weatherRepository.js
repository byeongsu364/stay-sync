const { prisma } = require("../config/db");

/**
 * weather_forecast 테이블을 나중에 Prisma 모델로 만들면 연결.
 * 지금은 모델 없을 수 있으므로 raw query 기준.
 */

async function findWeatherByRegionAndDateRange(region, startDate, endDate) {
    return await prisma.$queryRaw`
    SELECT *
    FROM weather_forecast
    WHERE region = ${region}
    AND date >= ${startDate}
    AND date <= ${endDate}
    ORDER BY date ASC`;
}

module.exports = {
    findWeatherByRegionAndDateRange,
};