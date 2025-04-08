import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { logger } from '../service/LogService.mjs';

// Init child logger instance
const log = logger.child({
    dataAccess : "email", //specify module where logs are from
});

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
     * @param {String} html - Email body HTML (optional)
     */
    constructor(from, to, subject, text, html) {
        this.from = from;
        this.to = to;
        this.subject = subject;
        this.text = text;
        this.html = html;
        
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
            text: this.text,
            ...(this.html && { html: this.html }) //only include HTML if it's provided
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            log.info('Email sent: ' + info.response);
            return info;
        } catch (error) {
            log.error('Error sending email:', error);
            log.error(new Error(error));
        }
    }
}