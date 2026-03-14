const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
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
    /** Unit set this item is measured in (e.g. Mass, Volume, Count). */
    unitSet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'unit',
      required: true,
    },
    /** Current stock quantity in the item's unit. */
    quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    lowReminderThreshold: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Path to image in GridFS, e.g. /api/images/:id */
    imagePath: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

itemSchema.index({ owner: 1 });

module.exports = mongoose.model('item', itemSchema);
