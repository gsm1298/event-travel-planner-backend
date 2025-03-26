import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import { User } from '../business/User.js';
import nodemailer from 'nodemailer';
import Joi from 'joi';

dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

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
        try {
            // Validate request body
            const schema = Joi.object({
                email: Joi.string().email().required(),
                password: Joi.string().required()
            });
            const { error } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            var input = req.body;
            // TODO - validate req schema

            var user = new User();

            // Check valid login
            const valid = await user.CheckLogin(input.email, input.password);
            if (!valid) {
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
            
                //LOGIN VALID, CHECK 2FA
                // Check if this is the user's first login (if speakeasy secret is not set)
                if (!user.mfaSecret || !user.mfaEnabled) {
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
                    console.log("Error:" +  error);
                    return res.status(500).json({ error: "Error sending email." });
                    } else {
                    console.log('Email sent: ' + info.response);
                    //return res.status(200).json({ response: "2FA Code Sent to email." });
                    var token = jwt.sign({ response: "2FA Code Sent to email." }, jwtSecret, { expiresIn: '5m' });
                    return res.status(200).cookie("temp", token, {httpOnly: false, secure: true, sameSite: "none", domain: process.env.domain}).json({ response: "2FA Code Sent to email." });
                    }
                });

                }


            
        } catch (err) {
            console.error("Error at Login:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    async mfa(req, res) {
        try {
            // Validate request body
            const schema = Joi.object({
                email: Joi.string().email().required(),
                mfaCode: Joi.string().required()
            });
            const { error } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            const token = req.cookies.temp; // Use the temporary token set during login
            if (!token) {
                return res.status(401).json({ error: "Not authenticated" });
            }

            jwt.verify(token, jwtSecret, (err, decoded) => {
                if (err) {
                    // Unset invalid cookie
                    return res.status(401).cookie("temp", "", { maxAge: 1 }).json({ error: "Not authenticated" });
                }
            });
        } catch (err) {
            console.error("Error at MFA Authenticator:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }   

        try{
            var input = req.body;
            const user = new User();

            // Check valid login
            const valid = await user.CheckMFA(input.email, input.mfaCode);
            if (!valid) {
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

                // Set the session
                var token = jwt.sign({ id: user.id, email: user.email, role: user.role, org: user.org }, jwtSecret, { expiresIn: '30m' });
                return res.status(200).cookie("jwt", token, {httpOnly: false, secure: true, same_site: "none", domain: process.env.domain})
                .cookie("temp", "", { maxAge: 1 }).json({ user: userData });
            }
        }
        catch (err) {
            console.error("Error at MFA:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    /** @type {express.RequestHandler} */
    logout(_, res) {
        try{
        // Unset the cookie
        res.status(200).cookie("jwt", "", { maxAge: 1 }).send();
        } catch (err) {
            console.error("Error at Logout:  ", err);
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
            console.error("Error at Authenticator:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }   
}
}