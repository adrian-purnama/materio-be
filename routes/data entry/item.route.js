const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Item = require('../../model/items.model');
const Unit = require('../../model/unit.model');
const Purchase = require('../../model/purchase.model');
const { validateToken } = require('../../helper/validate.helper');
const { toFullImageUrl, deleteImageById } = require('../../helper/image.helper');

function imageIdFromPath(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return null;
  const match = imagePath.match(/\/api\/images\/([a-f0-9]{24})/i);
  return match ? match[1] : null;
}

router.use(validateToken);

// GET /api/items – list items for current user (paginated)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = { owner: req.userId };
    const [total, list] = await Promise.all([
      Item.countDocuments(filter),
      Item.find(filter)
        .populate('unitSet', 'description symbol')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const data = list.map((doc) => ({
      ...doc,
      imageUrl: doc.imagePath ? toFullImageUrl(doc.imagePath) : null,
    }));
    return res.status(200).json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to list items',
    });
  }
});

// POST /api/items – create item for current user
router.post('/', async (req, res) => {
  try {
    const { name, description, unitSet, quantity, lowReminderThreshold, imagePath } = req.body || {};

    if (!name || !unitSet) {
      return res.status(400).json({
        success: false,
        message: 'Name and unit set are required',
      });
    }

    const unitDoc = await Unit.findOne({ _id: unitSet, owner: req.userId });
    if (!unitDoc) {
      return res.status(400).json({
        success: false,
        message: 'Unit set not found or not yours',
      });
    }

    const doc = await Item.create({
      owner: req.userId,
      name: String(name).trim(),
      description: description != null ? String(description).trim() : '',
      unitSet,
      quantity: Number(quantity) >= 0 ? Number(quantity) : 0,
      lowReminderThreshold: Number(lowReminderThreshold) >= 0 ? Number(lowReminderThreshold) : 0,
      imagePath: imagePath != null ? String(imagePath).trim() : '',
    });

    const populated = await Item.findById(doc._id)
      .populate('unitSet', 'description symbol')
      .lean();

    const data = { ...populated, imageUrl: populated.imagePath ? toFullImageUrl(populated.imagePath) : null };
    return res.status(201).json({
      success: true,
      message: 'Item created',
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create item',
    });
  }
});

// PUT /api/items/:id – update item for current user
router.put('/:id', async (req, res) => {
  try {
    const { name, description, unitSet, quantity, lowReminderThreshold, imagePath } = req.body || {};

    if (unitSet !== undefined) {
      const unitDoc = await Unit.findOne({ _id: unitSet, owner: req.userId });
      if (!unitDoc) {
        return res.status(400).json({
          success: false,
          message: 'Unit set not found or not yours',
        });
      }
    }

    const current = await Item.findOne({ _id: req.params.id, owner: req.userId }).select('imagePath').lean();
    if (current && imagePath !== undefined && current.imagePath !== (imagePath != null ? String(imagePath).trim() : '')) {
      const oldId = imageIdFromPath(current.imagePath);
      if (oldId) await deleteImageById(oldId);
    }

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (description !== undefined) update.description = String(description).trim();
    if (unitSet !== undefined) update.unitSet = unitSet;
    if (quantity !== undefined) update.quantity = Number(quantity) >= 0 ? Number(quantity) : 0;
    if (lowReminderThreshold !== undefined) update.lowReminderThreshold = Number(lowReminderThreshold) >= 0 ? Number(lowReminderThreshold) : 0;
    if (imagePath !== undefined) update.imagePath = imagePath != null ? String(imagePath).trim() : '';

    const doc = await Item.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      update,
      { new: true, runValidators: true }
    )
      .populate('unitSet', 'description symbol')
      .lean();

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
      });
    }

    const data = { ...doc, imageUrl: doc.imagePath ? toFullImageUrl(doc.imagePath) : null };
    return res.status(200).json({
      success: true,
      message: 'Item updated',
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update item',
    });
  }
});

// DELETE /api/items/:id – delete item for current user
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Item.findOne({ _id: req.params.id, owner: req.userId }).select('imagePath').lean();
    if (doc?.imagePath) {
      const imageId = imageIdFromPath(doc.imagePath);
      if (imageId) await deleteImageById(imageId);
    }
    const deleted = await Item.findOneAndDelete({
      _id: req.params.id,
      owner: req.userId,
    });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
      });
    }
    return res.status(200).json({
      success: true,
      message: 'Item deleted',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete item',
    });
  }
});

// GET /api/items/low-stock – items with lowReminderThreshold set and quantity <= threshold
router.get('/low-stock', async (req, res) => {
  try {
    const filter = {
      owner: req.userId,
      lowReminderThreshold: { $gt: 0 },
      $expr: { $lte: ['$quantity', '$lowReminderThreshold'] },
    };
    const list = await Item.find(filter)
      .populate('unitSet', 'description symbol')
      .sort({ quantity: 1 })
      .lean();
    const data = list.map((doc) => ({
      ...doc,
      imageUrl: doc.imagePath ? toFullImageUrl(doc.imagePath) : null,
    }));
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to list low-stock items',
    });
  }
});

// GET /api/items/analytics – purchase-based stock additions by day (optional: itemId, from, to)
router.get('/analytics', async (req, res) => {
  try {
    const { itemId, from, to } = req.query || {};
    const now = new Date();
    let fromDate = from ? new Date(from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let toDate = to ? new Date(to) : now;
    if (Number.isNaN(fromDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid "from" date' });
    }
    if (Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid "to" date' });
    }
    if (fromDate > toDate) {
      return res.status(400).json({ success: false, message: '"from" must be before "to"' });
    }
    // If "to" is a date-only string (YYYY-MM-DD), include the whole day (end of day)
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(to).trim())) {
      toDate.setHours(23, 59, 59, 999);
    }
    // If "from" is date-only, start at midnight
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(String(from).trim())) {
      fromDate.setHours(0, 0, 0, 0);
    }

    const match = {
      owner: new mongoose.Types.ObjectId(req.userId),
      createdAt: { $gte: fromDate, $lte: toDate },
    };
    if (itemId) {
      try {
        match.item = new mongoose.Types.ObjectId(itemId);
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid itemId' });
      }
    }

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          amount: { $multiply: ['$quantity', { $ifNull: ['$quantityPerUnit', 1] }] },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            item: '$item',
          },
          amountAdded: { $sum: '$amount' },
          amountSpent: { $sum: '$total' },
        },
      },
      { $sort: { '_id.date': 1 } },
      {
        $lookup: {
          from: 'items',
          localField: '_id.item',
          foreignField: '_id',
          as: 'itemDoc',
        },
      },
      { $unwind: { path: '$itemDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          date: '$_id.date',
          itemId: { $toString: '$_id.item' },
          itemName: '$itemDoc.name',
          amountAdded: 1,
          amountSpent: 1,
        },
      },
    ];

    const data = await Purchase.aggregate(pipeline);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to load analytics',
    });
  }
});

module.exports = router;
