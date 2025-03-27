//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { User } from '../business/User.js';
import { Organization } from '../business/Organization.js';
import { Event } from '../business/Event.js';


const baseEventQuery =
`
    SELECT
        event.event_id, event.name, event.destination_code,
        creator.first_name AS 'created_by_first_name', creator.last_name AS 'created_by_last_name', creator.email AS 'created_by_email',  event.created_by AS 'created_by_id',
        finance.first_name AS 'finance_man_first_name', finance.last_name AS 'finance_man_last_name', event.finance_man AS 'finance_man_id',
        finance.email AS 'finance_man_email', finance.phone_num AS 'finance_man_phone_num', finance.profile_picture AS 'finance_man_profile_pic',
        event.start_date, event.end_date,
        organization.name AS 'org_name', event.org_id,
        event.invite_link, event.description, event.picture_link, event.max_budget, event.current_budget, event.autoapprove, event.autoapprove_threshold,
        event.created, event.last_edited
    FROM event
        LEFT JOIN organization ON event.org_id = organization.org_id
        LEFT JOIN user AS creator ON event.created_by = creator.user_id
        LEFT JOIN user AS finance ON event.finance_man = finance.user_id
`;

export class EventDB extends DB {
    constructor() {
        super();
    }

    // ALL EVENT METHODS

