import { Organization } from '../business/Organization.js';
import { UserDB } from '../data_access/UserDB.js';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import { logger } from '../service/LogService.mjs';

// Init child logger instance
const log = logger.child({
    business: "User", //specify module where logs are from
});

/**
 * @Class User
 */
export class User {
    /**
     * User object
     * @constructor
     * @param {Integer} id
     * @param {String} firstName
     * @param {String} lastName
     * @param {String} email
     * @param {String} phoneNum
     * @param {String} gender
     * @param {String} title
     * //Change back to blob. Made it string to test with current db pfpic - Nick
     * @param {String} profilePic
     * @param {Organization} org
     * @param {String} role
     * @param {String} hashedPass
     * @param {String} mfaSecret
     * @param {String} mfaEnabled
     * @param {String} dob
     */
    constructor(
        id = null, firstName = null, lastName = null, email = null,
        phoneNum = null, gender = null, title = null, profilePic = null,
        org = null, role = null, hashedPass = null, mfaSecret = null, mfaEnabled = null, dob = null
    ) {

        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.phoneNum = phoneNum;
        this.gender = gender;
        this.title = title;
        this.profilePic = profilePic;
        this.org = org;
        this.role = role;
        this.hashedPass = hashedPass;
        this.mfaSecret = mfaSecret;
        this.mfaEnabled = mfaEnabled;
        this.dob = dob;
    }

    /**
     * Generates a MFA secret for the user
     * This is used to generate a TOTP code for the user to use for MFA
     * @returns {secret}
     * 
     */
    async GenerateSecret() {
        // Generate a 6-digit TOTP code
        const secret = speakeasy.generateSecret({
            length: 20, // Length of the secret
        });
        this.mfaSecret = secret;
        await this.save(); // Save the secret to the database
    }

    /**
    * Generates a MFA token for the user
    * @returns {String} MFA token   
    */
    async GenerateToken() {
        const totpCode = speakeasy.totp({
            secret: this.mfaSecret.base32,
            encoding: 'base32',
            step: 60, // Time step in seconds, 1 minute
            digits: 6,
        });

        log.verbose("totp code generated");

        return totpCode; // Return the generated token
    }

    /**
     * Checks if a login is valid. 
     * If it is, sets the user object variables to be that of the user logging in.
     * @param {String} email
     * @param {String} password
     * @returns {Boolean} login success
     */
    async CheckLogin(email, password) {
        const db = new UserDB();
        try {
            const user = await db.GetUserByEmail(email);

            // Check if user was found
            if (!user) { return false; }

            log.verbose("user attempted to login", { email: email, userId: user.id }); // audit log the user login

            // Check if password is correct
            const match = await bcrypt.compare(password, user.hashedPass)

            // If match, set user object to user object returned by db
            if (match) { Object.assign(this, user); return true; }
            else { return false; }
        } catch (error) {
            log.error(error);
            log.error(new Error("Error trying to check login"));
        } finally { db.close(); }
    }

    /**
     * Checks if a MFA code is valid. 
     * If it is, sets the user object variables to be that of the user logging in.
     * @param {String} email
     * @param {String} mfaCode
     * @returns {Boolean} login success
     */
    async CheckMFA(email, mfaCode) {
        const db = new UserDB();
        try {
            const user = await db.GetUserByEmail(email);

            // Check if user was found
            if (!user) { return false; }

            if (!user.mfaSecret) { return false; } // No MFA secret set for user
            log.verbose("user exists upon check, mfa does not", { userId: user.id, email: email });
            // Check if 2FA code is correct
            //const match = await bcrypt.compare(mfaCode, user.hashedMfaCode)

            // Verify the token
            const match = speakeasy.totp.verify({
                secret: user.mfaSecret.base32,
                encoding: "base32",
                token: mfaCode,
                step: 60, // Match the generation step (1 minute)
                window: 1, // Allow a +/- 1 step (so 180s total: 60s before, 60s current, 60s after)
            });

            log.verbose("user mfa token success", { userId: user.id, email: email });

            // If match, set user object to user object returned by db
            if (match) { Object.assign(this, user); return true; }
            else { return false; }
        } catch (error) {
            log.error(error);
            log.error(new Error("Error trying to check login"));
        } finally { db.close(); }
    }

    /**
     * Hashes a password
     * @param {String} password
     * @returns {String} hashed password
     */
    static async hashPass(password) {
        return bcrypt.hash(password, 10);
    }

