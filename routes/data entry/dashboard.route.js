const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Purchase = require('../../model/purchase.model');
const Sold = require('../../model/sold.model');
const { validateToken } = require('../../helper/validate.helper');
const { toFullImageUrl } = require('../../helper/image.helper');

router.use(validateToken);

function getDateRange(fromQuery, toQuery) {
  if (fromQuery && toQuery) {
    const fromDate = new Date(fromQuery + 'T00:00:00.000Z');
    const toDate = new Date(toQuery + 'T23:59:59.999Z');
    if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
      return { fromDate, toDate };
    }
  }
  return { fromDate: null, toDate: null };
}

// GET /api/dashboard/summary?period=all or ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/summary', async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.userId);
    const { fromDate, toDate } = getDateRange(req.query.from, req.query.to);

    const purchaseMatch = { owner: ownerId };
    const soldMatch = { owner: ownerId, revoked: { $ne: true } };
    if (fromDate != null && toDate != null) {
      purchaseMatch.createdAt = { $gte: fromDate, $lte: toDate };
      soldMatch.createdAt = { $gte: fromDate, $lte: toDate };
    }

    const [purchaseResult, soldResult] = await Promise.all([
      Purchase.aggregate([
        { $match: purchaseMatch },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Sold.aggregate([
        { $match: soldMatch },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);

    const totalSpent = purchaseResult[0]?.total ?? 0;
    const totalSold = soldResult[0]?.total ?? 0;
    const profit = totalSold - totalSpent;

    return res.status(200).json({
      success: true,
      data: { totalSpent, totalSold, profit },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to load dashboard summary',
    });
  }
});

// GET /api/dashboard/ledger?period=all or ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/ledger', async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.userId);
    const { fromDate, toDate } = getDateRange(req.query.from, req.query.to);

    const purchaseQuery = { owner: ownerId };
    const soldQuery = { owner: ownerId, revoked: { $ne: true } };
    if (fromDate != null && toDate != null) {
      purchaseQuery.createdAt = { $gte: fromDate, $lte: toDate };
      soldQuery.createdAt = { $gte: fromDate, $lte: toDate };
    }

    const [purchases, solds] = await Promise.all([
      Purchase.find(purchaseQuery).sort({ createdAt: 1 }).lean(),
      Sold.find(soldQuery).sort({ createdAt: 1 }).lean(),
    ]);

    const purchaseRows = purchases.map((doc) => ({
      date: doc.createdAt,
      income: 0,
      outcome: Number(doc.total) || 0,
      description: String(doc.description ? `${doc.name} - ${doc.description}` : doc.name || ''),
    }));
    const soldRows = solds.map((doc) => ({
      date: doc.createdAt,
      income: Number(doc.total) || 0,
      outcome: 0,
      description: String(doc.description ? `${doc.name} - ${doc.description}` : doc.name || ''),
    }));

    const merged = [...purchaseRows, ...soldRows].sort((a, b) => new Date(a.date) - new Date(b.date));
    const data = merged.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString() : (row.date ? new Date(row.date).toISOString() : ''),
      income: Number(row.income) || 0,
      outcome: Number(row.outcome) || 0,
      description: String(row.description ?? ''),
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to load ledger',
    });
  }
});

// GET /api/dashboard/chart?period=all or ?from=YYYY-MM-DD&to=YYYY-MM-DD — daily spent & sold (UTC-aligned)
router.get('/chart', async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.userId);
    const { fromDate, toDate } = getDateRange(req.query.from, req.query.to);

    const hasRange = fromDate != null && toDate != null;
    const purchaseMatch = { owner: ownerId };
    const soldMatch = { owner: ownerId, revoked: { $ne: true } };
    if (hasRange) {
      purchaseMatch.createdAt = { $gte: fromDate, $lte: toDate };
      soldMatch.createdAt = { $gte: fromDate, $lte: toDate };
    }

    const [purchaseByDay, soldByDay] = await Promise.all([
      Purchase.aggregate([
        { $match: purchaseMatch },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$total' } } },
      ]),
      Sold.aggregate([
        { $match: soldMatch },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$total' } } },
      ]),
    ]);

    const spentMap = Object.fromEntries(purchaseByDay.map((d) => [d._id, d.total]));
    const soldMap = Object.fromEntries(soldByDay.map((d) => [d._id, d.total]));

    let data;
    if (hasRange) {
      data = [];
      const startUTC = new Date(fromDate);
      startUTC.setUTCHours(0, 0, 0, 0);
      const endUTC = new Date(toDate);
      endUTC.setUTCHours(23, 59, 59, 999);
      let cur = new Date(startUTC);
      while (cur <= endUTC) {
        const dateStr = cur.toISOString().slice(0, 10);
        data.push({
          date: dateStr,
          spent: spentMap[dateStr] ?? 0,
          sold: soldMap[dateStr] ?? 0,
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else {
      const allDates = new Set([...Object.keys(spentMap), ...Object.keys(soldMap)]);
      data = [...allDates]
        .sort()
        .map((dateStr) => ({
          date: dateStr,
          spent: spentMap[dateStr] ?? 0,
          sold: soldMap[dateStr] ?? 0,
        }));
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to load chart data',
    });
  }
});

// GET /api/dashboard/top-selling?limit=1&from=YYYY-MM-DD&to=YYYY-MM-DD — top selling products by revenue, descending
router.get('/top-selling', async (req, res) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.userId);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 1));
    const { fromDate, toDate } = getDateRange(req.query.from, req.query.to);

    const soldMatch = { owner: ownerId, revoked: { $ne: true } };
    if (fromDate != null && toDate != null) {
      soldMatch.createdAt = { $gte: fromDate, $lte: toDate };
    }

    const aggregated = await Sold.aggregate([
      { $match: soldMatch },
      {
        $group: {
          _id: '$product',
          totalRevenue: { $sum: '$total' },
          quantitySold: { $sum: '$quantity' },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productDoc',
        },
      },
      { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          productId: '$_id',
          productName: { $ifNull: ['$productDoc.name', 'Unknown'] },
          imagePath: { $ifNull: ['$productDoc.imagePath', ''] },
          totalRevenue: 1,
          quantitySold: 1,
          _id: 0,
        },
      },
    ]);

    const data = aggregated.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      imageUrl: row.imagePath ? toFullImageUrl(row.imagePath) : null,
      totalRevenue: row.totalRevenue,
      quantitySold: row.quantitySold,
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to load top selling',
    });
  }
});

module.exports = router;
