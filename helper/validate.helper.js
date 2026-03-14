require('dotenv').config();
const jwt = require('jsonwebtoken');
const userModel = require('../model/user.model');

/**
 * Middleware: validates JWT from Authorization header (Bearer <token>).
 * If valid, decodes the token, loads the user from DB, and sets req.user.
 * Use on any route that requires the user to be logged in.
 */
const validateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userModel.findById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Token may be invalid.',
      });
    }

    req.user = user;
    req.userId = user._id;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please log in again.',
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Unauthorized.',
    });
  }
};

/** Must run after validateToken. Returns 403 if req.user.email is not adrianpurnama209@gmail.com */
const validateAdmin = (req, res, next) => {
  if (req.user?.isAdmin !== true) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to access this resource.',
    });
  }
  next();
};

/**
 * Optional auth: if valid JWT present, returns the user's _id; otherwise null.
 * Does not send any response. Use for routes that allow both public and authenticated access.
 * @param {import('express').Request} req
 * @returns {Promise<import('mongoose').Types.ObjectId | null>}
 */
async function getUserIdFromRequest(req) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userModel.findById(decoded.id);
    if (!user || !user.isActive) return null;
    return user._id;
  } catch {
    return null;
  }
}

async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const apiSecret = req.headers['x-api-secret'];
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'API key is required.',
    });
  }
  if (!apiSecret) {
    return res.status(401).json({
      success: false,
      message: 'API secret is required.',
    });
  }
  const user = await userModel.findOne({ apiKey });
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API key.',
    });
  }
  if (user.apiSecret !== apiSecret) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API secret.',
    });
  }
  req.user = user;
  req.userId = user._id;
  next();
}

module.exports = { validateToken, validateAdmin, getUserIdFromRequest, validateApiKey };
