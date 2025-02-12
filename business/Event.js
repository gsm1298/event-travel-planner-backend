import { Organization } from '../business/Organization.js';
import { DB } from '../data_access/DB.js';

/**
 * @Class Event
 */
export class Event {
    /**
     * @constructor
     * @param {Integer} id
     * @param {String} name
     * @param {Integer} createdBy
     * @param {Integer} financeMan
     * @param {Date} startDate
     * @param {Date} endDate
     * @param {Organization} org
     * @param {String} inviteLink
     * @param {String} description
     * @param {String} pictureLink
     * @param {Integer} maxBudget
     * @param {Integer} currentBudget
     */

    constructor(id = null, name = null, createdBy = null, financeMan = null, startDate = null, endDate = null, org = null, inviteLink = null, description = null, pictureLink = null, maxBudget = null, currentBudget = null){
        this.id = id;
        this.name = name;
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
    }

    /**
     * Save event to database (Create if new, Update if exists)
     * @returns {Promise<Integer>} The event ID
     */
    async save() {
        const db = new DB();
        try {
            if (this.id) {
                const success = await db.updateEvent(this);
                return success ? this.id : null;
            } else {
                const eventId = await db.createEvent(this);
                this.id = eventId;  // Assign new ID after insertion
                return eventId;
            }
        } finally {
            db.close();
        }
    }

    /**
     * Find an event by ID
     * @param {Integer} eventId
     * @returns {Promise<Event|null>}
     */
    static async findById(eventId) {
        const db = new DB();
        try {
            return await db.readEvent(eventId);
        } finally {
            db.close();
        }
    }

    /**
     * Find all events
     * @returns {Promise<Event[]>} Array of Event objects
     */
    static async findAll() {
        const db = new DB();
        try {
            // TODO: Check for permissions before returning all events, as events may be private/inaccessible to user.
            const eventsData = await db.getAllEvents();
            return eventsData.map(event => new Event(event.id, event.name, event.createdBy, event.financeMan, event.startDate, event.endDate, event.org, event.inviteLink, event.description, event.pictureLink, event.maxBudget, event.currentBudget));
        } finally {
            db.close();
        }
    }

    /**
     * Delete an event by ID
     * @param {Integer} eventId
     * @returns {Promise<Boolean>} True if deleted
     */
    static async delete(eventId) {
        const db = new DB();
        try {
            return await db.deleteEvent(eventId);
        } finally {
            db.close();
        }
    }

}
