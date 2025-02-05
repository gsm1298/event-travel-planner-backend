import mysql from 'mysql2';
import dotenv from 'dotenv';
import { User } from '../business/User.js';
import { Organization } from '../business/Organization.js';
import { Event } from '../business/Event.js';

dotenv.config();

/**
 * @Class DB
 */
export class DB {
    constructor(con = mysql) {
        //change database credentials
        this.con = mysql.createConnection({
            host: process.env.host,
            port: process.env.port,
            user: process.env.user,
            password: process.env.password,
            database: process.env.database
        });
        this.con.connect(function (err) {
            if (err) throw err;
        });
    }

    close() {
        this.con.end();
    }

    // ALL EVENT METHODS

    /**
     * Create a new event in the database
     * @param {Event} event
     * @returns {Promise<Integer>} The ID of the inserted event
     */
    createEvent(event) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO events (name, createdBy, financeMan, startDate, endDate, org, inviteLink, description, pictureLink, maxBudget, currentBudget)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const params = [event.name, event.createdBy, event.financeMan, event.startDate, event.endDate, event.org, event.inviteLink, event.description, event.pictureLink, event.maxBudget, event.currentBudget];

            this.con.query(query, params, (err, result) => {
                if (err) {
                    console.error(err);
                    reject(err);
                } else {
                    resolve(result.insertId);
                }
            });
        });
    }

    /**
     * Read an event from the database by ID
     * @param {Integer} eventId
     * @returns {Promise<Event|null>} The event object or null if not found
     */
    readEvent(eventId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM events WHERE id = ?`;
            
            this.con.query(query, [eventId], (err, rows) => {
                if (err) {
                    console.error(err);
                    reject(err);
                } else {
                    if (rows.length > 0) {
                        const row = rows[0];
                        resolve(new Event(row.id, row.name, row.createdBy, row.financeMan, row.startDate, row.endDate, row.org, row.inviteLink, row.description, row.pictureLink, row.maxBudget, row.currentBudget));
                    } else {
                        resolve(null);
                    }
                }
            });
        });
    }

    /**
     * Update an existing event in the database
     * @param {Event} event
     * @returns {Promise<Boolean>} True if the update was successful
     */
    updateEvent(event) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE events
                SET name = ?, createdBy = ?, financeMan = ?, startDate = ?, endDate = ?, org = ?, inviteLink = ?, description = ?, pictureLink = ?, maxBudget = ?, currentBudget = ?
                WHERE id = ?`;
            const params = [event.name, event.createdBy, event.financeMan, event.startDate, event.endDate, event.org, event.inviteLink, event.description, event.pictureLink, event.maxBudget, event.currentBudget, event.id];

            this.con.query(query, params, (err, result) => {
                if (err) {
                    console.error(err);
                    reject(err);
                } else {
                    resolve(result.affectedRows > 0);
                }
            });
        });
    }

    /**
     * Delete an event from the database
     * @param {Integer} eventId
     * @returns {Promise<Boolean>} True if deletion was successful
     */
    deleteEvent(eventId) {
        return new Promise((resolve, reject) => {
            const query = `DELETE FROM events WHERE id = ?`;
            
            this.con.query(query, [eventId], (err, result) => {
                if (err) {
                    console.error(err);
                    reject(err);
                } else {
                    resolve(result.affectedRows > 0);
                }
            });
        });
    }

    /**
     * Get all events from the database
     * @returns {Promise<Event[]>} Array of Event objects
     */
    getAllEvents() {
        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM events`;

            this.con.query(query, (err, rows) => {
                if (err) {
                    console.error(err);
                    reject(err);
                } else {
                    // Map the database rows to Event objects
                    const events = rows.map(row => new Event(
                        row.id,
                        row.name,
                        row.createdBy,
                        row.financeMan,
                        row.startDate,
                        row.endDate,
                        row.org,
                        row.inviteLink,
                        row.description,
                        row.pictureLink,
                        row.maxBudget,
                        row.currentBudget
                    ));
                    resolve(events);
                }
            });
        });
    }

    

    // ALL USER METHODS BELOW
    
    /**
     * Gets a user based on a given email.
     * @param {String} email
     * @returns {User} user object
     */
    GetUserByEmail(email) {
        return new Promise((resolve, reject) => {
            try {
                var str = `
                    SELECT 
                        user.user_id, user.first_name, user.last_name, user.email, user.hashed_password, 
                        user.profile_picture, user.org_id, organization.name AS 'org_name',
                        user.known_traveler_number, user.department, user.role_id, role.name AS 'role_name',
                        user.2fa_enabled, user.last_login, user.created, user.last_edited
                    FROM user
                        LEFT JOIN organization ON user.org_id = organization.org_id
                        LEFT JOIN role ON user.role_id = role.role_id
                    WHERE user.email = ?`;
                this.con.query(str, [email], function (err, rows, fields) {
                    if (!err) {
                        if (rows.length > 0) {
                            var row = rows[0];
                            resolve(new User(row.user_id, row.first_name, row.last_name, row.email, row.hashed_password, 
                                new Organization(row.org_id, row.org_name), row.role_name)
                            );
                        } else { resolve(false); }
                    } else {
                        // TODO - error logging
                        console.log(err);
                        resolve(false);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.log(error);
                resolve(false);
            }
        });
    }
}