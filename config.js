// config.js
require("dotenv").config();

const config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  jwt_token: process.env.JWT_SECRET,
};

module.exports = config;
