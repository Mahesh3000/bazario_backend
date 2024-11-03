const express = require("express");
const cors = require("cors");
const http = require("http");
const mysql = require("mysql2");
const config = require("./config");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { authenticator } = require("otplib");
const QRCode = require("qrcode");

const PORT = 4000;
const app = express();

// app.use(cors());

app.use(
  cors({
    origin: "*", // Allow all origins or specify the exact origin(s)
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

const db = mysql.createConnection({
  host: config.host,
  user: config.user,
  password: config.password,
  database: config.database,
});

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: config.bazario_mail,
    pass: config.bazario_pswd,
  },
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err);
    return;
  }
  console.log("Connected to the MySQL database");
});

app.get("/generate-qr", async (req, res) => {
  try {
    // Generate a unique secret for the user
    const secret = authenticator.generateSecret();
    console.log("secret", secret);

    // Store this secret for the user in a database (simulated here)
    // Save the secret key securely tied to the user (e.g., user ID)
    // For example: await User.updateOne({ _id: userId }, { totpSecret: secret });

    // Generate OTP Auth URL for Google Authenticator
    const otpAuthUrl = authenticator.keyuri(
      "user@bazario.com",
      "Bazario",
      secret
    );
    console.log("otpAuthUrl", otpAuthUrl);

    // Generate the QR code image URL
    const qrImageUrl = await QRCode.toDataURL(otpAuthUrl);
    console.log("qrImageUrl", qrImageUrl, otpAuthUrl);

    // Send the secret and QR image to the client
    res.json({ secret, otpAuthUrl, qrImageUrl });
  } catch (error) {
    console.error("Error generating QR code", error);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

app.post("/send-otp", async (req, res) => {
  const { emailId } = req.body;

  if (!emailId) {
    return res.status(400).send({ message: "Email is required" });
  }

  // Generate a secure OTP using crypto
  const otp = crypto.randomInt(100000, 999999).toString(); // Generates a random 6-digit number

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Expires in 5 minutes

  const query =
    "INSERT INTO otps (email, otp_code, expires_at) VALUES (?, ?, ?)";
  db.query(query, [emailId, otp, expiresAt], (err, result) => {
    if (err) {
      console.error("Error saving OTP to database:", err);
      return res.status(500).send({ message: "Error saving OTP" });
    }
    // console.log("OTP saved:", result.insertId);
  });

  // Send OTP email
  const mailOptions = {
    from: config.bazario_mail,
    to: emailId,
    subject: "Your OTP Code",
    text: `Your OTP code is ${otp}. It is valid for 5 minutes.`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending OTP:", error.message); // Log the error message
      console.error("Full error details:", error); // Log the complete error object
      return res
        .status(500)
        .send({ message: "Error sending OTP", error: error.message });
    }
    // console.log("OTP sent:", info.response); // Log success info if needed
    return res
      .status(200)
      .send({ success: true, message: "OTP sent successfully" });
  });
});

app.post("/verify-otp", async (req, res) => {
  const { email, mobile, otp } = req.body;

  // Ensure that either email or mobile is provided
  if (!email && !mobile) {
    return res.status(400).send({ message: "Email or mobile is required" });
  }

  // Query to find the OTP
  const query =
    "SELECT * FROM otps WHERE otp_code = ? AND email = ? AND expires_at > NOW()";

  db.query(query, [otp, email || null, mobile || null], (err, results) => {
    if (err) {
      console.error("Error fetching OTP from database:", err);
      return res.status(500).send({ message: "Error verifying OTP" });
    }

    if (results.length === 0) {
      return res.status(400).send({ message: "Invalid or expired OTP" });
    }

    // OTP is valid, you can proceed with further actions (e.g., log in the user)
    // Optionally, you can delete the OTP record after successful verification
    const deleteQuery = "DELETE FROM otps WHERE otp_code = ?";
    db.query(deleteQuery, [otp], (delErr) => {
      if (delErr) {
        console.error("Error deleting OTP from database:", delErr);
      }
      res.status(200).send({ message: "OTP verified successfully" });
    });
  });
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

  // console.log("log", req.body);
  const { username, password } = req.body;

  // console.log(username, password);

  const query = "SELECT * FROM users WHERE username = ?";
  db.query(query, [username], async (err, results) => {
    // console.log("results", results);
    if (err) {
      return res.status(500).send("Server error");
    }

    if (results.length === 0) {
      // If no user found, send a 404 error
      return res.status(404).send("User not found");
    }
    const user = results[0];
    const hashedPassword = user.password;
    // console.log("hashedPassword", hashedPassword, user);

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
      res
        .status(201)
        .json({ success: true, message: "User created successfully" });
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
  // console.log("userId", userId);

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
