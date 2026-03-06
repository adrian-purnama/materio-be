const mongoose = require('mongoose');

const OTP_EXPIRY_MINUTES = 15;

const otpSchema = new mongoose.Schema({
    email : {
        type : String,
        required : true,
        unique : true
    },
    userId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'user',
        required : false
    },
    otp : {
        type : String,
        required : true
    },
    createdAt : {
        type : Date,
        default : Date.now
    },
    expiresAt : {
        type : Date,
        required : true,
        default : () => new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
    }
});

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('otp', otpSchema);