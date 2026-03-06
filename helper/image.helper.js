require('dotenv').config();
const mongoose = require('mongoose');

const ImageModel = require('../model/image.model');
const BE_LINK = process.env.BE_LINK;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * @param {{ buffer: Buffer, mimetype: string, originalname?: string }}
 * @returns {Promise<{ id: string, urlPath: string }>}
 */
async function createImage({ buffer, mimetype, originalname = '' }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid image data');
  }
  if (!ALLOWED_TYPES.includes(mimetype)) {
    throw new Error(`Unsupported image type: ${mimetype}. Use: ${ALLOWED_TYPES.join(', ')}`);
  }
  if (buffer.length > MAX_SIZE_BYTES) {
    throw new Error(`Image too large. Max ${MAX_SIZE_BYTES / 1024 / 1024}MB`);
  }

  const doc = await ImageModel.create({
    data: buffer,
    contentType: mimetype,
    filename: originalname,
    size: buffer.length,
  });

  const path = `/api/images/${doc._id}`;
  return { id: doc._id.toString(), urlPath: path, url: formatImageUrl(path) };
}

/**
 * @param {string} id - MongoDB ObjectId string
 * @returns {Promise<{ data: Buffer, contentType: string } | null>}
 */
async function getImageById(id) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  const doc = await ImageModel.findById(id).select('data contentType');
  if (!doc || !doc.data) return null;
  const data = Buffer.isBuffer(doc.data) ? doc.data : Buffer.from(doc.data);
  return { data, contentType: doc.contentType || 'application/octet-stream' };
}

/**
 * @param {string} id - MongoDB ObjectId string
 * @returns {Promise<boolean>} true if deleted
 */
async function deleteImageById(id) {
  const result = await ImageModel.findByIdAndDelete(id);
  return !!result;
}

function formatImageUrl(path) {
  return `${BE_LINK}${path}`;
}

/** If value is a path (starts with /), return full URL; otherwise return as-is. */
function toFullImageUrl(value) {
  if (!value || typeof value !== 'string') return value;
  return value.startsWith('/') ? formatImageUrl(value) : value;
}

module.exports = {
  createImage,
  getImageById,
  deleteImageById,
  formatImageUrl,
  toFullImageUrl,
};
