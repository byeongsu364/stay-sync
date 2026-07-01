const app = require("./src/config/app");
const env = require("./src/config/env");

/**
 * ===========================================================
 * TODO (DB 결정 후)
 *
 * MongoDB라면 mongoose 연결
 *
 * PostgreSQL이라면 Prisma 또는 Sequelize 연결
 *
 * ===========================================================
 */

app.get("/", (req, res) => {

    res.json({

        message: "STAY-SYNC Backend Server"

    });

});

app.listen(env.PORT, () => {

    console.log(`Server Running : ${env.PORT}`);

});