    /**
     * Create a new event in the database
     * @param {Event} event
     * @returns {Promise<Integer>} The ID of the inserted event
     */
    createEvent(event) {
        return new Promise((resolve, reject) => {
            try {
                const query = `
                    INSERT INTO event (name, destination_code, created_by, finance_man, start_date, end_date, org_id, invite_link, description, picture_link, max_budget, current_budget, autoapprove, autoapprove_threshold)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                const params = [event.name, event.destinationCode, event.createdBy.id, event.financeMan.id, event.startDate, event.endDate, event.org.id, event.inviteLink, event.description, event.pictureLink, event.maxBudget, event.currentBudget, event.autoApprove, event.autoApproveThreshold];

                this.con.query(query, params, (err, result) => {
                    if (!err) {
                        if (result.insertId > 0) {
                            resolve(result.insertId);
                        }
                        else { resolve(null); }
                    } 
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }

        });
    }

    /**
     * Add attendees to an event in the database
     * @param {Integer} eventId
     * @param {User[]} attendees
     * @returns {Promise<Boolean>} True if attendees were added successfully
     */
    addAttendeesToEvent(eventId, attendees) {
        return new Promise((resolve, reject) => {
            try {
                const query = `
                    INSERT INTO attendee (event_id, user_id)
                    VALUES ?
                `;
                const values = attendees.map(attendee => [eventId, attendee.id]);

                this.con.query(query, [values], (err, result) => {
                    if (!err) {
                        resolve(result.affectedRows > 0);
                    } 
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * Update the budget history of an event in the database
     * @param {Event} event
     * @param {Integer} userId
     * @returns {Promise<Boolean>} True if the update was successful
     * */
    updateEventBudgetHistory(event, userId) {
        return new Promise((resolve, reject) => {
            try {
                const query = `
                    INSERT INTO eventbudgethistory (event_id, budget, updated_by)
                    VALUES (?, ?, ?)
                `;
                const params = [event.id, event.maxBudget, userId];

                this.con.query(query, params, (err, result) => {
                    if (!err) {
                        resolve(result.affectedRows > 0);
                    } 
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * Read an event from the database by ID
     * @param {Integer} eventId
     * @returns {Promise<Event|null>} The event object or null if not found
     */
    readEvent(eventId) {
        return new Promise((resolve, reject) => {
            try {
                const query = baseEventQuery + 'WHERE event.event_id = ?';
                
                this.con.query(query, [eventId], (err, rows) => {
                    if (!err) {
                        if (rows.length > 0) {
                            const row = rows[0];
                            resolve(new Event(
                                row.event_id,
                                row.name,
                                row.destination_code,
                                new User(row.created_by_id,row.created_by_first_name,row.created_by_last_name,row.created_by_email),
                                new User(
                                    row.finance_man_id,row.finance_man_first_name,row.finance_man_last_name,
                                    row.finance_man_email,row.finance_man_phone_num,null,null,row.finance_man_profile_pic
                                ),
                                row.start_date,
                                row.end_date,
                                new Organization(row.org_id,row.org_name),
                                row.invite_link,
                                row.description,
                                row.picture_link,
                                row.max_budget,
                                row.current_budget,
                                Boolean(row.autoapprove.readUIntLE(0, 1)),
                                row.autoapprove_threshold
                            ));
                        } 
                        else { resolve(null); }
                    } 
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * Get the budget history of an event from the database
     * @param {Integer} eventId
     * @returns {Promise<EventBudgetHistory[]>} Array of EventBudgetHistory objects
     */
    getEventHistory(eventId) {
        return new Promise((resolve, reject) => {
            try {
                const query = `
                    SELECT 
                        eventbudgethistory.history_id, eventbudgethistory.event_id, eventbudgethistory.budget, 
                        updater.user_id AS 'updater_id', updater.first_name AS 'updater_first_name', 
                        updater.last_name AS 'updater_last_name', 
                        eventbudgethistory.created, eventbudgethistory.last_edited 
                    FROM eventbudgethistory
                        LEFT JOIN user AS updater ON eventbudgethistory.updated_by = updater.user_id
                    WHERE event_id = ?
                `;

                this.con.query(query, [eventId], (err, rows) => {
                    if (!err) {
                        if (rows.length > 0) {
                            resolve(
                                rows.map(row => ({
                                    id: row.history_id,
                                    eventId: row.event_id,
                                    budget: row.budget,
                                    updater: new User(row.updater_id, row.updater_first_name, row.updater_last_name),
                                    created: row.created,
                                    lastEdited: row.last_edited
                                }))
                            );
                        } 
                        else { resolve(null); }
                    } 
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch (error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * Update an existing event in the database
     * @param {Event} event
     * @returns {Promise<Boolean>} True if the update was successful
     */
    updateEvent(event) {
        return new Promise((resolve, reject) => {
            try{
                const query = `
                    UPDATE event
                    SET name = ?, destination_code = ?, created_by = ?, finance_man = ?, start_date = ?, end_date = ?, org_id = ?, invite_link = ?, description = ?, picture_link = ?, max_budget = ?, current_budget = ?, autoapprove = ?, autoapprove_threshold = ?
                    WHERE event_id = ?
                `;
                const params = [event.name, event.destinationCode, event.createdBy.id, event.financeMan.id, event.startDate, event.endDate, event.org.id, event.inviteLink, event.description, event.pictureLink, event.maxBudget, event.currentBudget, event.autoApprove, event.autoApproveThreshold, event.id];

                this.con.query(query, params, (err, result) => {
                    if (!err) {
                        resolve(result.affectedRows > 0);
                    } 
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch(error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * Delete an event from the database
     * @param {Integer} eventId
     * @returns {Promise<Boolean>} True if deletion was successful
     */
    deleteEvent(eventId) {
        return new Promise((resolve, reject) => {
            try {
                const query = `DELETE FROM event WHERE event_id = ?`;
                
                this.con.query(query, [eventId], (err, result) => {
                    if (!err) {
                        resolve(result.affectedRows > 0);
                    } 
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch(error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * Get all events from the database
     * @returns {Promise<Event[]>} Array of Event objects
     */
    getAllEvents() {
        return new Promise((resolve, reject) => {
            try {
                const query = baseEventQuery;

                this.con.query(query, (err, rows) => {
                    if (!err) {
                         // Map the database rows to Event objects
                         const events = rows.map(row => new Event(
                            row.event_id,
                            row.name,
                            row.destination_code,
                            new User(row.created_by_id,row.created_by_first_name,row.created_by_last_name),
                            new User(row.finance_man_id,row.finance_man_first_name,row.finance_man_last_name),
                            row.start_date,
                            row.end_date,
                            new Organization(row.org_id,row.org_name),
                            row.invite_link,
                            row.description,
                            row.picture_link,
                            row.max_budget,
                            row.current_budget,
                            Boolean(row.autoapprove.readUIntLE(0, 1)),
                            row.autoapprove_threshold
                        ));
                        
                        resolve(events);
                    } 
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch(error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * Get events the user is an attendee of from the database
     * @param {Integer} userId
     * @returns {Promise<Event[]>} Array of Event objects
     */
    getEventsForAttendee(userId) {
        return new Promise((resolve, reject) => {
            try {
                const query = baseEventQuery + 
                    `
                            LEFT JOIN attendee on event.event_id = attendee.event_id
					    WHERE attendee.user_id = ?
                    `;

                this.con.query(query, [userId], (err, rows) => {
                    if (!err) {
                         // Map the database rows to Event objects
                         const events = rows.map(row => new Event(
                            row.event_id,
                            row.name,
                            row.destination_code,
                            new User(row.created_by_id,row.created_by_first_name,row.created_by_last_name),
                            new User(row.finance_man_id,row.finance_man_first_name,row.finance_man_last_name),
                            row.start_date,
                            row.end_date,
                            new Organization(row.org_id,row.org_name),
                            row.invite_link,
                            row.description,
                            row.picture_link,
                            row.max_budget,
                            row.current_budget,
                            Boolean(row.autoapprove.readUIntLE(0, 1)),
                            row.autoapprove_threshold
                        ));
                        
                        resolve(events);
                    } 
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch(error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * Get events the user created from the database
     * @param {Integer} userId
     * @returns {Promise<Event[]>} Array of Event objects
     */
    getEventsCreatedByUser(userId) {
        return new Promise((resolve, reject) => {
            try {
                const query = baseEventQuery + 'WHERE event.created_by = ?';

                this.con.query(query, [userId], (err, rows) => {
                    if (!err) {
                         // Map the database rows to Event objects
                         const events = rows.map(row => new Event(
                            row.event_id,
                            row.name,
                            row.destination_code,
                            new User(row.created_by_id,row.created_by_first_name,row.created_by_last_name),
                            new User(row.finance_man_id,row.finance_man_first_name,row.finance_man_last_name),
                            row.start_date,
                            row.end_date,
                            new Organization(row.org_id,row.org_name),
                            row.invite_link,
                            row.description,
                            row.picture_link,
                            row.max_budget,
                            row.current_budget,
                            Boolean(row.autoapprove.readUIntLE(0, 1)),
                            row.autoapprove_threshold
                        ));
                        
                        resolve(events);
                    } 
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch(error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }

    /**
     * Get events the user created from the database
     * @param {Integer} userId
     * @returns {Promise<Event[]>} Array of Event objects
     */
    getEventsForFinanceManager(userId) {
        return new Promise((resolve, reject) => {
            try {
                const query = baseEventQuery + 'WHERE event.finance_man = ?';

                this.con.query(query, [userId], (err, rows) => {
                    if (!err) {
                         // Map the database rows to Event objects
                         const events = rows.map(row => new Event(
                            row.event_id,
                            row.name,
                            row.destination_code,
                            new User(row.created_by_id,row.created_by_first_name,row.created_by_last_name),
                            new User(row.finance_man_id,row.finance_man_first_name,row.finance_man_last_name),
                            row.start_date,
                            row.end_date,
                            new Organization(row.org_id,row.org_name),
                            row.invite_link,
                            row.description,
                            row.picture_link,
                            row.max_budget,
                            row.current_budget,
                            Boolean(row.autoapprove.readUIntLE(0, 1)),
                            row.autoapprove_threshold
                        ));
                        
                        resolve(events);
                    } 
                    else {
                        // TODO - error logging
                        console.error(err);
                        reject(err);
                    }
                });
            } catch(error) {
                // TODO - error logging
                console.error(error);
                reject(error);
            }
        });
    }
}