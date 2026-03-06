const OtpModel = require('../model/otp.model');

const OTP_EXPIRY_MS = 15 * 60 * 1000

const createOtp = async (email, userId) => {
    
    if (!email && !userId) {
        throw new Error('Email or userId is required')
    }

    const identityFilter = email ? { email } : { userId }

    const findOtp = await OtpModel.findOne(identityFilter)
    if (findOtp) await findOtp.deleteOne()


    const generateOtp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS)
    
    
    const newOtp = await OtpModel.findOneAndUpdate(
        identityFilter,
        {
            ...(email ? { email } : {}),
            ...(userId ? { userId } : {}),
            otp: generateOtp,
            expiresAt,
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    )
    return newOtp
}

const verifyOtp = async (email, otp) => {
    if (!email) throw new Error('Email is required')
    if (!otp) throw new Error('OTP is required')

    const findOtp = await OtpModel.findOne({ email, otp })

    if (!findOtp) return false
    if (findOtp.expiresAt && findOtp.expiresAt.getTime() < Date.now()) {
        await findOtp.deleteOne()
        return false
    }
    await findOtp.deleteOne()
    return true
}

module.exports = { createOtp, verifyOtp }
