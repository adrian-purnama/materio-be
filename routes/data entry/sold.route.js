const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Sold = require('../../model/sold.model');
const Product = require('../../model/product.model');
const Item = require('../../model/items.model');
const { validateToken } = require('../../helper/validate.helper');

router.use(validateToken);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const canModifySale = (createdAt) => createdAt && (Date.now() - new Date(createdAt).getTime() <= ONE_DAY_MS);

// GET /api/sold – list sales for current user (paginated)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = { owner: req.userId };
    const [total, list] = await Promise.all([
      Sold.countDocuments(filter),
      Sold.find(filter)
        .populate('product', 'name description unitSet price')
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
      message: err.message || 'Failed to list sales',
    });
  }
});

// POST /api/sold – create sale
router.post('/', async (req, res) => {
  try {
    const { name, description, product, quantity, pricePerQuantity, checkBom } = req.body || {};

    if (!name || !product || quantity == null || pricePerQuantity == null) {
      return res.status(400).json({
        success: false,
        message: 'Name, product, quantity and price per quantity are required',
      });
    }

    const productDoc = await Product.findOne({ _id: product, owner: req.userId })
      .populate('billsOfMaterial.item', 'name quantity')
      .lean();
    if (!productDoc) {
      return res.status(400).json({
        success: false,
        message: 'Product not found or not yours',
      });
    }

    const qty = Number(quantity) >= 0 ? Number(quantity) : 0;
    const pricePer = Number(pricePerQuantity) >= 0 ? Number(pricePerQuantity) : 0;
    const total = qty * pricePer;
    const doCheckBom = !!checkBom;

    if (doCheckBom && productDoc.billsOfMaterial?.length > 0) {
      const insufficient = [];
      for (const line of productDoc.billsOfMaterial) {
        const itemId = line.item?._id ?? line.item;
        if (!itemId) continue;
        const totalNeeded = qty * (Number(line.quantity) || 0);
        const itemDoc = await Item.findOne({ _id: itemId, owner: req.userId }).lean();
        if (!itemDoc) {
          insufficient.push({ item: 'BOM item', need: totalNeeded, have: 0, message: 'BOM item not found or not yours' });
          continue;
        }
        const itemStock = itemDoc.quantity ?? 0;
        if (itemStock < totalNeeded) {
          insufficient.push({
            item: itemDoc.name ?? 'Item',
            need: totalNeeded,
            have: itemStock,
            message: `${itemDoc.name ?? 'Item'}: need ${totalNeeded}, have ${itemStock}`,
          });
        }
      }
      if (insufficient.length > 0) {
        const details = insufficient.map((i) => i.message).join('; ');
        return res.status(400).json({
          success: false,
          message: `Insufficient stock: ${details}`,
          insufficient,
        });
      }
    }

    const bomUsed = doCheckBom && Array.isArray(productDoc.billsOfMaterial)
      ? productDoc.billsOfMaterial.map((line) => ({
          item: line.item?._id ?? line.item,
          quantity: Number(line.quantity) || 0,
        })).filter((line) => line.item)
      : [];

    const doc = await Sold.create({
      owner: req.userId,
      name: String(name).trim(),
      description: description != null ? String(description).trim() : '',
      product,
      quantity: qty,
      pricePerQuantity: pricePer,
      total,
      checkBom: doCheckBom,
      bomUsed,
    });

    if (doCheckBom && productDoc.billsOfMaterial?.length > 0) {
      for (const line of productDoc.billsOfMaterial) {
        const itemId = line.item?._id ?? line.item;
        if (!itemId) continue;
        const totalNeeded = qty * (Number(line.quantity) || 0);
        await Item.updateOne(
          { _id: itemId, owner: req.userId },
          { $inc: { quantity: -totalNeeded } }
        );
      }
    }

    const populated = await Sold.findById(doc._id)
      .populate('product', 'name description unitSet price')
      .lean();

    return res.status(201).json({
      success: true,
      message: 'Sale created',
      data: populated,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create sale',
    });
  }
});

