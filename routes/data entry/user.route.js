const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const userModel = require('../../model/user.model');
const { validateToken, validateAdmin } = require('../../helper/validate.helper');

router.use(validateToken);

function generateApiKeyPair() {
  const apiKey = 'sk_' + crypto.randomBytes(24).toString('hex');
  const apiSecret = crypto.randomBytes(32).toString('hex');
  return { apiKey, apiSecret };
}

// GET /me/api-key – current user's API key status (masked)
router.get('/me/api-key', async (req, res) => {
  try {
    const doc = await userModel.findById(req.userId).select('apiKey apiSecret').lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const hasApiKey = !!(doc.apiKey && doc.apiSecret);
    const maskedKey = doc.apiKey
      ? doc.apiKey.slice(0, 10) + '…' + doc.apiKey.slice(-4)
      : null;
    return res.status(200).json({
      success: true,
      data: { hasApiKey, maskedKey },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to get API key status',
    });
  }
});

// POST /me/api-key – create or regenerate API key (returns plain values once)
router.post('/me/api-key', async (req, res) => {
  try {
    const { apiKey, apiSecret } = generateApiKeyPair();
    const doc = await userModel
      .findByIdAndUpdate(
        req.userId,
        { apiKey, apiSecret },
        { new: true, runValidators: true }
      )
      .select('apiKey apiSecret');
    if (!doc) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({
      success: true,
      message: 'API key created. Copy it now; the secret will not be shown again.',
      data: { apiKey: doc.apiKey, apiSecret: doc.apiSecret },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create API key',
    });
  }
});

// DELETE /me/api-key – remove API key
router.delete('/me/api-key', async (req, res) => {
  try {
    const doc = await userModel
      .findByIdAndUpdate(
        req.userId,
        { $unset: { apiKey: '', apiSecret: '' } },
        { new: true }
      )
      .select('apiKey apiSecret');
    if (!doc) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({
      success: true,
      message: 'API key deleted',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete API key',
    });
  }
});

// GET / – list all users (any logged-in user, no password)
router.get('/', async (req, res) => {
  try {
    const list = await userModel.find().select('-password').sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: list,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to list users',
    });
  }
});

// GET /:id – get one user (no password)
router.get('/:id', async (req, res) => {
  try {
    const doc = await userModel.findById(req.params.id).select('-password');
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    return res.status(200).json({
      success: true,
      data: doc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to get user',
    });
  }
});

// PUT /:id – update user (adrian only)
router.put('/:id', validateAdmin, async (req, res) => {
  try {
    const { email, approver, isActive } = req.body;
    const doc = await userModel
      .findByIdAndUpdate(
        req.params.id,
        {
          ...(email !== undefined && { email }),
          ...(approver !== undefined && { approver }),
          ...(isActive !== undefined && { isActive }),
        },
        { new: true, runValidators: true }
      )
      .select('-password');
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    return res.status(200).json({
      success: true,
      message: 'User updated',
      data: doc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update user',
    });
  }
});

module.exports = router;
