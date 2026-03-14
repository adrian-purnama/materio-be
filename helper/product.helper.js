const Product = require('../model/product.model');
const Item = require('../model/items.model');

/**
 * Get available products: how many of each can be made from current item stock.
 * When canMake is 0, includes `missing`: items needed to make at least 1 (shortfall per item).
 * @param {Object} opts
 * @param {string} [opts.owner] - User ID. If only owner is set, returns all products for that owner with canMake.
 * @param {string} [opts.productId] - Product ID. If set, returns only that product's availability.
 * @returns {Promise<Array<{_id, name, canMake, missing?}>|{_id, name, canMake, missing?}|null>}
 *   missing: [{ itemId, itemName, requiredPerUnit, currentStock, shortfall }] when canMake === 0
 */
async function getAvailableProducts({ owner, productId }) {
  const buildResult = (product, itemStockMap, itemNameMap) => {
    const { canMake, missing } = computeCanMakeAndMissing(
      product.billsOfMaterial || [],
      itemStockMap,
      itemNameMap
    );
    const result = { _id: product._id, name: product.name, canMake, imagePath: product.imagePath || '' };
    if (missing && missing.length > 0) result.missing = missing;
    return result;
  };

  if (productId) {
    const filter = { _id: productId };
    if (owner) filter.owner = owner;
    const product = await Product.findOne(filter).lean();
    if (!product) return null;
    const productOwner = product.owner != null ? String(product.owner) : null;
    const items = await Item.find({ owner: productOwner }).select('_id name quantity').lean();
    const itemStockMap = {};
    const itemNameMap = {};
    for (const item of items) {
      const id = String(item._id);
      itemStockMap[id] = Number(item.quantity) || 0;
      itemNameMap[id] = item.name != null ? String(item.name) : '';
    }
    return buildResult(product, itemStockMap, itemNameMap);
  }

  if (!owner) return [];
  const [products, items] = await Promise.all([
    Product.find({ owner }).lean(),
    Item.find({ owner }).select('_id name quantity').lean(),
  ]);
  const itemStockMap = {};
  const itemNameMap = {};
  for (const item of items) {
    const id = String(item._id);
    itemStockMap[id] = Number(item.quantity) || 0;
    itemNameMap[id] = item.name != null ? String(item.name) : '';
  }
  return products.map((p) => buildResult(p, itemStockMap, itemNameMap));
}

/**
 * @returns {{ canMake: number|null, missing?: Array<{itemId, itemName, requiredPerUnit, currentStock, shortfall}> }}
 */
function computeCanMakeAndMissing(bom, itemStockMap, itemNameMap) {
  if (!bom || bom.length === 0) return { canMake: null };
  let minQty = Infinity;
  const missing = [];
  for (const line of bom) {
    const itemId = line.item?._id ?? line.item;
    if (!itemId) continue;
    const idStr = String(itemId);
    const stock = itemStockMap[idStr] ?? 0;
    const qPerUnit = Number(line.quantity) || 0;
    if (qPerUnit <= 0) continue;
    const qty = Math.floor(stock / qPerUnit);
    if (qty < minQty) minQty = qty;
    if (stock < qPerUnit) {
      missing.push({
        itemId: idStr,
        itemName: itemNameMap[idStr] ?? '',
        requiredPerUnit: qPerUnit,
        currentStock: stock,
        shortfall: qPerUnit - stock,
      });
    }
  }
  const canMake = minQty === Infinity ? 0 : minQty;
  return { canMake, missing: missing.length > 0 ? missing : undefined };
}

module.exports = { getAvailableProducts };
