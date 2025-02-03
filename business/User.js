import { Organization } from '../business/Organization.js';
import { DB } from '../data_access/DB.js';
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
     * @param {String} hashedPass
     * @param {Organization} org
     * @param {String} role
     */
    constructor(id = null, firstName = null, lastName = null, email = null, hashedPass = null, org = null, role = null){
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.hashedPass = hashedPass;
        this.org = org;
        this.role = role;
    }

    /**
     * Checks if a login is valid. 
     * If it is, sets the user object variables to be that of the user logging in.
     * @param {String} email
     * @param {String} password
     * @returns {Boolean} loggin success
     */
    async CheckLogin (email, password) {
        const db = new DB();

       const user = await db.GetUserByEmail(email);

        // Check if user was found
        if (!user) { return false; }

        // Check if password is correct
        const match = await bcrypt.compare(password, user.hashedPass)

        // If match, set user object to user object returned by db
        if (match) { Object.assign(this, user); return true; }
        else { return false; }
    }
}