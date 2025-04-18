import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import ejs, { render } from 'ejs';
import { User } from '../business/User.js';
import { logger } from '../service/LogService.mjs';
import JoiBase from 'joi';
import JoiDate from '@joi/date';
import { Email } from '../business/Email.js';
import { UserDB } from '../data_access/UserDB.js';

dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

const Joi = JoiBase.extend(JoiDate); // Extend Joi with date validation

// Init child logger instance
const log = logger.child({
    service: "authService", //specify module where logs are from
});

// Set jwtSecret from env file
const jwtSecret = process.env.jwtSecret;



export class AuthService {
    /**
     * @constructor
     * 
     * @param {express.Application} app
     */
    constructor(app) {

        app.post('/auth/login', this.login);
        app.post('/auth/mfa', this.mfa);
        app.post('/auth/register', this.registerUser);
        app.post('/auth/forgotPassword', this.forgotPassword);

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
                log.verbose("invlid user attempted authentication", { email: input.email });
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

                // Create an email object. From, to, subject, text
                // const email = new Email('no-reply@jlabupch.uk', user.email, 
                //     'Your Two-Factor Authentication Code', 'Your verification code is: ' + otp);

                // Email template
                const templatePath = path.join(process.cwd(), 'email_templates', '2faEmail.ejs');

                // Prepare data to pass into template
                const templateData = {
                    otp: otp
                };

                let htmlContent;
                try {
                    htmlContent = await ejs.renderFile(templatePath, templateData);
                } catch (renderErr) {
                    log.error("Error rendering email template:", renderErr);
                }

                // Send email using generated htmlContent
                const email = new Email('no-reply@jlabupch.uk', user.email,
                    'Your Two-Factor Authentication Code', null,
                    htmlContent
                );

                // Send the email
                email.sendEmail();

                //Create a temporary token to send to the user
                var token = jwt.sign({ response: "2FA Code Sent to email.", email: user.email, userId: user.id }, jwtSecret, { expiresIn: '5m' });
                return res.status(200).cookie("temp", token, { httpOnly: false, secure: true, sameSite: "none", domain: process.env.domain, maxAge: 300000 }).json({ response: "2FA Code Sent to email." });

            }



        } catch (err) {
            log.error("Error at Login:  ", err);
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
                log.verbose("invlid temporary MFA token");
                return res.status(401).json({ error: "Not authenticated" });
            }

            jwt.verify(token, jwtSecret, (err, decoded) => {
                if (err) {
                    // Unset invalid cookie
                    return res.status(401).cookie("temp", "", { httpOnly: false, secure: true, sameSite: "none", domain: process.env.domain, maxAge: 1 }).json({ error: "Not authenticated" });
                }
                res.locals.user = decoded;
            });
        } catch (err) {
            log.error("Error at MFA Authenticator:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }

        try {
            var input = req.body;
            const user = new User();

            // Check valid login
            const valid = await user.CheckMFA(input.email, input.mfaCode);
            if (!valid) {
                log.verbose("Incorrect 2FA code", { email: input.email, mfaCode: input.mfaCode });
                return res.status(401).json({ error: "Incorrect 2FA Code" });
            }
            else {
                // Check for JWT tampering or email switching in login
                if (res.locals.user.email !== input.email || res.locals.user.userId !== user.id) {
                    log.warn("Potential JWT tampering or email mismatch detected", {
                        expectedEmail: res.locals.user.email,
                        providedEmail: input.email,
                    });
                    return res.status(401).json({ error: "Authentication failed due to email mismatch" });
                }
                
                //LOGIN VALID, 2FA SUCCESS
                if (!user.mfaEnabled) {
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

                log.verbose("user MFA enabled, login sucessful", { userId: user.id, email: user.email }); //log a user with MFA enabled and a successful login

                // Set the session
                var token = jwt.sign({ id: user.id, email: user.email, role: user.role, org: user.org }, jwtSecret, { expiresIn: '30m' });
                return res.status(200).cookie("jwt", token, { httpOnly: false, secure: true, same_site: "none", domain: process.env.domain, maxAge: 1800000 })
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
        try {
            // Unset the cookie
            res.status(200).cookie("jwt", "", { httpOnly: false, secure: true, sameSite: "none", domain: process.env.domain, maxAge: 1 }).send();
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
        try {
            const token = req.cookies.jwt;
            if (!token) {
                return res.status(401).json({ error: "Not authenticated" });
            }

            jwt.verify(token, jwtSecret, (err, decoded) => {
                if (err) {
                    // Unset invalid cookie
                    return res.status(401).cookie("jwt", "", { httpOnly: false, secure: true, sameSite: "none", domain: process.env.domain, maxAge: 1 }).json({ error: "Not authenticated" });
                }

                res.locals.user = decoded;
                next();
            });
        } catch (err) {
            log.error("Error at Authenticator:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

      /**
     * Register a new user (public endpoint)
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
      async registerUser(req, res) {
        try {
            // Define strict Joi schema for registration
            const schema = Joi.object({
                firstName: Joi.string().required().min(2).max(50),
                lastName: Joi.string().required().min(2).max(50),
                email: Joi.string().email().required().max(100),
                phoneNum: Joi.string().min(10).max(10).required(),
                gender: Joi.string().valid('m', 'f').required(),
                title: Joi.string().valid('mr', 'mrs', 'ms', 'miss', 'dr').required(),
                profilePic: Joi.string().base64().optional(), 
                dob: Joi.date().format('YYYY-MM-DD').required().max('now').min('1900-01-01'),
                password: Joi.string().min(4).required()
            });

            // Validate request body
            const { error } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            const { firstName, lastName, email, phoneNum, gender, title, profilePic, dob, password } = req.body;

            // Check if email DOES NOT already exist. The email should already be in the system if invited to an event or created by admin.
            const existingUser = await User.GetUserByEmail(email);
            if (!existingUser) {
                return res.status(400).json({ error: "Email does not exist. User has not been invited to an event or was not created by an admin." });
            }

            // Create the user
            const newUser = new User(
                existingUser.id,
                firstName,
                lastName,
                existingUser.email,
                phoneNum,
                gender,
                title,
                profilePic,
                existingUser.org,  // org was set at account creation
                existingUser.role, // role was set at account creation
                await User.hashPass(password),  // hashedPass
                null,  // mfaSecret
                existingUser.mfaEnabled,  // mfaEnabled
                dob
            );
            

            // Save user to the database
            //console.log(newUser);
            const success = await newUser.save();

            if (!success) {
                log.error("was unable to register the new user", { userId: existingUser.id, email: newUser.email });
                return res.status(500).json({ error: "Unable to register user." });
            }

            log.verbose("new user registered", { userId: existingUser.id, email: newUser.email });
            res.status(201).json({ message: "User registered successfully" });
        } catch (err) {
            log.error("Error registering user:", err);
            res.status(500).json({ error: "Unable to register user." });
        }
    }

    /**
     * function that lets the user reset their password.
     * @param {express.Request} req - The request object
     * @param {express.Response} res - The response object
     * @function
     * @type {express.RequestHandler}
     */
    async forgotPassword(req, res) {
        const db = new UserDB();
        try {
            // Validate request body
            const schema = Joi.object({
                email: Joi.string().email().required()
            });
            const { error } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            var input = req.body;
            // TODO - validate req schema
            var user = new User();

            // Check valid login
            const validUser = await db.GetUserByEmail(input.email);

            if (!validUser) {
                // If the user is not valid, send a 401 error
                log.verbose("invlid user attempted password reset", { email: input.email });
                return res.status(401).json({ error: "Nonexistent user, incorrect email" });
            } else {
                // Create temp password
                var tempPass = await User.hashPass(validUser.email + Date.now() + Math.random() + validUser.org.id);

                tempPass = tempPass.substring(0, 12);
                validUser.pass = tempPass;
                validUser.hashedPass = await User.hashPass(tempPass);

                try {
                    const success = db.updateUser(validUser); // Update the user in the database
                    if (success) {
                        // Email template
                        const templatePath = path.join(process.cwd(), 'email_templates', 'forgotPassEmail.ejs');

                        // Prepare data to pass into template
                        const templateData = {
                            tempPass: validUser.pass
                        };

                        let htmlContent;
                        try {
                            htmlContent = await ejs.renderFile(templatePath, templateData);
                        } catch (renderErr) {
                            log.error("Error rendering email template:", renderErr);
                        }

                        // Send email using generated htmlContent
                        const email = new Email('no-reply@jlabupch.uk', input.email,
                            'Your Password has been Reset', null,
                            htmlContent
                        );

                        try {
                            // Send the email
                            email.sendEmail();
                            return res.status(200).json({ response: "Temporary password Sent to email." });
                        } catch (err) {
                            log.error("Error sending email:", err);
                            return res.status(500).json({ error: "Email sending failed" });
                        };
                    } else {
                        log.error("user could not be updated (forgot password)", { email: input.email });
                    }
                } catch (err) {
                    log.error("Error at DB user update in Forgot Password:  ", err);
                    res.status(500).json({ error: "Internal server error" });
                }
            }
        } catch (err) {
            log.error("Error at Forgot Password:  ", err);
            res.status(500).json({ error: "Internal server error" });
        } finally { db.close(); }
    }

    /**
     * function that checks if the user is authorized to do something.
     * @param {express.Request} req - The request object
     * @param {express.Response} res - The response object
     * @param {Array<String>} requiredRoles - The roles required to perform the action
     * @returns {Boolean} - True if the user is authorized, false otherwise
     */
    static authorizer(req, res, requiredRoles) {
        try {
            // Check if the user is a requried role
            if (!requiredRoles.includes(res.locals.user.role)) {
                return false
            }
            return true
        } catch (err) {
            log.error("Error at Authorizer:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }
}