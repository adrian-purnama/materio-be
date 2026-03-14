const express = require('express');
const multer = require('multer');
const { validateToken, validateAdmin, getUserIdFromRequest } = require('../helper/validate.helper');
const { createImage, getImageMetadata, getImageStream, deleteImageById } = require('../helper/image.helper');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// POST /api/images/upload – upload image (auth + admin). Body: image (file), optional isLogo=true for logo.
router.post('/upload', validateToken, validateAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    const isLogo = req.body.isLogo === 'true' || req.body.isLogo === true;
    const result = await createImage({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname || '',
      owner: req.userId,
      isLogo,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Upload failed',
    });
  }
});

// GET /api/images/:id – serve image (public if isLogo, else requires auth)
router.get('/:id', async (req, res) => {
  try {
    const metadata = await getImageMetadata(req.params.id);
    if (!metadata) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }
    if (!metadata.isLogo) {
      const userId = await getUserIdFromRequest(req);
      if (!userId) {
        return res.status(403).json({
          success: false,
          message: 'Login required to view this image.',
        });
      }
    }
    const result = await getImageStream(req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }
    res.set('Content-Type', result.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.status(200);
    result.stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ success: false, message: err.message || 'Failed to stream image' });
    });
    result.stream.pipe(res);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to get image',
    });
  }
});

// DELETE /api/images/:id – delete image (auth + admin)
router.delete('/:id', validateToken, validateAdmin, async (req, res) => {
  try {
    const deleted = await deleteImageById(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }
    return res.status(200).json({ success: true, message: 'Image deleted' });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete image',
    });
  }
});

module.exports = router;
