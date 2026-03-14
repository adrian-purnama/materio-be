const mongoose = require('mongoose');
const soldSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        default: '',
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'product',
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    pricePerQuantity: {
        type: Number,
        required: true,
    },
    total: {
        type: Number,
        required: true,
    },
    checkBom: {
        type: Boolean,
        default: false,
    },
    /** Snapshot of BOM used at sale time (item, quantity per unit) – immune to future product BOM changes. */
    bomUsed: {
      type: [{
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'item', required: true },
        quantity: { type: Number, required: true, min: 0 },
      }],
      default: [],
    },
    revoked: {
        type: Boolean,
        default: false,
    },
    revokedAt: {
        type: Date,
        default: null,
    },
    revokedReason: {
        type: String,
        default: '',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
})

module.exports = mongoose.model('sold', soldSchema);