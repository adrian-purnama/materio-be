const express = require('express');
const router = express.Router();
const Sold = require('../model/sold.model');
const Product = require('../model/product.model');
const Item = require('../model/items.model');
const { validateApiKey } = require('../helper/validate.helper');
const { getAvailableProducts } = require('../helper/product.helper');
const { toFullImageUrl } = require('../helper/image.helper');

// GET /api/external/products/available – API key auth: all available products, or one by ?id=
router.get('/products/available', validateApiKey, async (req, res) => {
  try {
    const owner = req.userId;
    const productId = req.query.id ? String(req.query.id).trim() : undefined;
    let data = await getAvailableProducts({ owner, productId });

    const addImageUrl = (doc) => ({
      ...doc,
      imageUrl: doc.imagePath ? toFullImageUrl(doc.imagePath) : null,
    });

    if (productId != null) {
      if (data == null) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }
      return res.status(200).json({ success: true, data: addImageUrl(data) });
    }
    const list = Array.isArray(data) ? data.map(addImageUrl) : [];
    return res.status(200).json({ success: true, data: list });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to load available products',
    });
  }
});

// POST /api/external/sold – API key auth: create sale (enter sold)
router.post('/sold', validateApiKey, async (req, res) => {
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

// PATCH /api/external/sold/:id/revoke – API key auth: revoke sale (restores BOM stock if applicable)
router.patch('/sold/:id/revoke', validateApiKey, async (req, res) => {
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

module.exports = router;
