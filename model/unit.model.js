const mongoose = require('mongoose');

// One document = one unit (e.g. litre, kg). No conversion or subunits.
const unitSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    symbol: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

unitSchema.index({ owner: 1 });

module.exports = mongoose.model('unit', unitSchema);
