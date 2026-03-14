const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const systemModel = require('../../model/system.model');
const { validateToken, validateAdmin } = require('../../helper/validate.helper');
const { toFullImageUrl, deleteImageById, logoUrlToPath } = require('../../helper/image.helper');

function imageIdFromLogoUrl(logoUrl) {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  const match = logoUrl.match(/\/api\/images\/([a-f0-9]{24})/i);
  return match ? match[1] : null;
}

router.use(validateToken);

// GET / – read the single system config (any logged-in user); logoUrl is full URL
router.get('/', async (req, res) => {
  try {
    const doc = await systemModel.findOne({});
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'System config not found',
      });
    }
    const data = doc.toObject ? doc.toObject() : { ...doc };
    if (data.logoUrl) data.logoUrl = toFullImageUrl(data.logoUrl);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to get system config',
    });
  }
});

// PUT / – update system config (adrian only). When logoUrl changes, deletes the old logo image.
router.put('/', validateAdmin, async (req, res) => {
  try {
    const { appName, openRegistration, logoUrl } = req.body;

    if (logoUrl !== undefined) {
      const current = await systemModel.findOne({}).select('logoUrl').lean();
      const oldLogoUrl = current?.logoUrl;
      const newLogoPath = logoUrlToPath(logoUrl);
      if (oldLogoUrl && newLogoPath !== oldLogoUrl) {
        const oldId = imageIdFromLogoUrl(oldLogoUrl);
        if (oldId && mongoose.isValidObjectId(oldId)) {
          await deleteImageById(oldId);
        }
      }
    }

    const doc = await systemModel.findOneAndUpdate(
      {},
      {
        ...(appName !== undefined && { appName }),
        ...(openRegistration !== undefined && { openRegistration }),
        ...(logoUrl !== undefined && { logoUrl: logoUrlToPath(logoUrl) }),
      },
      { new: true, runValidators: true }
    );
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'System config not found',
      });
    }
    const data = doc.toObject ? doc.toObject() : { ...doc };
    if (data.logoUrl) data.logoUrl = toFullImageUrl(data.logoUrl);
    return res.status(200).json({
      success: true,
      message: 'System config updated',
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update system config',
    });
  }
});

module.exports = router;
