const mongoose = require('mongoose');

/** One line in the bill of materials: how much of an item is needed per unit of this product. */
const bomLineSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'item',
      required: true,
    },
    /** Quantity of that item required (in the item’s unit) per unit of this product. */
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        default: '',
        trim: true,
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
        index: true,
    },
    /** What it takes to make this product: list of { item, quantity } per unit of product. */
    billsOfMaterial: {
      type: [bomLineSchema],
      default: [],
    },
    unitSet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'unit',
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    stock: {
        type: Number,
        required: true,
    },
    /** Path to image in GridFS, e.g. /api/images/:id */
    imagePath: {
      type: String,
      default: '',
      trim: true,
    },
}, {
    timestamps: true,
})

module.exports = mongoose.model('product', productSchema);