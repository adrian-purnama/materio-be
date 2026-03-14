require('dotenv').config();
const jwt = require('jsonwebtoken');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const system = require('../model/system.model');
const user = require('../model/user.model');
const { createOtp, verifyOtp } = require('../helper/otp.helper');
const { sendOtpEmail } = require('../helper/email.helper');
const { validateToken, validateAdmin } = require('../helper/validate.helper');
const { validateAndCleanEmail } = require('../helper/regex.helper');
const { toFullImageUrl, formatImageUrl } = require('../helper/image.helper');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// Public: branding (logo, app name) for the frontend – logoUrl is full URL
router.get('/branding', async (req, res) => {
    const doc = await system.findOne({}).select('appName logoUrl').lean()
    if (!doc) {
        return res.status(200).json({ success: true, data: { appName: 'Stream Haven', logoUrl: '' } })
    }
    const logoUrl = formatImageUrl(doc.logoUrl) || ''
    return res.status(200).json({
        success: true,
        data: { appName: doc.appName || 'Stream Haven', logoUrl },
    })
})

router.get('/check-registration', async (req, res) => {
    const findSystem = await system.findOne({})
    
    if(!findSystem || !findSystem.openRegistration){
        return res.status(404).json({
            success : false,
            message : "System not found or registration is closed"
        })
    }

    return res.status(200).json({
        success : true,
        message : "Registration is open"
    })
})

router.post('/send-otp', async (req, res) => {
    try {
        let { email } = req.body;
        email = validateAndCleanEmail(email)

        const newOtp = await createOtp(email)
        await sendOtpEmail(email, newOtp.otp)

        return res.status(200).json({
            success : true,
            message : "OTP sent successfully"
        })
    } catch (err) {
        const msg = err?.message || 'Failed to send OTP'
        const isValidation = /email|required|format/i.test(msg)
        return res.status(isValidation ? 400 : 502).json({
            success: false,
            message: msg,
        })
    }
})


const bad = (res, message, status = 400) =>
    res.status(status).json({ success: false, message })

router.post('/register', async (req, res) => {
    const { email: rawEmail, password, otp } = req.body
    // ——— check system registration ———
    const sys = await system.findOne({})
    if (!sys?.openRegistration) return res.status(400).json({
        success : false,
        message : "Registration is closed"
    })

    if (!rawEmail || !password || !otp) {
        return res.status(400).json({
            success : false,
            message : "Email, full name, password and OTP are required"
        })
    }

    let email

    try {
        email = validateAndCleanEmail(rawEmail)
    } catch (e) {
        return res.status(400).json({
            success : false,
            message : e.message
        })
    }

    if (await user.findOne({ email })) return res.status(400).json({
        success : false,
        message : "Email already exists"
    })
    if (!(await verifyOtp(email, otp))) return res.status(400).json({
        success : false,
        message : "Invalid OTP"
    })

    // ——— Create user ———
    const hashedPassword = await bcrypt.hash(password, 10)

    if(email === ADMIN_EMAIL){
        const newUser = await user.create({ email, password: hashedPassword, isAdmin: true })
        return res.status(200).json({
            success : true,
            message : "User created successfully",
            data : { id: newUser._id, email: newUser.email}
        })
    }
    const newUser = await user.create({ email, password: hashedPassword })

    return res.status(200).json({
        success: true,
        message: 'User created successfully',
        data: { id: newUser._id, email: newUser.email},
    })
})


router.post('/login', async (req, res) => {
    let { email, password } = req.body;
    email = validateAndCleanEmail(email)
    if(!email || !password){
        return res.status(400).json({
            success : false,
            message : "Email and password are required"
        })
    }

    const findUser = await user.findOne({ email })
    if(!findUser){
        return res.status(400).json({
            success : false,
            message : "Invalid email or password"
        })
    }
    const isPasswordValid = await bcrypt.compare(password, findUser.password)
    if(!isPasswordValid){
        return res.status(400).json({
            success : false,
            message : "Invalid email or password"
        })
    }

    const token = jwt.sign({ id: findUser._id, email: findUser.email }, process.env.JWT_SECRET, { expiresIn: '7d' })

    return res.status(200).json({
        success : true,
        message : "Login successful",
        data : { email: findUser.email, token }
    })
})

router.get('/verify-token', validateToken, (req, res) => {
    const { _id, email } = req.user
    return res.status(200).json({
        success: true,
        message: 'Token verified',
        data: { id: _id, email, isAdmin: req.user.isAdmin }
    })
})

router.get('/is-admin', validateToken, validateAdmin, (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'You are an admin',
    })
});

module.exports = router;