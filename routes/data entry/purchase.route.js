const express = require('express');
const router = express.Router();
const Purchase = require('../../model/purchase.model');
const Item = require('../../model/items.model');
const { validateToken } = require('../../helper/validate.helper');

router.use(validateToken);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const canModifyPurchase = (createdAt) => createdAt && (Date.now() - new Date(createdAt).getTime() <= ONE_DAY_MS);

// GET /api/purchases – list purchases for current user (paginated)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = { owner: req.userId };
    const [total, list] = await Promise.all([
      Purchase.countDocuments(filter),
      Purchase.find(filter)
        .populate({ path: 'item', select: 'name description unitSet', populate: { path: 'unitSet', select: 'description symbol' } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return res.status(200).json({
      success: true,
      data: list,
      pagination: { page, limit, total, totalPages },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to list purchases',
    });
  }
});

// POST /api/purchases – create purchase
router.post('/', async (req, res) => {
  try {
    const { name, description, item, quantity, quantityPerUnit, total } = req.body || {};

    if (!name || !item || quantity == null || total == null) {
      return res.status(400).json({
        success: false,
        message: 'Name, item, quantity and total are required',
      });
    }

    const itemDoc = await Item.findOne({ _id: item, owner: req.userId });
    if (!itemDoc) {
      return res.status(400).json({
        success: false,
        message: 'Item not found or not yours',
      });
    }

    const qty = Number(quantity) >= 0 ? Number(quantity) : 0;
    const qtyPerUnit = quantityPerUnit != null && Number(quantityPerUnit) >= 0 ? Number(quantityPerUnit) : 1;
    const totalAmount = Number(total) >= 0 ? Number(total) : 0;

    const doc = await Purchase.create({
      owner: req.userId,
      name: String(name).trim(),
      description: description != null ? String(description).trim() : '',
      item,
      quantity: qty,
      quantityPerUnit: qtyPerUnit,
      total: totalAmount,
    });

    const itemAmount = qty * qtyPerUnit;
    if (itemAmount > 0) {
      const previousQty = itemDoc.quantity ?? 0;
      itemDoc.quantity = Math.max(0, previousQty + itemAmount);
      await itemDoc.save();
    }

    const populated = await Purchase.findById(doc._id)
      .populate({ path: 'item', select: 'name description unitSet', populate: { path: 'unitSet', select: 'description symbol' } })
      .lean();

    return res.status(201).json({
      success: true,
      message: 'Purchase created',
      data: populated,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create purchase',
    });
  }
});

// PUT /api/purchases/:id – update purchase
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, item, quantity, quantityPerUnit, total } = req.body || {};

    const existing = await Purchase.findOne({ _id: id, owner: req.userId });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found',
      });
    }
    if (!canModifyPurchase(existing.createdAt)) {
      return res.status(403).json({
        success: false,
        message: 'Purchase can only be edited within 1 day of creation',
      });
    }

    if (item) {
      const itemDoc = await Item.findOne({ _id: item, owner: req.userId });
      if (!itemDoc) {
        return res.status(400).json({
          success: false,
          message: 'Item not found or not yours',
        });
      }
    }

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (description !== undefined) update.description = String(description).trim();
    if (item !== undefined) update.item = item;
    if (quantity !== undefined) update.quantity = Number(quantity) >= 0 ? Number(quantity) : 0;
    if (quantityPerUnit !== undefined) update.quantityPerUnit = Number(quantityPerUnit) >= 0 ? Number(quantityPerUnit) : 1;
    if (total !== undefined) update.total = Number(total) >= 0 ? Number(total) : 0;

    const oldItemAmount = existing.quantity * (existing.quantityPerUnit ?? 1);
    const newQty = update.quantity !== undefined ? update.quantity : existing.quantity;
    const newQtyPerUnit = update.quantityPerUnit !== undefined ? update.quantityPerUnit : (existing.quantityPerUnit ?? 1);
    const newItemAmount = newQty * newQtyPerUnit;
    const oldItemId = existing.item;
    const newItemId = update.item !== undefined ? update.item : existing.item;
    const itemChanged = String(oldItemId) !== String(newItemId);
    const amountChanged = oldItemAmount !== newItemAmount;

    if (itemChanged || amountChanged) {
      if (itemChanged) {
        if (oldItemAmount > 0) {
          await Item.updateOne(
            { _id: oldItemId, owner: req.userId },
            { $inc: { quantity: -oldItemAmount } }
          );
        }
        if (newItemAmount > 0) {
          await Item.updateOne(
            { _id: newItemId, owner: req.userId },
            { $inc: { quantity: newItemAmount } }
          );
        }
      } else {
        const delta = newItemAmount - oldItemAmount;
        if (delta !== 0) {
          await Item.updateOne(
            { _id: newItemId, owner: req.userId },
            { $inc: { quantity: delta } }
          );
        }
      }
    }

    await Purchase.updateOne({ _id: id, owner: req.userId }, { $set: update });

    const populated = await Purchase.findById(id)
      .populate({ path: 'item', select: 'name description unitSet', populate: { path: 'unitSet', select: 'description symbol' } })
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Purchase updated',
      data: populated,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update purchase',
    });
  }
});

// DELETE /api/purchases/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Purchase.findOne({ _id: id, owner: req.userId }).lean();
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found',
      });
    }
    if (!canModifyPurchase(existing.createdAt)) {
      return res.status(403).json({
        success: false,
        message: 'Purchase can only be deleted within 1 day of creation',
      });
    }
    const itemAmount = existing.quantity * (existing.quantityPerUnit ?? 1);
    const result = await Purchase.deleteOne({ _id: id, owner: req.userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found',
      });
    }
    await Item.updateOne(
      { _id: existing.item, owner: req.userId },
      { $inc: { quantity: -itemAmount } }
    );
    return res.status(200).json({
      success: true,
      message: 'Purchase deleted',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete purchase',
    });
  }
});

module.exports = router;
