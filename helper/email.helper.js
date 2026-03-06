require('dotenv').config();

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const VERIFICATION_EMAIL = process.env.VERIFICATION_EMAIL;

function formatBrevoError(err) {
  const status = err?.response?.status ?? err?.status
  const data = err?.response?.data
  const message =
    (typeof data === 'string' && data) ||
    data?.message ||
    data?.error ||
    err?.message ||
    'Unknown error'

  const suffix = status ? ` (${status})` : ''
  return new Error(`Brevo email send failed${suffix}: ${message}`)
}


async function sendEmail({ to, subject, htmlContent, textContent, sender }) {
  if (!BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY is not set')
  }
  if (!VERIFICATION_EMAIL && !sender?.email) {
    throw new Error('VERIFICATION_EMAIL is not set (must be a verified sender email in Brevo)')
  }

  const { TransactionalEmailsApi, SendSmtpEmail } = await import('@getbrevo/brevo');
  const api = new TransactionalEmailsApi();

  api.authentications.apiKey.apiKey = BREVO_API_KEY;

  const sendSmtpEmail = new SendSmtpEmail();
  sendSmtpEmail.sender = sender
    ? { name: sender.name, email: sender.email }
    : { name: 'FC', email: VERIFICATION_EMAIL };
  sendSmtpEmail.to = [{ email: to.email, name: to.name || to.email }];
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent || undefined;
  sendSmtpEmail.textContent = textContent || undefined;

  try {
    const data = await api.sendTransacEmail(sendSmtpEmail);
    return data;
  } catch (err) {
    throw formatBrevoError(err)
  }
}

const sendOtpEmail = async (email, otp) => {
  const htmlContent = `
    <p>Your OTP is ${otp}</p>
  `
  const textContent = `
    Your OTP is ${otp}
  `
  await sendEmail({ to: { email }, subject: 'OTP Verification', htmlContent, textContent })
}

module.exports = { sendOtpEmail };