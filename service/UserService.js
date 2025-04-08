import { User } from "../business/User.js";
import Joi from 'joi';
import { logger } from '../service/LogService.mjs';
import { AuthService } from './AuthService.js';

// Init child logger instance
const log = logger.child({
    service: "userService", //specify module where logs are from
});

export class UserService {
    /**
     * @constructor
     * 
     * @param {express.Application} app
     */
    constructor(app) {
        this.app = app;

        // Define all routes for user operations
        this.app.post('/user', this.createUser);
        this.app.get('/user/:id', this.getUserById);
        this.app.get('/users', this.getUsers);
        this.app.put('/user/:id', this.updateUser);
    }

    /**
    * Create a new user
    * @param {express.Request} req
    * @param {express.Response} res
    * @returns {Promise<void>}
    */
    async createUser(req, res) {
        try {
            // Check if user is admin
            if (!AuthService.authorizer(req, res, ["Site Admin", "Org Admin"])) {
                log.verbose("unauthorized user attempted to create a user", { userId: res.locals.user.id })
                return res.status(403).json({ error: "Unauthorized access" });
            }

            // Define Joi schemas
            const schema = Joi.object({
                email: Joi.string().email().required(),
                role: Joi.string().valid('Org Admin', 'Attendee', 'Event Planner', 'Finance Manager').required(),
                org: Joi.number().required(),
            });

            // Validate request body
            const { error } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            // Use data from the request body and authenticated user
            const { email, role, org } = req.body;

            // Create the user
            const newUser = new User(null, null, null, email, null, null, null, null, org, role, null, null, null, null);
            var tempPass = await User.hashPass(attendee.email + Date.now() + Math.random() + userOrg.id);
            tempPass = tempPass.substring(0, 12);
            newUser.pass = tempPass;
            newUser.hashedPass = await User.hashPass(tempPass);


            // Save user to the database
            await newUser.save();

            const sendEmail = new Email('no-reply@jlabupch.uk', newUser.email, "Account Created", `There has been an accound created for you.\n\n Your temporary password is: ${newUser.pass}`);
            await sendEmail.sendEmail();

            // Respond with the created event ID
            res.status(201).json({ message: "User created successfully" });
            log.verbose("new user created", { userId: newUser.id, email: newUser.email }); //this may error out due to user not having an ID yet as it is unassigned by the DB
        } catch (err) {
            log.error("Error creating user:", err);
            res.status(500).json({ error: "Unable to create user." });
        }
    }

    /** @type {express.RequestHandler} */
    async updateUser(req, res) {
        try {

            // Check if user is admin or the user themselves
            if (!AuthService.authorizer(req, res, ["Site Admin", "Org Admin"]) && res.locals.user.id != req.params.id) {
                log.verbose("unauthorized user attempted to update a user", { userId: res.locals.user.id })
                return res.status(403).json({ error: "Unauthorized access" });
            }

            // Define Joi schemas
            const schema = Joi.object({
                firstName: Joi.string().optional(),
                lastName: Joi.string().optional(),
                email: Joi.string().email().optional(),
                phoneNum: Joi.string().optional(),
                gender: Joi.string().valid('m', 'f').optional(),
                title: Joi.string().valid('mr', 'mrs', 'ms', 'miss', 'dr').optional(),
                dob: Joi.date().optional(),
                profilePic: Joi.string().allow(null, '').optional(),
                password: Joi.string().min(6).optional(),
            });

            // Validate request body
            const { error } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            const { firstName, lastName, email, phoneNum, gender, title, dob, profilePic, password = null } = req.body;
            const userId = req.params.id

            // Retrieve the Organization by ID
            const user = await User.GetUserById(userId);
            if (!user) { return res.status(404).json({ message: "User not found" }); }

            // Update User Object fields
            Object.assign(user, req.body);
            user.hashedPass = password ? await User.hashPass(password) : user.hashedPass;

            // Update User in DB
            const updatedUser = await user.save();
            if (updatedUser) {
                log.verbose("user updated", {
                    userId: userId,
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    phoneNum: phoneNum,
                    gender: gender,
                    title: title,
                    profilePic: profilePic
                });
                res.status(200).json({ message: "User updated successfully" });
            }
            else { res.status(500).json({ error: "Unable to update User." }); }
        } catch (err) {
            log.error("Error at Update User:  ", err);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    /** @type {express.RequestHandler} */
    async getUserById(req, res) {
        try {
            const userId = req.params.id;

            // Check if user is admin or the user themselves
            if (!AuthService.authorizer(req, res, ["Site Admin", "Org Admin"]) && res.locals.user.id != userId) {
                log.verbose("unauthorized user attempted to get a user", { userId: res.locals.user.id })
                return res.status(403).json({ error: "Unauthorized access" });
            }
            
            const user = await User.GetUserById(userId);
            if (user) {
                // Remove some of the fields and create new object to return
                const returnUser = 
                    { 
                        id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, 
                        phoneNum: user.phoneNum, gender: user.gender, title: user.title, profilePic: user.profilePic,
                        role: user.role, org: { id: user.org.id, name: user.org.name }, dob: user.dob
                    };

                res.status(200).json(returnUser);
            } else {
                res.status(404).json({ message: "User not found" });
            }
        } catch (err) {
            log.error("Error getting user:", err);
            res.status(500).json({ error: "Unable to get user." });
        }
    }

    /** @type {express.RequestHandler} */
    async getUsers(req, res) {
        try {
            // Check if user is admin
            if (!AuthService.authorizer(req, res, ["Site Admin", "Org Admin"])) {
                log.verbose("unauthorized user attempted to get all users", { userId: res.locals.user.id })
                return res.status(403).json({ error: "Unauthorized access" });
            }

            const users = await User.GetAllUsers();
            if (users.length > 0) {
                res.status(200).json(users);
            } else {
                res.status(404).json({ message: "Users not found" });
            }
        } catch (err) {
            log.error("Error getting all Users:", err);
            res.status(500).json({ error: "Unable to get Users." });
        }
    }

}