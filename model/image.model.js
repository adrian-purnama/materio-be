const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
    /** Raw image bytes (e.g. from multipart upload). Max doc size 16MB. */
    data: {
        type: Buffer,
        required: true,
    },
    /** MIME type, e.g. image/png, image/jpeg, image/webp */
    contentType: {
        type: String,
        required: true,
        default: 'image/png',
    },
    /** Original filename when uploaded */
    filename: {
        type: String,
        default: '',
    },
    /** Size in bytes */
    size: {
        type: Number,
        required: true,
        min: 0,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// Don't send huge buffer in JSON responses
imageSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.data;
    return obj;
};

module.exports = mongoose.model('Image', imageSchema);
