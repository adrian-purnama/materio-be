const express = require('express');
const router = express.Router();
const Unit = require('../../model/unit.model');
const { validateToken } = require('../../helper/validate.helper');

router.use(validateToken);

const DEFAULT_UNITS = [
  { description: 'Millilitre', symbol: 'ml' },
  { description: 'Litre', symbol: 'L' },
  { description: 'Kilolitre', symbol: 'kl' },
  { description: 'Milligram', symbol: 'mg' },
  { description: 'Gram', symbol: 'g' },
  { description: 'Kilogram', symbol: 'kg' },
  { description: 'Piece', symbol: 'pcs' },
];

// GET /api/units – list all units for current user
router.get('/', async (req, res) => {
  try {
    const list = await Unit.find({ owner: req.userId }).sort({ updatedAt: -1 }).lean();
    return res.status(200).json({
      success: true,
      data: list,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to list units',
    });
  }
});

// POST /api/units/populate – create default units (separate docs) for current user if not present
router.post('/populate', async (req, res) => {
  try {
    const created = [];
    for (const u of DEFAULT_UNITS) {
      const exists = await Unit.findOne({ owner: req.userId, symbol: u.symbol });
      if (!exists) {
        const doc = await Unit.create({
          owner: req.userId,
          description: u.description,
          symbol: u.symbol,
        });
        created.push(doc);
      }
    }
    return res.status(200).json({
      success: true,
      message: created.length ? `Added ${created.length} default unit(s).` : 'Default units already present.',
      data: created,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to populate defaults',
    });
  }
});

// POST /api/units – create one unit
router.post('/', async (req, res) => {
  try {
    const { description, symbol } = req.body || {};

    if (!symbol || !String(symbol).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Symbol is required',
      });
    }

    const doc = await Unit.create({
      owner: req.userId,
      description: description != null ? String(description).trim() : '',
      symbol: String(symbol).trim(),
    });

    return res.status(201).json({
      success: true,
      message: 'Unit saved',
      data: doc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to save unit',
    });
  }
});

// PUT /api/units/:id – update one unit
router.put('/:id', async (req, res) => {
  try {
    const { description, symbol } = req.body || {};

    const update = {};
    if (description !== undefined) update.description = String(description).trim();
    if (symbol !== undefined) update.symbol = String(symbol).trim();

    const doc = await Unit.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      update,
      { new: true, runValidators: true }
    );

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Unit updated',
      data: doc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update unit',
    });
  }
});

// DELETE /api/units/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Unit.findOneAndDelete({
      _id: req.params.id,
      owner: req.userId,
    });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found',
      });
    }
    return res.status(200).json({
      success: true,
      message: 'Unit deleted',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete unit',
    });
  }
});

module.exports = router;
