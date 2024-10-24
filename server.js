const express = require("express");
const cors = require("cors");
const http = require("http");
const mysql = require("mysql2");
const config = require("./config");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const PORT = 4000;
const app = express();

app.use(cors());
app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

const db = mysql.createConnection({
  host: config.host,
  user: config.user,
  password: config.password,
  database: config.database,
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    return;
  }
  console.log("Connected to the MySQL database");
});

app.get("/products", (request, response) => {
  const sql = "SELECT * FROM products"; // SQL query to select all products
  db.query(sql, (err, data) => {
    if (err) {
      return response.status(500).json({ error: "Database query failed" });
    }
    return response.status(200).json(data);
  });
});

app.post("/login", (req, res) => {
  // response.send("from backend side", res);

  console.log("log", req.body);
  const { username, password } = req.body;

  // console.log(username, password);

  const query = "SELECT * FROM users WHERE username = ?";
  db.query(query, [username], async (err, results) => {
    console.log("results", results);
    if (err) {
      return res.status(500).send("Server error");
    }

    if (results.length === 0) {
      // If no user found, send a 404 error
      return res.status(404).send("User not found");
    }
    const user = results[0];
    const hashedPassword = user.password;
    console.log("hashedPassword", hashedPassword, user);

    const isMatch = await bcrypt.compare(password, hashedPassword);

    if (isMatch) {
      // Password matches
      const token = jwt.sign(
        { username: user?.username },
        process.env.JWT_SECRET,
        {
          expiresIn: "1h",
        }
      );

      res.status(200).json({
        success: true,
        message: "Login successful!",
        data: results,
        token: token,
      });
    } else {
      // Password does not match
      res.json({ success: false, message: "Invalid username or password" });
    }
  });
});

app.post("/signup", async (req, res) => {
  const { username, password, email } = req.body;

  const salt = 10;
  const isUserExists = `SELECT * FROM users WHERE username = ? OR email = ?`;

  db.query(isUserExists, [username, email], async (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Server error" });
    }

    if (results.length > 0) {
      return res
        .status(400)
        .json({ message: "User with this username or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, salt);

    const createUserQuery =
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)";

    db.query(createUserQuery, [username, email, hashedPassword], (error) => {
      if (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
      }
      res.status(201).json({ message: "User created successfully" });
    });
  });
});

app.post("/add-to-cart", (req, res) => {
  const { userId, productId, quantities } = req.body;

  // Query to insert or update cart
  const addToCartQuery = `
        INSERT INTO cart (user_id, product_id, quantity)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity);
    `;
  db.query(addToCartQuery, [userId, productId, quantities], (error) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ success: false, message: "Server error" });
    }
    res
      .status(200)
      .json({ success: true, message: "Added To Cart Successfully" });
  });
});

app.get("/cart/:userId", (req, res) => {
  const { userId } = req.params;
  console.log("userId", userId);

  // Query to Get Cart Products
  const getCartProduct = `SELECT  cart.user_id,cart.product_id, products.name,products.description,products.image_url,products.category,cart.quantity,products.id,
		                cart.quantity*products.price as "total_price" FROM cart
                    JOIN products ON cart.product_id = products.id
                    WHERE cart.user_id = ?;`;

  db.query(getCartProduct, [userId], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Server error" });
    }
    res.status(200).json({
      success: true,
      message: "Cart Successfully Updated",
      data: results,
    });
  });
});

app.post("/placeorder", (req, res) => {
  const placeorderQuery = ` INSERT INTO orders (user_id, product_id, quantity)
        VALUES (?, ?, ?)`;
  res.status(200).json({
    success: true,
    message: "Order Placed Successfully",
  });
});

app.delete("/cart/:userId/:productId", (req, res) => {
  console.log();

  const { userId, productId } = req.params;

  const removeFromCartQuery = `DELETE FROM CART WHERE user_id = ? AND product_id = ?`;

  db.query(removeFromCartQuery, [userId, productId], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Server error" });
    }
    res.status(200).json({
      success: true,
      message: "Product Removed From Cart SuccessFully",
    });
  });
});

app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
