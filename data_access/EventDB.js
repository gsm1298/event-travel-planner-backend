//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { User } from '../business/User.js';
import { Organization } from '../business/Organization.js';
import { Event } from '../business/Event.js';
import { logger } from '../service/LogService.mjs';

// Init child logger instance
const log = logger.child({
    dataAccess : "eventDb", //specify module where logs are from
});


const baseEventQuery =
`
    SELECT
        event.event_id, event.name, event.destination_code,
        creator.first_name AS 'created_by_first_name', creator.last_name AS 'created_by_last_name', creator.email AS 'created_by_email',
        event.created_by AS 'created_by_id', creator.profile_picture AS 'created_by_profile_pic', creator.phone_num AS 'created_by_phone_num',
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

                log.verbose("event create request", { event: event.name, eventCreatedBy: event.createdBy }); // log event creation request

                this.con.query(query, params, (err, result) => {
                    if (!err) {
                        if (result.insertId > 0) {
                            // Insert into eventhistory table
                            this.con.query(`INSERT INTO eventhistory (event_id, updated_budget, updated_by) VALUES (?, ?, ?)`, [result.insertId, event.maxBudget, event.createdBy.id], (err, result) => {
                                if (err) {
                                    log.error("erorr adding inital budget to event history", err);
                                }
                            });
                            resolve(result.insertId);
                        }
                        else { resolve(null); }
                    } 
                    else {
                        log.error("database query error from createEvent", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from createEvent", error);
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
                log.verbose("attendees added to event", { eventId: eventId, userId: attendees.toString });
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
                        log.error(err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error(error);
                reject(error);
            }
        });
    }

    /**
     * Update the history of an event in the database
     * @param {Event} event
     * @param {Integer} userId - The ID of the user who updated the event
     * @param {Integer | null} flightId - The ID of the flight that was approved in the event (optional)
     * @returns {Promise<Boolean>} True if the update was successful
     * */
    updateEventHistory(event, userId, flightId = null) {
        return new Promise((resolve, reject) => {
            try {
                // Get the old event info
                this.readEvent(event.id).then(oldEvent => {

                    var eventHistoryInsertQuery = `INSERT INTO eventhistory (event_id, updated_by,`;
                    var eventHistoryValues = `VALUES (?, ?,`;
                    var eventHistoryParams = [event.id, userId];

                    // Boolean to make sure we only add the budget history if something was updated
                    var updates = false
                    
                    // Check what was updated and add to the query
                    if (oldEvent?.maxBudget != event.maxBudget) {
                        eventHistoryInsertQuery += `original_budget, updated_budget,`;
                        eventHistoryValues += `?,?,`;
                        eventHistoryParams.push(oldEvent?.maxBudget, event.maxBudget);
                        updates = true; 
                    }
                    if (oldEvent?.autoApprove != event.autoApprove) {
                        eventHistoryInsertQuery += `original_autoapprove, updated_autoapprove,`;
                        eventHistoryValues += `?,?,`;
                        eventHistoryParams.push(oldEvent?.autoApprove, event.autoApprove);
                        updates = true;
                    }
                    if (oldEvent?.autoApproveThreshold != event.autoApproveThreshold) {
                        eventHistoryInsertQuery += `original_autoapprove_threshold, updated_autoapprove_threshold,`;
                        eventHistoryValues += `?,?,`;
                        eventHistoryParams.push(oldEvent?.autoApproveThreshold, event.autoApproveThreshold);
                        updates = true;
                    }
                    if(flightId) {
                        eventHistoryInsertQuery += `approved_flight,`;
                        eventHistoryValues += `?,`;
                        eventHistoryParams.push(flightId);
                        updates = true;
                    }

                    if (!updates) {
                        resolve(false); // No updates to make
                        return;
                    }

                    // Combine the query parts
                    eventHistoryInsertQuery = eventHistoryInsertQuery.slice(0, -1) + `)`; // Remove the last comma and add closing parenthesis
                    eventHistoryValues = eventHistoryValues.slice(0, -1) + `)`; // Remove the last comma and add closing parenthesis
                    const query = eventHistoryInsertQuery + ' ' + eventHistoryValues; // Combine the query parts

                    this.con.query(query, eventHistoryParams, (err, result) => {
                        if (!err) {
                            console.log(result);
                            console.log(query);
                            console.log(eventHistoryParams);
                            if (result.insertId > 0) {
                                log.verbose("event history updated", { eventId: event.id, userId: userId });
                                resolve(true);
                            }
                            else { resolve(false); }
                        } 
                        else {
                            log.error(err);
                            reject(err);
                        }
                    });
                }).catch(err => {
                    log.error("error getting event to update history", err);
                    reject(err);
                });
            } catch (error) {
                log.error(error);
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
                                new User(row.created_by_id,row.created_by_first_name,row.created_by_last_name,
                                    row.created_by_email, row.created_by_phone_num, null, null, row.created_by_profile_pic
                                ),
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
                        log.error("database query error from readEvent", err);
                        reject(err);
                    }
                });
            } catch (error) {
                log.error("database try/catch error from readEvent", error);
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
                // TODO - Join flight table to get flight info if needed
                const query = `
                    SELECT 
                        eventhistory.history_id, eventhistory.event_id, 
                        updater.user_id AS 'updater_id', updater.first_name AS 'updater_first_name', 
                        updater.last_name AS 'updater_last_name',
                        eventhistory.original_budget, eventhistory.updated_budget,
                        eventhistory.original_autoapprove, eventhistory.updated_autoapprove,
                        eventhistory.original_autoapprove_threshold, eventhistory.updated_autoapprove_threshold,
                        eventhistory.approved_flight,
                        eventhistory.created, eventhistory.last_edited 
                    FROM eventhistory
                        LEFT JOIN user AS updater ON eventhistory.updated_by = updater.user_id
                    WHERE event_id = ?
                `;

                this.con.query(query, [eventId], (err, rows) => {
                    if (!err) {
                        if (rows.length > 0) {
                            resolve(
                                rows.map(row => ({
                                    id: row.history_id,
                                    eventId: row.event_id,
                                    updater: new User(row.updater_id, row.updater_first_name, row.updater_last_name),
                                    originalBudget: row.original_budget,
                                    updatedBudget: row.updated_budget,
                                    originalAutoApprove: Boolean(row.original_autoapprove?.readUIntLE(0, 1)),
                                    updatedAutoApprove: Boolean(row.updated_autoapprove?.readUIntLE(0, 1)),
                                    originalAutoApproveThreshold: row.original_autoapprove_threshold,
                                    updatedAutoApproveThreshold: row.updated_autoapprove_threshold,
                                    approvedFlight: row.approved_flight,
                                    // TODO - Add flight info if needed
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
                        log.verbose("event updated", { event: event.name, eventCreatedBy: event.createdBy }); // audit log the update request
                        resolve(result.affectedRows > 0);
                    } 
                    else {
                        log.error("database query error from updateEvent", err);
                        reject(err);
                    }
                });
            } catch(error) {
                log.error("database try/catch error from updateEvent",error);
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
                        log.verbose("event deleted", { eventId: eventId }); // audit log the deletion request
                        resolve(result.affectedRows > 0);
                    } 
                    else {
                        log.error("database query error from deleteEvent", err);
                        reject(err);
                    }
                });
            } catch(error) {
                log.error("database try/catch error from deleteEvent", error);
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
                        log.error("database query error from getAllEvents", err);
                        reject(err);
                    }
                });
            } catch(error) {
                log.error("database try/catch error from getAllEvents", error);
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
                        log.error("database query error from getEventsForAttendee", err);
                        reject(err);
                    }
                });
            } catch(error) {
                log.error("database try/catch error from getEventsForAttendee", error);
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
                        log.error("database query error from getEventsCreatedByUser", err);
                        reject(err);
                    }
                });
            } catch(error) {
                log.error("database try/catch error from getEventsCreatedByUser", error);
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
                        log.error("database query error from getEventsForFinanceManager", err);
                        reject(err);
                    }
                });
            } catch(error) {
                log.error("database try/catch error from getEventsForFinanceManager",error);
                reject(error);
            }
        });
    }
}