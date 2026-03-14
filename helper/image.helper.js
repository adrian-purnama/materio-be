require('dotenv').config();
const mongoose = require('mongoose');
const { Readable } = require('stream');

const BE_LINK = process.env.BE_LINK;
const BUCKET_NAME = 'images';
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function getBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
}

/**
 * @param {{ buffer: Buffer, mimetype: string, originalname?: string, owner?: mongoose.Types.ObjectId, isLogo?: boolean }}
 * @returns {Promise<{ id: string, urlPath: string, url: string }>}
 */
async function createImage({ buffer, mimetype, originalname = '', owner, isLogo = false }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid image data');
  }
  if (!ALLOWED_TYPES.includes(mimetype)) {
    throw new Error(`Unsupported image type: ${mimetype}. Use: ${ALLOWED_TYPES.join(', ')}`);
  }
  if (buffer.length > MAX_SIZE_BYTES) {
    throw new Error(`Image too large. Max ${MAX_SIZE_BYTES / 1024 / 1024}MB`);
  }

  const bucket = getBucket();
  const id = new mongoose.mongo.ObjectId();
  const filename = originalname || 'image';
  const uploadStream = bucket.openUploadStreamWithId(id, filename, {
    contentType: mimetype,
    metadata: {
      owner: owner ? owner.toString() : undefined,
      isLogo: !!isLogo,
    },
  });

  const readable = Readable.from(buffer);
  readable.pipe(uploadStream);
  await new Promise((resolve, reject) => {
    uploadStream.on('finish', resolve);
    uploadStream.on('error', reject);
    readable.on('error', reject);
  });

  const path = `/api/images/${id}`;
  return { id: id.toString(), urlPath: path, url: formatImageUrl(path) };
}

/**
 * @param {string} id - MongoDB ObjectId string
 * @returns {Promise<{ contentType: string, isLogo: boolean, owner?: string } | null>}
 */
async function getImageMetadata(id) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  const db = mongoose.connection.db;
  if (!db) return null;
  const doc = await db.collection(`${BUCKET_NAME}.files`).findOne({ _id: new mongoose.mongo.ObjectId(id) });
  if (!doc) return null;
  const meta = doc.metadata || {};
  return {
    contentType: doc.contentType || 'application/octet-stream',
    isLogo: meta.isLogo === true,
    owner: meta.owner,
  };
}

/**
 * @param {string} id - MongoDB ObjectId string
 * @returns {Promise<{ stream: import('stream').Readable, contentType: string } | null>}
 */
async function getImageStream(id) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  const db = mongoose.connection.db;
  if (!db) return null;
  const doc = await db.collection(`${BUCKET_NAME}.files`).findOne({ _id: new mongoose.mongo.ObjectId(id) });
  if (!doc) return null;
  const bucket = getBucket();
  const stream = bucket.openDownloadStream(new mongoose.mongo.ObjectId(id));
  return {
    stream,
    contentType: doc.contentType || 'application/octet-stream',
  };
}

/**
 * @param {string} id - MongoDB ObjectId string
 * @returns {Promise<boolean>} true if delete was performed (or file already missing)
 */
async function deleteImageById(id) {
  if (!id || !mongoose.isValidObjectId(id)) return false;
  try {
    const bucket = getBucket();
    await bucket.delete(new mongoose.mongo.ObjectId(id));
    return true;
  } catch {
    return false;
  }
}

function formatImageUrl(path) {
  console.lof(`format function callerd ${BE_LINK}${path}`)
  return `${BE_LINK}${path}`;
}

/** If value is a path (starts with /), return full URL; otherwise return as-is. */
function toFullImageUrl(value) {
  if (!value || typeof value !== 'string') return value;
  return value.startsWith('/') ? formatImageUrl(value) : value;
}

module.exports = {
  createImage,
  getImageMetadata,
  getImageStream,
  deleteImageById,
  formatImageUrl,
  toFullImageUrl,
};
