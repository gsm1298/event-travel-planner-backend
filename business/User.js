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
    ){

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
    async CheckLogin (email, password) {
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
        } catch(error) {
            // TODO - Log error
            console.error(error);
            throw new Error("Error trying to check login");
       } finally { db.close(); }
    }
}