import express from "express";
import session from "express-session";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;

// ====== ENV (set these on Render) ======
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "SG!!^Jgp4HB7GB_Oe01BV";
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || ""; // public key OK to expose
const SESSION_SECRET = process.env.SESSION_SECRET || "change-me-in-prod";

// Trust proxy (Render/Heroku)
app.set("trust proxy", 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // keep simple for MVP (PayPal loads external JS)
}));
app.use(compression());

// Basic rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
}));

// Body parsers
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Sessions (cookie-based)
app.use(session({
  name: "sgsid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 12, // 12 hours
  },
}));

const frontendDir = path.resolve(process.cwd(), "../frontend");

// Serve public config to frontend (Client ID only)
app.get("/config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.send(`window.__SG_CONFIG__ = {
    PAYPAL_CLIENT_ID: ${
PAYPAL_CLIENT_ID: PAYPAL_CLIENT_ID || ""

    }.json
  };`);
});

// Health
app.get("/health", (req, res) => res.json({ ok: true }));

// Auth helpers
function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  return res.redirect("/admin/login");
}

// Admin login page
app.get("/admin/login", (req, res) => {
  const file = path.join(frontendDir, "admin-login.html");
  res.sendFile(file);
});

// Login action
app.post("/api/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  if (password && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }
  return res.status(401).send("Wrong password");
});

// Logout
app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// Allow frontend to know if admin is logged in
app.get("/api/me", (req, res) => {
  res.json({ isAdmin: !!req.session?.isAdmin });
});

// Protect admin route
app.get("/admin", requireAdmin, (req, res) => {
  // Serve the same SPA, but set a flag so it opens admin view
  const indexPath = path.join(frontendDir, "index.html");
  let html = fs.readFileSync(indexPath, "utf-8");
  html = html.replace("</head>", `  <script>window.__OPEN_ADMIN__ = true;</script>\n</head>`);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// Static assets + SPA
app.use(express.static(frontendDir));

// All other routes -> SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ SlideGenius running on http://localhost:${PORT}`);
});
