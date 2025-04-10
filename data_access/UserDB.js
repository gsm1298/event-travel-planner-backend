//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { User } from '../business/User.js';
import { Organization } from '../business/Organization.js';
import { logger } from '../service/LogService.mjs';
//import { Event } from '../business/Event.js';

// Init child logger instance
const log = logger.child({
    dataAccess: "userDb", //specify module where logs are from
});

const baseUserQuery =
    `
    SELECT 
        user.user_id, user.first_name, user.last_name, user.email, user.phone_num,
        user.gender, user.title, user.hashed_password, user.mfa_secret,
        user.profile_picture, user.org_id, organization.name AS 'org_name',
        user.known_traveler_number, user.department, user.role_id, role.name AS 'role_name',
        user.mfa_enabled, user.date_of_birth, user.last_login, user.created, user.last_edited
    FROM user
        LEFT JOIN organization ON user.org_id = organization.org_id
        LEFT JOIN role ON user.role_id = role.role_id
`;

export class UserDB extends DB {
    constructor() {
        super();
    }

    /**
     * Create a new user in the database
     * @param {User} user
     * @returns {Promise<Integer>} The ID of the inserted user
     */
    createUser(user) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO user (first_name, last_name, email, hashed_password, title, phone_num, gender, date_of_birth, profile_picture, org_id, role_id)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT role.role_id FROM role WHERE role.name = ? LIMIT 1))
            `;
            const params = user.org?.id
                ? user.role
                    ? [user.firstName, user.lastName, user.email, user.hashedPass, user.title, user.phoneNum, user.gender, user.dob, user.profilePic, user.org.id, user.role]
                    : [user.firstName, user.lastName, user.email, user.hashedPass, user.title, user.phoneNum, user.gender, user.dob, user.profilePic, user.org.id, 1]
                : (() => { reject('Organization ID not set'); })();

            this.executeQuery(query, params, "createUser")
                .then(result => {
                    if (result.insertId > 0) {
                        log.verbose("user created", { userId: user.id, userEmail: user.email, userOrgId: user.org.id });
                        resolve(result.insertId);
                    } else { resolve(null); }
                }).catch(error => reject(error));
        });
    }

    /**
     * Update the last login time of a user
     * @param {Integer} userId
     * @returns {Promise<Boolean>} True if the update was successful
     */
    updateUsersLastLogin(userId) {
        return new Promise((resolve, reject) => {
            const query = `UPDATE user SET last_login = NOW() WHERE user_id = ?`;
            this.executeQuery(query, [userId], "updateUsersLastLogin")
                .then(result => {
                    if (result.affectedRows > 0) {
                        log.verbose("user last login updated", { userId: userId });
                        resolve(true);
                    } else { resolve(null); }
                }).catch(error => reject(error));
        });
    }

    /**
     * Update an existing user in the database
     * @param {User} user
     * @returns {Promise<Boolean>} True if the update was successful
     */
    updateUser(user) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE user
                SET first_name = ?, last_name = ?, email = ?, hashed_password = ?, mfa_secret = ?, title = ?, phone_num = ?, gender = ?, date_of_birth = ?, profile_picture = ?, org_id = ?, mfa_enabled = ?
                WHERE user_id = ?
            `;
            const params = [user.firstName, user.lastName, user.email, user.hashedPass, JSON.stringify(user.mfaSecret), user.title, user.phoneNum, user.gender, user.dob, user.profilePic, user.org.id, user.mfaEnabled, user.id];

            this.executeQuery(query, params, "updateUser")
                .then(result => {
                    log.verbose("user updated", { userId: user.id, userEmail: user.email, userOrgId: user.org.id });
                    resolve(result.affectedRows > 0);
                }).catch(error => reject(error));
        });
    }

    /**
     * Gets a user based on a given email.
     * @param {String} email
     * @returns {Promise<User>} user object
     */
    GetUserByEmail(email) {
        return new Promise((resolve, reject) => {
            const query = baseUserQuery + 'WHERE user.email = ?';
            this.executeQuery(query, [email], "GetUserByEmail")
                .then(rows => {
                    if (rows.length > 0) {
                        const row = rows[0];
                        log.verbose("user requested by email", { userEmail: email, userId: row.user_id });
                        resolve(new User(
                            row.user_id, row.first_name, row.last_name, row.email,
                            row.phone_num, row.gender, row.title, row.profile_picture,
                            new Organization(row.org_id, row.org_name),
                            row.role_name, row.hashed_password, JSON.parse(row.mfa_secret), Boolean(row.mfa_enabled?.readUIntLE(0, 1)), row.date_of_birth
                        ));
                    } else { resolve(null); }
                }).catch(error => reject(error));
        });
    }

    /**
     * Gets a user based on a given id.
     * @param {Integer} id
     * @returns {Promise<User>} user object
     */
    GetUserById(id) {
        return new Promise((resolve, reject) => {
            const query = baseUserQuery + 'WHERE user.user_id = ?';
            this.executeQuery(query, [id], "GetUserById")
                .then(rows => {
                    if (rows.length > 0) {
                        const row = rows[0];
                        log.verbose("user requested by id", { userEmail: row.email, userId: id });
                        resolve(new User(
                            row.user_id, row.first_name, row.last_name, row.email,
                            row.phone_num, row.gender, row.title, row.profile_picture,
                            new Organization(row.org_id, row.org_name),
                            row.role_name, row.hashed_password, JSON.parse(row.mfa_secret), Boolean(row.mfa_enabled?.readUIntLE(0, 1)), row.date_of_birth
                        ));
                    } else { resolve(null); }
                }).catch(error => reject(error));
        });
    }

    /**
     * Gets all users.
     * @returns {Promise<User[]>} Array of user object
     */
    GetAllUsers() {
        return new Promise((resolve, reject) => {
            const query = baseUserQuery;
            this.executeQuery(query, [], "GetAllUsers")
                .then(rows => {
                    if (rows.length > 0) {
                        resolve(rows.map(row => new User(
                            row.user_id, row.first_name, row.last_name, row.email,
                            row.phone_num, row.gender, row.title, row.profile_picture,
                            new Organization(row.org_id, row.org_name),
                            row.role_name, row.hashed_password, JSON.parse(row.mfa_secret), Boolean(row.mfa_enabled?.readUIntLE(0, 1)), row.date_of_birth
                        )));
                    } else { resolve(null); }
                }).catch(error => reject(error));
        });
    }

    /**
    * Gets all users in an org.
    * @param {Integer} orgId
    * @returns {Promise<User[]>} Array of user object
    */
    GetAllUsersFromOrg(orgId) {
        return new Promise((resolve, reject) => {
            const query = baseUserQuery + 'WHERE user.org_id = ?';
            this.executeQuery(query, [orgId], "GetAllUsersFromOrg")
                .then(rows => {
                    if (rows.length > 0) {
                        resolve(rows.map(row => new User(
                            row.user_id, row.first_name, row.last_name, row.email,
                            row.phone_num, row.gender, row.title, row.profile_picture,
                            new Organization(row.org_id, row.org_name),
                            row.role_name, row.hashed_password, JSON.parse(row.mfa_secret), Boolean(row.mfa_enabled?.readUIntLE(0, 1)), row.date_of_birth
                        )));
                    } else { resolve(null);}
                }).catch(error => reject(error));
        });
    }

    /**
    * Gets all attendees of an event.
    * @param {Integer} eventId
    * @returns {Promise<User[]>} Array of user object
    */
    GetAllAttendeesInEvent(eventId) {
        return new Promise((resolve, reject) => {
            const query = baseUserQuery + `
                LEFT JOIN attendee on user.user_id = attendee.user_id
                WHERE attendee.event_id = ?
            `;
            this.executeQuery(query, [eventId], "GetAllAttendeesInEvent")
                .then(rows => {
                    if (rows.length > 0) {
                        resolve(rows.map(row => new User(
                            row.user_id, row.first_name, row.last_name, row.email,
                            row.phone_num, row.gender, row.title, row.profile_picture,
                            new Organization(row.org_id, row.org_name),
                            row.role_name, row.hashed_password, JSON.parse(row.mfa_secret), Boolean(row.mfa_enabled?.readUIntLE(0, 1)), row.date_of_birth
                        )));
                    } else { resolve(null); }
                }).catch(error => reject(error));
        });
    }

    /**
     * Get Attendee
     * @param {Integer} eventId
     * @param {Integer} userId
     * @returns {Promise<Integer>} Attendee ID
     */
    GetAttendee(eventId, userId) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT attendee_id FROM attendee WHERE event_id = ? AND user_id = ?';
            this.executeQuery(query, [eventId, userId], "GetAttendee")
                .then(rows => resolve(rows[0] || null))
                .catch(error => reject(error));
        });
    }

    /**
     * Get User via Attendee
     * @param {Integer} attendeeId
     * @returns {Promise<User>} user
     */
    GetUserByAttendee(attendeeId) {
        return new Promise((resolve, reject) => {
            const query = baseUserQuery + `
                JOIN attendee ON attendee.user_id = user.user_id WHERE attendee.attendee_id = ?
            `;
            this.executeQuery(query, [attendeeId], "GetUserByAttendee")
                .then(rows => {
                    if (rows.length > 0) {
                        const row = rows[0];
                        log.verbose("user requested by attendee", { attendeeId: attendeeId, userId: row.user_id });
                        resolve(new User(
                            row.user_id, row.first_name, row.last_name, row.email,
                            row.phone_num, row.gender, row.title, row.profile_picture,
                            new Organization(row.org_id, row.org_name),
                            row.role_name, row.hashed_password, JSON.parse(row.mfa_secret), Boolean(row.mfa_enabled?.readUIntLE(0, 1)), row.date_of_birth
                        ));
                    } else { resolve(null); }
                }).catch(error => reject(error));
        });
    }
}