    /**
    * Save user to database (Create if new, Update if exists)
    * @returns {Promise<Boolean>} If the User was successfuly saved
    * @throws {Error}
    */
    async save() {
        const db = new UserDB();
        try {
            if (this.id) {
                const success = await db.updateUser(this);
                log.verbose("user updated on save request", { userId: this.id });
                return success
            } else {
                const userId = await db.createUser(this);
                this.id = userId;  // Assign new ID after insertion
                log.verbose("new user created on save request", { userId: this.id });
                return this.userId ? true : false;
            }
        } catch (error) {
            log.error(error);
            log.error(new Error("Error trying to save user"));
        } finally { db.close(); }
    }

    /**
     *  Imports users from an array of user objects
     *  @param {User[]} users - Array of user objects to import
     *  @returns {Promise<void>}
     *  @throws {Error}
     */
    static async importUsers(users) {
        const db = new UserDB();
        try {
            users.forEach(async (user) => {
                // Check if user already exists
                const existingUser = await db.GetUserByEmail(user.email);
                if (existingUser) {
                    log.verbose("user already exists (user import)", { email: user.email });
                }
                else { // User does not exist, create new user
                    log.verbose("user does not exist, creating new user (user import)", { email: user.email });

                    // Create temp password
                    var tempPass = await User.hashPass(user.email + Date.now() + Math.random() + user.org.id);
                    tempPass = tempPass.substring(0, 12);
                    user.pass = tempPass;
                    user.hashedPass = await User.hashPass(tempPass);

                    const id = await db.createUser(user);

                    // Check if user was created successfully
                    if (id > 0) {
                        log.verbose("user succefully created (user import)", { email: user.email });
                        const email = new Email('no-reply@jlabupch.uk', user.email, "Account Created", `An account has been created for you.\n\nYour temporary password is: ${user.pass}`);
                        await email.sendEmail();
                    } else {
                        log.error("user could not be created (user import)", { email: user.email });
                    }
                }
            });
        } catch (error) {
            log.error(error);
            log.error(new Error("Error trying to import users"));
        } finally { db.close(); }
    }

    /**
     * Gets a user by their id
     * @param {Intager} id
     * @returns {User} User object
     */
    static async GetUserById(id) {
        const db = new UserDB();
        try {
            const user = await db.GetUserById(id);

            return user;
        } catch (error) {
            log.error(error);
            log.error(new Error("Error trying get user by id"));
        } finally { db.close(); }
    }

        /**
     * Gets a user by their email
     * @param {String} email
     * @returns {User} User object
     */
        static async GetUserByEmail(email) {
            const db = new UserDB();
            try {
                const user = await db.GetUserByEmail(email);
    
                return user;
            } catch (error) {
                log.error(error);
                log.error(new Error("Error trying get user by email"));
            } finally { db.close(); }
        }

    /**
     * Gets all users
     * @returns {User[]} Array of User objects
     */
    static async GetAllUsers() {
        const db = new UserDB();
        try {
            const users = await db.GetAllUsers();

            return users;
        } catch (error) {
            log.error(error);
            log.error(new Error("Error trying get all users"));
        } finally { db.close(); }
    }

    /**
     * Gets all users in an org
     * @param {Intager} orgId
     * @returns {User[]} Array of User objects
     */
    static async GetAllUsersFromOrg(orgId) {
        const db = new UserDB();
        try {
            const users = await db.GetAllUsersFromOrg(orgId);

            return users;
        } catch (error) {
            log.error(error);
            log.error(new Error("Error trying get all users from org"));
        } finally { db.close(); }
    }

    /**
     * Gets all users in an event
     * @param {Intager} eventId
     * @returns {User[]} Array of User objects
     */
    static async GetAllAttendeesInEvent(eventId) {
        const db = new UserDB();
        try {
            const users = await db.GetAllAttendeesInEvent(eventId);

            return users;
        } catch (error) {
            log.error(error);
            log.error(new Error("Error trying get all users in event"));
        } finally { db.close(); }
    }

    /**
     * Get Attendee ID
     * @param {Integer} eventId 
     * @param {Integer} userId 
     */
    static async GetAttendee(eventId, userId) {
        const db = new UserDB();

        try {
            const id = await db.GetAttendee(eventId, userId);

            return id.attendee_id;
        } catch (error) {
            log.error(error);
            log.error(new Error("Error trying get attendee ID"));
        } finally { db.close(); }
    }

    /**
     * Get flight user
     * @param {Integer} attendeeId
     * @returns {User} user
     */
    static async GetUserByAttendee(attendeeId) {
        const db = new UserDB();

        try {
            const user = await db.GetUserByAttendee(attendeeId);

            return {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phoneNum: user.phoneNum
            }
        }catch (error) {
            log.error(error);
            log.error(new Error("Error trying get User"));
        } finally { db.close(); }
    }
}