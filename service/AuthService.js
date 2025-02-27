import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import { User } from '../business/User.js';

dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

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
                return res.status(401).json({ error: "Incorrect email or password" });
            }

            // Set the session
            var token = jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '30m' });
            res.status(200).cookie("jwt", token).send();
        } catch (err) {
            console.error("Error at Login:  ", err);
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
                    return res.status(401).json({ error: "Not authenticated" });
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