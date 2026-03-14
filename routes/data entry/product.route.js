const express = require('express');
const router = express.Router();
const Product = require('../../model/product.model');
const Item = require('../../model/items.model');
const Unit = require('../../model/unit.model');
const { validateToken } = require('../../helper/validate.helper');
const { getAvailableProducts } = require('../../helper/product.helper');
const { toFullImageUrl, deleteImageById } = require('../../helper/image.helper');

function imageIdFromPath(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return null;
  const match = imagePath.match(/\/api\/images\/([a-f0-9]{24})/i);
  return match ? match[1] : null;
}

router.use(validateToken);

// GET /api/products – list products for current user (paginated)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = { owner: req.userId };
    const [total, list] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .populate('unitSet', 'description symbol')
        .populate('billsOfMaterial.item', 'name symbol unitSet')
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
      message: err.message || 'Failed to list products',
    });
  }
});

// GET /api/products/available – products with how many can be made from current item stock
// Query: id (optional) – if set, returns single product availability; otherwise all for current user
router.get('/available', async (req, res) => {
  try {
    const owner = req.userId
    const productId = req.query.id ? String(req.query.id).trim() : undefined
    let data = await getAvailableProducts({ owner, productId })

    const addImageUrl = (doc) => ({
      ...doc,
      imageUrl: doc.imagePath ? toFullImageUrl(doc.imagePath) : null,
    })

    if (productId != null) {
      if (data == null) {
        return res.status(404).json({ success: false, message: 'Product not found' })
      }
      return res.status(200).json({ success: true, data: addImageUrl(data) })
    }
    const list = Array.isArray(data) ? data.map(addImageUrl) : []
    return res.status(200).json({ success: true, data: list })
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to load available products',
    })
  }
})

// POST /api/products – create product for current user
router.post('/', async (req, res) => {
  try {
    const { name, description, unitSet, price, stock, billsOfMaterial, imagePath } = req.body || {};

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

    const bom = Array.isArray(billsOfMaterial)
      ? billsOfMaterial.filter((line) => line.item && Number(line.quantity) >= 0)
      : [];
    for (const line of bom) {
      const itemDoc = await Item.findOne({ _id: line.item, owner: req.userId });
      if (!itemDoc) {
        return res.status(400).json({
          success: false,
          message: `Item ${line.item} not found or not yours`,
        });
      }
    }

    const doc = await Product.create({
      owner: req.userId,
      name: String(name).trim(),
      description: description != null ? String(description).trim() : '',
      unitSet,
      price: Number(price) >= 0 ? Number(price) : 0,
      stock: Number(stock) >= 0 ? Number(stock) : 0,
      billsOfMaterial: bom.map((line) => ({ item: line.item, quantity: Number(line.quantity) })),
      imagePath: imagePath != null ? String(imagePath).trim() : '',
    });

    const populated = await Product.findById(doc._id)
      .populate('unitSet', 'description symbol')
      .populate('billsOfMaterial.item', 'name symbol unitSet')
      .lean();

    const data = { ...populated, imageUrl: populated.imagePath ? toFullImageUrl(populated.imagePath) : null };
    return res.status(201).json({
      success: true,
      message: 'Product created',
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create product',
    });
  }
});

// PUT /api/products/:id – update product for current user
router.put('/:id', async (req, res) => {
  try {
    const { name, description, unitSet, price, stock, billsOfMaterial, imagePath } = req.body || {};

    if (unitSet !== undefined) {
      const unitDoc = await Unit.findOne({ _id: unitSet, owner: req.userId });
      if (!unitDoc) {
        return res.status(400).json({
          success: false,
          message: 'Unit set not found or not yours',
        });
      }
    }

    if (Array.isArray(billsOfMaterial)) {
      for (const line of billsOfMaterial) {
        if (!line.item) continue;
        const itemDoc = await Item.findOne({ _id: line.item, owner: req.userId });
        if (!itemDoc) {
          return res.status(400).json({
            success: false,
            message: `Item not found or not yours`,
          });
        }
      }
    }

    const current = await Product.findOne({ _id: req.params.id, owner: req.userId }).select('imagePath').lean();
    if (current && imagePath !== undefined && current.imagePath !== (imagePath != null ? String(imagePath).trim() : '')) {
      const oldId = imageIdFromPath(current.imagePath);
      if (oldId) await deleteImageById(oldId);
    }

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (description !== undefined) update.description = String(description).trim();
    if (unitSet !== undefined) update.unitSet = unitSet;
    if (price !== undefined) update.price = Number(price) >= 0 ? Number(price) : 0;
    if (stock !== undefined) update.stock = Number(stock) >= 0 ? Number(stock) : 0;
    if (imagePath !== undefined) update.imagePath = imagePath != null ? String(imagePath).trim() : '';
    if (Array.isArray(billsOfMaterial)) {
      update.billsOfMaterial = billsOfMaterial
        .filter((line) => line.item && Number(line.quantity) >= 0)
        .map((line) => ({ item: line.item, quantity: Number(line.quantity) }));
    }

    const doc = await Product.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      update,
      { new: true, runValidators: true }
    )
      .populate('unitSet', 'description symbol')
      .populate('billsOfMaterial.item', 'name symbol unitSet')
      .lean();

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const data = { ...doc, imageUrl: doc.imagePath ? toFullImageUrl(doc.imagePath) : null };
    return res.status(200).json({
      success: true,
      message: 'Product updated',
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update product',
    });
  }
});

// DELETE /api/products/:id – delete product for current user
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Product.findOne({ _id: req.params.id, owner: req.userId }).select('imagePath').lean();
    if (doc?.imagePath) {
      const imageId = imageIdFromPath(doc.imagePath);
      if (imageId) await deleteImageById(imageId);
    }
    const deleted = await Product.findOneAndDelete({
      _id: req.params.id,
      owner: req.userId,
    });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }
    return res.status(200).json({
      success: true,
      message: 'Product deleted',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to delete product',
    });
  }
});

router.get('/analytics', async (req, res) => {
  return res.status(501).json({ success: false, message: 'Not implemented' })
})

module.exports = router;
