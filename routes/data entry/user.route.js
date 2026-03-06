const express = require('express');
const router = express.Router();
const userModel = require('../../model/user.model');
const { validateToken, validateAdmin } = require('../../helper/validate.helper');

router.use(validateToken);

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
