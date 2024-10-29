// config.js
require("dotenv").config();

const config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  jwt_token: process.env.JWT_SECRET,
  bazario_mail: process.env.BAZARIO_MAIL,
  bazario_pswd: process.env.BAZARIO_PSWD,
};

module.exports = config;
