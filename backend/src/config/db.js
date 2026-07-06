const { PrismaClient } = require("@prisma/client");

/**
 * ==========================================================
 * Database Configuration
 * ==========================================================
 *
 * 현재
 * ----------------------------------------------------------
 * PostgreSQL + Prisma ORM
 *
 * TODO (배포 시 변경)
 * ----------------------------------------------------------
 * - 연구실 PostgreSQL Server
 * - Docker PostgreSQL
 * - Cloud Database(AWS RDS 등)
 *
 * 변경 가능성이 높은 부분
 * ----------------------------------------------------------
 * DATABASE_URL (.env)
 * ==========================================================
 */

const prisma = new PrismaClient({
    log: [
        "warn",
        "error",
    ],
});

async function connectDB() {
    try {
        await prisma.$connect();
        console.log("PostgreSQL Connected");
    } catch (error) {
        console.error("Database Connection Failed");
        console.error(error.message);
        process.exit(1);
    }
}

async function disconnectDB() {
    await prisma.$disconnect();
}

module.exports = {
    prisma,
    connectDB,
    disconnectDB,
};