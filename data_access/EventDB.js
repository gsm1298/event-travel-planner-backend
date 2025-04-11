//import mysql from 'mysql2';
//import dotenv from 'dotenv';
import { DB } from './DB.js'
import { User } from '../business/User.js';
import { Organization } from '../business/Organization.js';
import { Event } from '../business/Event.js';
import { logger } from '../service/LogService.mjs';
import { Flight } from '../business/Flight.js';

// Init child logger instance
const log = logger.child({
    dataAccess: "eventDb", //specify module where logs are from
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
                const params = [event.name, event.destinationCode, event.createdBy.id, event.financeMan.id, event.startDate, event.endDate, event.org.id, event.inviteLink, event.description, event.pictureLink, event.maxBudget, event.currentBudget, Boolean(event.autoApprove), event.autoApproveThreshold];

                log.verbose("event create request", { event: event.name, eventCreatedBy: event.createdBy }); // log event creation request

                this.executeQuery(query, params, "createEvent")
                    .then(result => {
                        if (result.insertId > 0) {
                            const historyQuery = `INSERT INTO eventhistory (event_id, updated_budget, updated_by) VALUES (?, ?, ?)`;
                            const historyParams = [result.insertId, event.maxBudget, event.createdBy.id];
                            return this.executeQuery(historyQuery, historyParams, "createEventHistory")
                                .then(() => resolve(result.insertId))
                                .catch(err => {
                                    log.error("error adding initial budget to event history", err);
                                    reject(err);
                                });
                        } else { resolve(null); }
                    })
                    .catch(err => { reject(err); });
            } catch (error) {
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
                this.executeQuery(query, [values], "addAttendeesToEvent")
                    .then(result => {
                        log.verbose("attendees added to event", { eventId: eventId, userId: attendees.toString });
                        resolve(result.affectedRows > 0);

                    })
                    .catch(err => { reject(err); });
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
                this.readEvent(event.id).then(oldEvent => {
                    var eventHistoryInsertQuery = `INSERT INTO eventhistory (event_id, updated_by,`;
                    var eventHistoryValues = `VALUES (?, ?,`;
                    var eventHistoryParams = [event.id, userId];
                    var updates = false;

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
                    if (flightId) {
                        eventHistoryInsertQuery += `approved_flight,`;
                        eventHistoryValues += `?,`;
                        eventHistoryParams.push(flightId);
                        updates = true;
                    }

                    if (!updates) {
                        resolve(false);
                        return;
                    }

                    eventHistoryInsertQuery = eventHistoryInsertQuery.slice(0, -1) + `)`;
                    eventHistoryValues = eventHistoryValues.slice(0, -1) + `)`;
                    const query = eventHistoryInsertQuery + ' ' + eventHistoryValues;

                    this.executeQuery(query, eventHistoryParams, "updateEventHistory")
                        .then(result => {
                            if (result.insertId > 0) {
                                log.verbose("event history updated", { eventId: event.id, userId: userId });
                                resolve(true);
                            } else { resolve(false); }
                        })
                        .catch(err => { reject(err); });
                }).catch(err => { reject(err); });
            } catch (error) {
                log.error("database try/catch error from updateEventHistory", error);
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

                this.executeQuery(query, [eventId], "readEvent")
                    .then(rows => {
                        if (rows.length > 0) {
                            const row = rows[0];
                            resolve(new Event(
                                row.event_id,
                                row.name,
                                row.destination_code,
                                new User(row.created_by_id, row.created_by_first_name, row.created_by_last_name,
                                    row.created_by_email, row.created_by_phone_num, null, null, row.created_by_profile_pic
                                ),
                                new User(
                                    row.finance_man_id, row.finance_man_first_name, row.finance_man_last_name,
                                    row.finance_man_email, row.finance_man_phone_num, null, null, row.finance_man_profile_pic
                                ),
                                row.start_date,
                                row.end_date,
                                new Organization(row.org_id, row.org_name),
                                row.invite_link,
                                row.description,
                                row.picture_link,
                                row.max_budget,
                                row.current_budget,
                                Boolean(row.autoapprove.readUIntLE(0, 1)),
                                row.autoapprove_threshold
                            ));
                        } else { resolve(null); }
                    })
                    .catch(err => { reject(err); });
            } catch (error) {
                log.error("database try/catch error from readEvent", error);
                reject(error);
            }
        });
    }

    /**
     * Get the history of an event from the database
     * @param {Integer} eventId
     * @returns {Promise<EventHistory[]>} Array of EventHistory objects
     */
    getEventHistory(eventId) {
        return new Promise((resolve, reject) => {
            try {
                const query = `
                    SELECT 
                        eventhistory.history_id, eventhistory.event_id, 
                        updater.user_id AS 'updater_id', updater.first_name AS 'updater_first_name', 
                        updater.last_name AS 'updater_last_name',
                        eventhistory.original_budget, eventhistory.updated_budget,
                        eventhistory.original_autoapprove, eventhistory.updated_autoapprove,
                        eventhistory.original_autoapprove_threshold, eventhistory.updated_autoapprove_threshold,
                        eventhistory.approved_flight,
                        flight.price AS 'flight_price', 
                        flight.order_id AS 'flight_order_id', flight.flight_number AS 'flight_number',
                        eventhistory.created, eventhistory.last_edited 
                    FROM eventhistory
                        LEFT JOIN user AS updater ON eventhistory.updated_by = updater.user_id
                        LEFT JOIN flight ON eventhistory.approved_flight = flight.flight_id
                    WHERE eventhistory.event_id = ?
                `;

                this.executeQuery(query, [eventId], "getEventHistory")
                    .then(rows => {
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
                                    approvedFlight: new Flight(row.approvedFlight, null, row.flight_price, null, null, null, null, null, null, null, null, null, row.flight_number, row.flight_order_id, null),
                                    created: row.created,
                                    lastEdited: row.last_edited
                                }))
                            );
                        }
                        else { resolve(null); }
                    })
                    .catch(err => { reject(err); });
            } catch (error) {
                log.error("database try/catch error from getEventHistory", error);
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
            try {
                const query = `
                    UPDATE event e
                    LEFT JOIN (
                        SELECT a.event_id, COALESCE(SUM(f.price), 0) AS total_flight_cost
                        FROM attendee a
                        LEFT JOIN flight f ON a.attendee_id = f.attendee_id AND f.status = 3
                        GROUP BY a.event_id
                    ) AS costs ON costs.event_id = e.event_id
                    SET 
                        e.name = ?,
                        e.destination_code = ?,
                        e.created_by = ?,
                        e.finance_man = ?,
                        e.start_date = ?,
                        e.end_date = ?,
                        e.org_id = ?,
                        e.invite_link = ?,
                        e.description = ?,
                        e.picture_link = ?,
                        e.max_budget = ?,
                        e.current_budget = ? - costs.total_flight_cost,
                        e.autoapprove = ?,
                        e.autoapprove_threshold = ?
                    WHERE e.event_id = ?;
                `;
                const params = [event.name, event.destinationCode, event.createdBy.id, event.financeMan.id, event.startDate, event.endDate, event.org.id, event.inviteLink, event.description, event.pictureLink, event.maxBudget, event.maxBudget, event.autoApprove, event.autoApproveThreshold, event.id];

                this.executeQuery(query, params, "updateEvent")
                    .then(result => {
                        log.verbose("event updated", { event: event.name, eventCreatedBy: event.createdBy });
                        resolve(result.affectedRows > 0);
                    })
                    .catch(err => { reject(err); });
            } catch (error) {
                log.error("database try/catch error from updateEvent", error);
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

                this.executeQuery(query, [eventId], "deleteEvent")
                    .then(result => {
                        log.verbose("event deleted", { eventId: eventId });
                        resolve(result.affectedRows > 0);
                    })
                    .catch(err => { reject(err); });
            } catch (error) {
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

                this.executeQuery(query, [], "getAllEvents")
                    .then(rows => {
                        const events = rows.map(row => new Event(
                            row.event_id,
                            row.name,
                            row.destination_code,
                            new User(row.created_by_id, row.created_by_first_name, row.created_by_last_name),
                            new User(row.finance_man_id, row.finance_man_first_name, row.finance_man_last_name),
                            row.start_date,
                            row.end_date,
                            new Organization(row.org_id, row.org_name),
                            row.invite_link,
                            row.description,
                            row.picture_link,
                            row.max_budget,
                            row.current_budget,
                            Boolean(row.autoapprove.readUIntLE(0, 1)),
                            row.autoapprove_threshold
                        ));
                        resolve(events);
                    })
                    .catch(err => { reject(err); });
            } catch (error) {
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

                this.executeQuery(query, [userId], "getEventsForAttendee")
                    .then(rows => {
                        const events = rows.map(row => new Event(
                            row.event_id,
                            row.name,
                            row.destination_code,
                            new User(row.created_by_id, row.created_by_first_name, row.created_by_last_name),
                            new User(row.finance_man_id, row.finance_man_first_name, row.finance_man_last_name),
                            row.start_date,
                            row.end_date,
                            new Organization(row.org_id, row.org_name),
                            row.invite_link,
                            row.description,
                            row.picture_link,
                            row.max_budget,
                            row.current_budget,
                            Boolean(row.autoapprove.readUIntLE(0, 1)),
                            row.autoapprove_threshold
                        ));
                        resolve(events);
                    })
                    .catch(err => { reject(err); });
            } catch (error) {
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

                this.executeQuery(query, [userId], "getEventsCreatedByUser")
                    .then(rows => {
                        const events = rows.map(row => new Event(
                            row.event_id,
                            row.name,
                            row.destination_code,
                            new User(row.created_by_id, row.created_by_first_name, row.created_by_last_name),
                            new User(row.finance_man_id, row.finance_man_first_name, row.finance_man_last_name),
                            row.start_date,
                            row.end_date,
                            new Organization(row.org_id, row.org_name),
                            row.invite_link,
                            row.description,
                            row.picture_link,
                            row.max_budget,
                            row.current_budget,
                            Boolean(row.autoapprove.readUIntLE(0, 1)),
                            row.autoapprove_threshold
                        ));
                        resolve(events);
                    })
                    .catch(err => { reject(err); });
            } catch (error) {
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

                this.executeQuery(query, [userId], "getEventsForFinanceManager")
                    .then(rows => {
                        const events = rows.map(row => new Event(
                            row.event_id,
                            row.name,
                            row.destination_code,
                            new User(row.created_by_id, row.created_by_first_name, row.created_by_last_name),
                            new User(row.finance_man_id, row.finance_man_first_name, row.finance_man_last_name),
                            row.start_date,
                            row.end_date,
                            new Organization(row.org_id, row.org_name),
                            row.invite_link,
                            row.description,
                            row.picture_link,
                            row.max_budget,
                            row.current_budget,
                            Boolean(row.autoapprove.readUIntLE(0, 1)),
                            row.autoapprove_threshold
                        ));
                        resolve(events);
                    })
                    .catch(err => { reject(err); });
            } catch (error) {
                log.error("database try/catch error from getEventsForFinanceManager", error);
                reject(error);
            }
        });
    }

    /**
     * Get all events from the database
     * @param {Integer} orgID
     * @returns {Promise<Event[]>} Array of Event objects
     */
    getPastEvents(orgID) {
        return new Promise((resolve, reject) => {
            try {
                const query = baseEventQuery;

                this.executeQuery(query, [], "getPastEvents")
                    .then(rows => {
                        const events = rows.map(row => new Event(
                            row.event_id,
                            row.name,
                            row.destination_code,
                            new User(row.created_by_id, row.created_by_first_name, row.created_by_last_name),
                            new User(row.finance_man_id, row.finance_man_first_name, row.finance_man_last_name),
                            row.start_date,
                            row.end_date,
                            new Organization(row.org_id, row.org_name),
                            row.invite_link,
                            row.description,
                            row.picture_link,
                            row.max_budget,
                            row.current_budget,
                            Boolean(row.autoapprove.readUIntLE(0, 1)),
                            row.autoapprove_threshold
                        ));
                        resolve(events);
                    })
                    .catch(err => { reject(err); });
            } catch (error) {
                log.error("database try/catch error from getPastEvents", error);
                reject(error);
            }
        });
    }
}