// PUT /api/sold/:id – update sale
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, product, quantity, pricePerQuantity, checkBom } = req.body || {};

    const existing = await Sold.findOne({ _id: id, owner: req.userId });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found',
      });
    }
    if (existing.revoked) {
      return res.status(403).json({
        success: false,
        message: 'Cannot edit a revoked sale',
      });
    }
    if (!canModifySale(existing.createdAt)) {
      return res.status(403).json({
        success: false,
        message: 'Sale can only be edited within 1 day of creation',
      });
    }

    if (product) {
      const productDoc = await Product.findOne({ _id: product, owner: req.userId });
      if (!productDoc) {
        return res.status(400).json({
          success: false,
          message: 'Product not found or not yours',
        });
      }
    }

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (description !== undefined) update.description = String(description).trim();
    if (product !== undefined) update.product = product;
    if (quantity !== undefined) update.quantity = Number(quantity) >= 0 ? Number(quantity) : 0;
    if (pricePerQuantity !== undefined) update.pricePerQuantity = Number(pricePerQuantity) >= 0 ? Number(pricePerQuantity) : 0;
    if (update.quantity !== undefined || update.pricePerQuantity !== undefined) {
      const qty = update.quantity !== undefined ? update.quantity : existing.quantity;
      const pricePer = update.pricePerQuantity !== undefined ? update.pricePerQuantity : existing.pricePerQuantity;
      update.total = qty * pricePer;
    }
    if (checkBom !== undefined) {
      update.checkBom = !!checkBom;
      if (update.checkBom) {
        const pid = update.product !== undefined ? update.product : existing.product;
        const pDoc = await Product.findOne({ _id: pid, owner: req.userId }).lean();
        update.bomUsed = Array.isArray(pDoc?.billsOfMaterial)
          ? pDoc.billsOfMaterial
              .map((line) => ({ item: line.item?._id ?? line.item, quantity: Number(line.quantity) || 0 }))
              .filter((l) => l.item)
          : [];
      } else {
        update.bomUsed = [];
      }
    }

    const oldQty = existing.quantity ?? 0;
    const newQty = update.quantity !== undefined ? update.quantity : existing.quantity;
    const delta = newQty - oldQty;
    const oldProductId = existing.product;
    const newProductId = update.product !== undefined ? update.product : existing.product;
    const productChanged = String(oldProductId) !== String(newProductId);

    if (existing.checkBom) {
      if (productChanged) {
        if (Array.isArray(existing.bomUsed) && existing.bomUsed.length > 0) {
          for (const line of existing.bomUsed) {
            const itemId = line.item?._id ?? line.item;
            if (!itemId) continue;
            const totalToRestore = oldQty * (Number(line.quantity) || 0);
            await Item.updateOne(
              { _id: itemId, owner: req.userId },
              { $inc: { quantity: totalToRestore } }
            );
          }
        }
        const newProductDoc = await Product.findOne({ _id: newProductId, owner: req.userId })
          .populate('billsOfMaterial.item', 'name quantity')
          .lean();
        if (newProductDoc?.billsOfMaterial?.length > 0) {
          const insufficient = [];
          for (const line of newProductDoc.billsOfMaterial) {
            const itemId = line.item?._id ?? line.item;
            if (!itemId) continue;
            const totalNeeded = newQty * (Number(line.quantity) || 0);
            const itemDoc = await Item.findOne({ _id: itemId, owner: req.userId }).lean();
            if (!itemDoc) {
              insufficient.push({ item: 'BOM item', need: totalNeeded, have: 0, message: 'BOM item not found or not yours' });
              continue;
            }
            const itemStock = itemDoc.quantity ?? 0;
            if (itemStock < totalNeeded) {
              insufficient.push({
                item: itemDoc.name ?? 'Item',
                need: totalNeeded,
                have: itemStock,
                message: `${itemDoc.name ?? 'Item'}: need ${totalNeeded}, have ${itemStock}`,
              });
            }
          }
          if (insufficient.length > 0) {
            const details = insufficient.map((i) => i.message).join('; ');
            return res.status(400).json({
              success: false,
              message: `Insufficient stock: ${details}`,
              insufficient,
            });
          }
          for (const line of newProductDoc.billsOfMaterial) {
            const itemId = line.item?._id ?? line.item;
            if (!itemId) continue;
            const totalNeeded = newQty * (Number(line.quantity) || 0);
            await Item.updateOne(
              { _id: itemId, owner: req.userId },
              { $inc: { quantity: -totalNeeded } }
            );
          }
          update.bomUsed = newProductDoc.billsOfMaterial
            .map((line) => ({ item: line.item?._id ?? line.item, quantity: Number(line.quantity) || 0 }))
            .filter((l) => l.item);
        }
      } else if (delta > 0) {
        const productDoc = await Product.findOne({ _id: newProductId, owner: req.userId })
          .populate('billsOfMaterial.item', 'name quantity')
          .lean();
        if (productDoc?.billsOfMaterial?.length > 0) {
          const insufficient = [];
          for (const line of productDoc.billsOfMaterial) {
            const itemId = line.item?._id ?? line.item;
            if (!itemId) continue;
            const totalNeeded = delta * (Number(line.quantity) || 0);
            const itemDoc = await Item.findOne({ _id: itemId, owner: req.userId }).lean();
            if (!itemDoc) {
              insufficient.push({ item: 'BOM item', need: totalNeeded, have: 0, message: 'BOM item not found or not yours' });
              continue;
            }
            const itemStock = itemDoc.quantity ?? 0;
            if (itemStock < totalNeeded) {
              insufficient.push({
                item: itemDoc.name ?? 'Item',
                need: totalNeeded,
                have: itemStock,
                message: `${itemDoc.name ?? 'Item'}: need ${totalNeeded}, have ${itemStock}`,
              });
            }
          }
          if (insufficient.length > 0) {
            const details = insufficient.map((i) => i.message).join('; ');
            return res.status(400).json({
              success: false,
              message: `Insufficient stock: ${details}`,
              insufficient,
            });
          }
          for (const line of productDoc.billsOfMaterial) {
            const itemId = line.item?._id ?? line.item;
            if (!itemId) continue;
            const totalNeeded = delta * (Number(line.quantity) || 0);
            await Item.updateOne(
              { _id: itemId, owner: req.userId },
              { $inc: { quantity: -totalNeeded } }
            );
          }
        }
      } else if (delta < 0) {
        if (Array.isArray(existing.bomUsed) && existing.bomUsed.length > 0) {
          const absDelta = Math.abs(delta);
          for (const line of existing.bomUsed) {
            const itemId = line.item?._id ?? line.item;
            if (!itemId) continue;
            const totalToRestore = absDelta * (Number(line.quantity) || 0);
            await Item.updateOne(
              { _id: itemId, owner: req.userId },
              { $inc: { quantity: totalToRestore } }
            );
          }
        }
      }
    }

    await Sold.updateOne({ _id: id, owner: req.userId }, { $set: update });

    const populated = await Sold.findById(id)
      .populate('product', 'name description unitSet price')
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Sale updated',
      data: populated,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update sale',
    });
  }
});

