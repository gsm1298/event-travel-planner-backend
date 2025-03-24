import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import { User } from '../business/User.js';
import { logger } from '../service/LogService.mjs'
import nodemailer from 'nodemailer';
import speakeasy from 'speakeasy';

dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

// Init child logger instance
const log = logger.child({
    service : "Auth", //specify module where logs are from
});

// Set jwtSecret from env file
const jwtSecret = process.env.jwtSecret;

// Init Nodemailer Transporter
const transporter = nodemailer.createTransport({
    host: process.env.smtphost,
    port: process.env.smtpport,
    secure: false, // use SSL
    auth: {
      user: process.env.smtpuser,
      pass: process.env.smtppass
    }
  });
  


export class AuthService {
    /**
     * @constructor
     * 
     * @param {express.Application} app
     */
    constructor(app) {

        app.post('/auth/login', this.login);
        app.post('/auth/mfa', this.mfa);
        
        // Every future route will require the user to be logged in
        app.use(this.authenticator);
        app.post('/auth/logout', this.logout);
    }

    /** @type {express.RequestHandler} */
    async login(req, res) {
        try{ 
            var input = req.body;
            // TODO - validate req schema

            var user = new User();

            // Check valid login
            const valid = await user.CheckLogin(input.email, input.password);
            if (!valid) {
                log.verbose("invlid user attempted authentication", { email: input.email } );
                return res.status(401).json({ error: "Incorrect email or password" });
            }
            else {
                //LOGIN VALID, CHECK 2FA
                // Get user data
                const userData = {
                    id: user.id,
                    first_name: user.firstName,
                    last_name: user.lastName,
                    org: user.org,
                    role_id: user.role,
                    profile_picture: user.profilePic,
                    email: user.email,
                };
                
                log.verbose("valid user authenticated", userData);
                //LOGIN VALID, CHECK 2FA
                // Check if this is the user's first login (if speakeasy secret is not set)
                if (!user.mfaSecret || !user.mfaEnabled) {
                    log.verbose("user generating new MFA secret", userData);
                    user.GenerateSecret(); // Generate a new secret for the user
                }

                const otp = await user.GenerateToken(); // Generate a new token for the user

                const mailOptions = {
                    from: 'no-reply@jlabupch.uk',
                    to: user.email,
                    subject: 'Your Two-Factor Authentication Code',
                    text: 'Your verification code is: ' + otp // Replace with the actual 2FA code
                };
                
                // Send the email
                transporter.sendMail(mailOptions, function(error, info){
                    if (error) {
                    log.error("Error:" +  error);
                    return res.status(500).json({ error: "Error sending email." });
                    } else {
                    log.info('Email sent: ' + info.response);
                    //return res.status(200).json({ response: "2FA Code Sent to email." });
                    var token = jwt.sign({ response: "2FA Code Sent to email." }, jwtSecret, { expiresIn: '5m' });
                    log.info("2fa code sent to email", userData);
                    return res.status(200).cookie("temp", token, {httpOnly: false, secure: true, sameSite: "none", domain: process.env.domain}).json({ response: "2FA Code Sent to email." });
                    }
                });

                }


            
        } catch (err) {
            log.error("Error at Login:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    async mfa(req, res) {

        try{
            const token = req.cookies.temp; // Use the temporary token set during login
            if (!token) {
                log.verbose("invlid temporary MFA token");
                return res.status(401).json({ error: "Not authenticated" });
            }

            jwt.verify(token, jwtSecret, (err, decoded) => {
                if (err) {
                    // Unset invalid cookie
                    return res.status(401).cookie("temp", "", { maxAge: 1 }).json({ error: "Not authenticated" });
                }
            });
        } catch (err) {
            log.error("Error at MFA Authenticator:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }   

        try{
            var input = req.body;
            const user = new User();

            // Check valid login
            const valid = await user.CheckMFA(input.email, input.mfaCode);
            if (!valid) {
                log.verbose("Incorrect 2FA code", { email: input.email, mfaCode: input.mfaCode });
                return res.status(401).json({ error: "Incorrect 2FA Code" });
            }
            else {
                //LOGIN VALID, 2FA SUCCESS
                if (!user.mfaEnabled){
                    // If MFA is not enabled, set it to true
                    user.mfaEnabled = true;
                    user.save(); // Save the change to the database
                }
                
                const userData = {
                    id: user.id,
                    first_name: user.firstName,
                    last_name: user.lastName,
                    org: user.org,
                    role_id: user.role,
                    profile_picture: user.profilePic,
                    email: user.email
                };

                log.verbose("user MFA enabled, login sucessful", userData); //log a user with MFA enabled and a successful login

                // Set the session
                var token = jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: '30m' });
                return res.status(200).cookie("jwt", token, {httpOnly: false, secure: true, same_site: "none", domain: process.env.domain})
                .cookie("temp", "", { maxAge: 1 }).json({ user: userData });
            }
        }
        catch (err) {
            log.error("Error at MFA:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    /** @type {express.RequestHandler} */
    logout(_, res) {
        try{
        // Unset the cookie
        res.status(200).cookie("jwt", "", { maxAge: 1 }).send();
        } catch (err) {
            log.error("Error at Logout:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }   
    }

    /** 
   * Middleware that checks if a user is authenticated.
   * 
   * Returns 401 error to the user if they aren't able to
   * be authenticated.
   * 
   * Otherwise, sets the user's information into 
   * res.locals.user, allowing later functions to use this info
   * 
   * @function
   * @type {express.RequestHandler}
   */
    authenticator(req, res, next) {
        try{
            const token = req.cookies.jwt;
            if (!token) {
                return res.status(401).json({ error: "Not authenticated" });
            }

            jwt.verify(token, jwtSecret, (err, decoded) => {
                if (err) {
                    // Unset invalid cookie
                    return res.status(401).cookie("jwt", "", { maxAge: 1 }).json({ error: "Not authenticated" });
                }

                res.locals.user = decoded;
                next();
            });
        } catch (err) {
            log.error("Error at Authenticator:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }   
}
}