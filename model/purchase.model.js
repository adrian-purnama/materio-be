const mongoose = require('mongoose');
const purchaseSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },
    item: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'item',
        required: true,
    },
    /** How many "units" you're buying (e.g. 10 bottles). */
    quantity: {
        type: Number,
        required: true,
    },
    /** Amount of the item (in the item's unit) per one quantity. E.g. 1000 ml per bottle. Default 1 = quantity is already in item's unit. */
    quantityPerUnit: {
        type: Number,
        required: true,
        default: 1,
        min: 0,
    },
    /** Total amount paid (including delivery, fees, etc.). Single source of truth. */
    total: {
        type: Number,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
})


module.exports = mongoose.model('purchase', purchaseSchema);