// PATCH /api/sold/:id/revoke – revoke sale (no delete); restore BOM stock if applicable
router.patch('/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Sold.findOne({ _id: id, owner: req.userId });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found',
      });
    }
    if (existing.revoked) {
      return res.status(400).json({
        success: false,
        message: 'Already revoked',
      });
    }
    if (existing.checkBom && Array.isArray(existing.bomUsed) && existing.bomUsed.length > 0) {
      const qty = existing.quantity ?? 0;
      for (const line of existing.bomUsed) {
        const itemId = line.item?._id ?? line.item;
        if (!itemId) continue;
        const totalToRestore = qty * (Number(line.quantity) || 0);
        await Item.updateOne(
          { _id: itemId, owner: req.userId },
          { $inc: { quantity: totalToRestore } }
        );
      }
    }
    const reason = String(req.body?.reason ?? '').trim();
    await Sold.updateOne(
      { _id: id, owner: req.userId },
      { $set: { revoked: true, revokedAt: new Date(), revokedReason: reason } }
    );
    const populated = await Sold.findById(id)
      .populate('product', 'name description unitSet price')
      .lean();
    return res.status(200).json({
      success: true,
      message: 'Sale revoked',
      data: populated,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to revoke sale',
    });
  }
});

// GET /api/sold/analytics – revenue by day (optional: productId, from, to)
router.get('/analytics', async (req, res) => {
  try {
    const { productId, from, to } = req.query || {};
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
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(to).trim())) {
      toDate.setHours(23, 59, 59, 999);
    }
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(String(from).trim())) {
      fromDate.setHours(0, 0, 0, 0);
    }

    const match = {
      owner: new mongoose.Types.ObjectId(req.userId),
      createdAt: { $gte: fromDate, $lte: toDate },
      revoked: { $ne: true },
    };
    if (productId) {
      try {
        match.product = new mongoose.Types.ObjectId(productId);
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid productId' });
      }
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            product: '$product',
          },
          amountEarned: { $sum: '$total' },
        },
      },
      { $sort: { '_id.date': 1 } },
      {
        $lookup: {
          from: 'products',
          localField: '_id.product',
          foreignField: '_id',
          as: 'productDoc',
        },
      },
      { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          date: '$_id.date',
          productId: { $toString: '$_id.product' },
          productName: '$productDoc.name',
          amountEarned: 1,
        },
      },
    ];

    const data = await Sold.aggregate(pipeline);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to load analytics',
    });
  }
});

module.exports = router;
