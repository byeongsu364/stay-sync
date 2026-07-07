const { prisma } = require("../config/db");

/**
 * ==========================================================
 * Weather Forecast Repository
 * ==========================================================
 *
 * 역할
 * - 기상청 예보 데이터 저장
 * - 지역/기간 기준 예보 조회
 * ==========================================================
 */

async function findForecast(region, date) {
    return await prisma.weatherForecast.findFirst({
        where: {
            region,
            date: new Date(date),
        },
    });
}

async function findForecasts(region, startDate, endDate) {
    return await prisma.weatherForecast.findMany({
        where: {
            region,
            date: {
                gte: new Date(startDate),
                lte: new Date(endDate),
            },
        },
        orderBy: {
            date: "asc",
        },
    });
}

async function saveForecast(data) {
    return await prisma.weatherForecast.upsert({
        where: {
            date_region: {
                date: new Date(data.date),
                region: data.region,
            },
        },
        update: {
            minTemp: data.minTemp,
            maxTemp: data.maxTemp,
            avgTemp: data.avgTemp,
            rainProb: data.rainProb,
            source: data.source,
        },
        create: {
            date: new Date(data.date),
            region: data.region,
            minTemp: data.minTemp,
            maxTemp: data.maxTemp,
            avgTemp: data.avgTemp,
            rainProb: data.rainProb,
            source: data.source,
        },
    });
}

module.exports = {
    findForecast,
    findForecasts,
    saveForecast,
};