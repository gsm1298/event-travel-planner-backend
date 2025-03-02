import { Organization } from '../business/Organization.js';
import { UserDB } from '../data_access/UserDB.js';
import bcrypt from 'bcrypt';
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
     * @param {Blob} profilePic
     * @param {Organization} org
     * @param {String} role
     * @param {String} hashedPass
     */
    constructor(
        id = null, firstName = null, lastName = null, email = null,
        phoneNum = null, gender = null, title = null, profilePic = null,
        org = null, role = null, hashedPass = null
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
    }

    /**
     * Checks if a login is valid. 
     * If it is, sets the user object variables to be that of the user logging in.
     * @param {String} email
     * @param {String} password
     * @returns {Boolean} loggin success
     */
    async CheckLogin(email, password) {
        const db = new UserDB();
        try {
            const user = await db.GetUserByEmail(email);

            // Check if user was found
            if (!user) { return false; }

            // Check if password is correct
            const match = await bcrypt.compare(password, user.hashedPass)

            // If match, set user object to user object returned by db
            if (match) { Object.assign(this, user); return true; }
            else { return false; }
        } catch (error) {
            // TODO - Log error
            console.error(error);
            throw new Error("Error trying to check login");
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
            // TODO - Log error
            console.error(error);
            throw new Error("Error trying get user by id");
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
            // TODO - Log error
            console.error(error);
            throw new Error("Error trying get all users");
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
            // TODO - Log error
            console.error(error);
            throw new Error("Error trying get all users from org");
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
            // TODO - Log error
            console.error(error);
            throw new Error("Error trying get all users in event");
        } finally { db.close(); }
    }

}