import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import { User } from '../business/User.js';
import { logger } from '../service/LogService.mjs';
import Joi from 'joi';
import { Email } from '../business/Email.js';
import { UserDB } from '../data_access/UserDB.js';

dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

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

                const email = new Email('no-reply@jlabupch.uk', user.email,
                    'Your Two-Factor Authentication Code', null,
                    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color: #4c365d; padding: 40px 20px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Verification Required</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px 20px; text-align: center; background-color: #FFFFE2">
              <p style="font-size: 18px; color: #333333; margin: 0 0 10px;">Your verification code is:</p>
              <p style="font-size: 36px; color: #4c365d; margin: 0 0 20px; font-weight: bold;">${otp}</p>
              <p style="font-size: 16px; color: #666666; margin: 0;">Enter this code in the app to verify your account.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f0f0f0; padding: 20px; text-align: center;">
              <p style="font-size: 14px; color: #888888; margin: 0;">If you didn't request this, please ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
                );

                // Send the email
                await email.sendEmail();

                //Create a temporary token to send to the user
                var token = jwt.sign({ response: "2FA Code Sent to email." }, jwtSecret, { expiresIn: '5m' });
                return res.status(200).cookie("temp", token, { httpOnly: false, secure: true, sameSite: "none", domain: process.env.domain }).json({ response: "2FA Code Sent to email." });

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

                log.verbose("user MFA enabled, login sucessful", userData); //log a user with MFA enabled and a successful login

                // Set the session
                var token = jwt.sign({ id: user.id, email: user.email, role: user.role, org: user.org }, jwtSecret, { expiresIn: '30m' });
                return res.status(200).cookie("jwt", token, { httpOnly: false, secure: true, same_site: "none", domain: process.env.domain })
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
                        const email = new Email('no-reply@jlabupch.uk', validUser.email, 
                        'Your Temporary Password', null,
                        `<!DOCTYPE html>
                        <html>
                        <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Verification Code</title>
                        </head>
                        <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; padding: 20px 0;">
                            <tr>
                            <td align="center">
                                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                <!-- Header -->
                                <tr>
                                    <td align="center" style="background-color: #4c365d; padding: 40px 20px;">
                                    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Password Reset Requested</h1>
                                    </td>
                                </tr>
                                <!-- Body -->
                                <tr>
                                    <td style="padding: 40px 20px; text-align: center; background-color: #FFFFE2">
                                    <p style="font-size: 18px; color: #333333; margin: 0 0 10px;">Your Temporary Password is:</p>
                                    <p style="font-size: 36px; color: #4c365d; margin: 0 0 20px; font-weight: bold;">${validUser.pass}</p>
                                    <p style="font-size: 16px; color: #666666; margin: 0;">Enter this password at the login prompt in the app to verify your account.</p>
                                    </td>
                                </tr>
                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #f0f0f0; padding: 20px; text-align: center;">
                                    <p style="font-size: 14px; color: #888888; margin: 0;">If you didn't request this, please ignore this email.</p>
                                    </td>
                                </tr>
                                </table>
                            </td>
                            </tr>
                        </table>
                        </body>
                        </html>
                        `
                    );
                        
                        await email.sendEmail();

                        return res.status(200).json({ response: "Temporary password Sent to email." });
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