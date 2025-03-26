import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

/**
 * @Class Email
 */
export class Email {
    /**
     * @constructor
     * @param {String} from - Sender email address
     * @param {String} to - Recipient email address
     * @param {String} subject - Email subject
     * @param {String} text - Email body text
     */
    constructor(from, to, subject, text) {
        this.from = from;
        this.to = to;
        this.subject = subject;
        this.text = text;
        
        // Init Nodemailer Transporter
        this.transporter = nodemailer.createTransport({
            host: process.env.smtphost,
            port: process.env.smtpport,
            secure: false, // use SSL
            auth: {
                user: process.env.smtpuser,
                pass: process.env.smtppass
            }
        });
    }

    /**
     * Sends the email using the configured transporter
     * @returns {Promise} - Resolves with the email info or rejects with an error
     */
    async sendEmail() {
        const mailOptions = {
            from: this.from,
            to: this.to,
            subject: this.subject,
            text: this.text
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Email sent: ' + info.response);
            return info;
        } catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }
}