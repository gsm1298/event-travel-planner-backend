import { Organization } from '../business/Organization.js';
import { User } from '../business/User.js';
import { EventDB } from '../data_access/EventDB.js';

/**
 * @Class Event
 */
export class Event {
    /**
     * @constructor
     * @param {Integer} id
     * @param {String} name
     * @param {String} destinationCode
     * @param {User} createdBy
     * @param {User} financeMan
     * @param {Date} startDate
     * @param {Date} endDate
     * @param {Organization} org
     * @param {String} inviteLink
     * @param {String} description
     * @param {String} pictureLink
     * @param {Integer} maxBudget
     * @param {Integer} currentBudget
     * @param {Boolean} autoApprove
     * @param {Double} autoApproveThreshold
     */

    constructor(
        id = null, name = null, destinationCode = null, createdBy = null, financeMan = null, startDate = null, endDate = null, org = null, 
        inviteLink = null, description = null, pictureLink = null, maxBudget = null, currentBudget = null, autoApprove = null, autoApproveThreshold = null
    ){
        this.id = id;
        this.name = name;
        this.destinationCode = destinationCode;
        this.createdBy = createdBy;
        this.financeMan = financeMan;
        this.startDate = startDate;
        this.endDate = endDate;
        this.org = org;
        this.inviteLink = inviteLink;
        this.description = description;
        this.pictureLink = pictureLink;
        this.maxBudget = maxBudget;
        this.currentBudget = currentBudget;
        this.autoApprove = autoApprove;
        this.autoApproveThreshold = autoApproveThreshold;
    }

    /**
     * Save event to database (Create if new, Update if exists)
     * @returns {Promise<Integer>} The event ID
     * @throws {Error}
     */
    async save() {
        const db = new EventDB();
        try {
            if (this.id) {
                const success = await db.updateEvent(this);
                return success ? this.id : null;
            } else {
                const eventId = await db.createEvent(this);
                this.id = eventId;  // Assign new ID after insertion
                return eventId;
            }
        } catch(error) {
             // TODO - Log error
             console.error(error);
             throw new Error("Error trying to save event");
        } finally { db.close(); }
    }

    /**
     * Find an event by ID
     * @param {Integer} eventId
     * @returns {Promise<Event|null>}
     * @throws {Error}
     */
    static async findById(eventId) {
        const db = new EventDB();
        try {
            return await db.readEvent(eventId);
        } catch(error) {
            // TODO - Log error
            console.error(error);
            throw new Error("Error trying to find event by id");
       } finally {
            db.close();
        }
    }

    /**
     * Gets all events for a user
     * @param {Integer} useId
     * @param {String} userRole
     * @returns {Promise<Event[]>} Array of Event objects
     * @throws {Error}
     */
    static async getEvents(userId, userRole) {
        const db = new EventDB();
        try {
            // TODO: Check for permissions before returning events, as events may be private/inaccessible to user.
            var eventsData;
            switch(userRole) {
                case "Attendee":
                    eventsData = await db.getEventsForAttendee(userId);
                    break;
                case "Event Planner":
                    eventsData = await db.getEventsCreatedByUser(userId);
                    break;
                case "Finance Manager":
                    eventsData = await db.getEventsForFinanceManager(userId);
                    break;
            }
            return eventsData.map(event => new Event(
                event.id, event.name, event.destinationCode, event.createdBy, event.financeMan, event.startDate, event.endDate, event.org, 
                event.inviteLink, event.description, event.pictureLink, event.maxBudget, event.currentBudget, event.autoApprove, event.autoApproveThreshold
            ));
        } catch(error) {
            // TODO - Log error
            console.error(error);
            throw new Error("Error trying to get events");
       } finally {
            db.close();
        }
    }

    /**
     * Find all events
     * @returns {Promise<Event[]>} Array of Event objects
     * @throws {Error}
     */
    static async findAll() {
        const db = new EventDB();
        try {
            // TODO: Check for permissions before returning all events, as events may be private/inaccessible to user.
            const eventsData = await db.getAllEvents();
            return eventsData.map(event => new Event(
                event.id, event.name, event.destinationCode, event.createdBy, event.financeMan, event.startDate, event.endDate, event.org, 
                event.inviteLink, event.description, event.pictureLink, event.maxBudget, event.currentBudget, event.autoApprove, event.autoApproveThreshold
            ));
        } catch(error) {
            // TODO - Log error
            console.error(error);
            throw new Error("Error trying to find all events");
       } finally {
            db.close();
        }
    }

    /**
     * Delete an event by ID
     * @param {Integer} eventId
     * @returns {Promise<Boolean>} True if deleted
     * @throws {Error}
     */
    static async delete(eventId) {
        const db = new EventDB();
        try {
            return await db.deleteEvent(eventId);
        } catch(error) {
            // TODO - Log error
            console.error(error);
            throw new Error("Error trying to delete event");
       } finally {
            db.close();
        }
    }

}
