import { Organization } from '../business/Organization.js';
import { User } from '../business/User.js';
import { EventDB } from '../data_access/EventDB.js';
import { Email } from '../business/Email.js';
import { logger } from '../service/LogService.mjs';
import ejs, { render } from 'ejs';
import path from 'path';

// Init child logger instance
const log = logger.child({
    dataAccess : "event", //specify module where logs are from
});


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
             log.error(error);
             log.error(new Error("Error trying to save event"));
        } finally { db.close(); }
    }

    /**
     * Check if the event is over
     * @returns {Boolean} True if the event is over, false otherwise
     * @throws {Error}
     */
    CheckIfEventIsOver() {
        const today = new Date();
        const endDate = new Date(this.endDate);
        return today > endDate;
    }

    /**
     * Check if the event has started
     * @returns {Boolean} True if the event has started, false otherwise
     * @throws {Error}
     */
    CheckIfEventHasStarted() {
        const today = new Date();
        const startDate = new Date(this.startDate);
        return today > startDate;
    }

    /**
     * Update the event history
     * @returns {Promise<void>}
     * @param {Integer} userId - The user ID of the user who is updating the event history
     * @param {Integer | null} flightId - The flight ID of the flight being approved (optional)
     * @returns {Promise<void>}
     * @throws {Error}
     */
    async updateEventHistory(userId, flightId = null) {
        const db = new EventDB();
        try {
            log.verbose("history for event updated", { userId: userId, eventId: this.id });
            await db.updateEventHistory(this, userId, flightId);
        } catch(error) {
            log.error(error);
            log.error(Error("Error trying to update budget history"));
        } finally { db.close(); }
    }

    /**
     * Add attendees to the event
     * @param {Array} attendees
     * @returns {Promise<void>}
     * @throws {Error}
     */
    async addAttendees(attendees) {
        const db = new EventDB();
        try {
            await db.addAttendeesToEvent(this.id, attendees);

            attendees.forEach(async attendee => {
                const user = await User.GetUserById(attendee.id);

                // Email template
                const templatePath = path.join(process.cwd(), 'email_templates', 'attendeeInviteEmail.ejs');

                // Prepare data to pass into template
                const templateData = { eventName: this.name };

                let htmlContent;
                try {
                    htmlContent = await ejs.renderFile(templatePath, templateData);
                } catch (renderErr) {
                    log.error("Error rendering email template:", renderErr);
                }

                // Send email using generated htmlContent
                const email = new Email('no-reply@jlabupch.uk', user.email,
                    'Event Invitation', null,
                    htmlContent
                );

                // Send the email
                email.sendEmail();
                log.verbose("attendee invited to event", { email: attendee.email, eventId: this.id });
            });
        } catch(error) {
            log.error(error);
            log.error(Error("Error trying to add attendees to event"));
        } finally { db.close(); }
    }

    /**
     * Add a new attendee to the event
     * @param {User} attendee
     * @returns {Promise<void>}
     * @throws {Error}
     */
    async addNewAttendee(attendee) {
        const db = new EventDB();
        try {
            await db.addAttendeesToEvent(this.id, [attendee]);
            //const email = new Email('no-reply@jlabupch.uk', attendee.email, "Event Invitation", `You have been invited to the event ${this.name}. \n\n Your temporary password is: ${attendee.pass}`);
            //email.sendEmail();


            const templatePath = path.join(process.cwd(), 'email_templates', 'newAttendeeInvite.ejs');
            const templateData = {
                attendee: { firstName: attendee.firstName, pass: attendee.pass },
                eventName: this.name
            };
            

            const htmlContent = await ejs.renderFile(templatePath, templateData);

            const email = new Email(
            'no-reply@jlabupch.uk',
            attendee.email,
            'Event Invitation',
            null,
            htmlContent
            );

            email.sendEmail();



            log.verbose("new attendee added", { email: attendee.email });
        } catch(error) {
            log.error(error);
            log.error(Error("Error trying to add new attendee to event"));
        } finally { db.close(); }
    }

    /**
     * Get all attendees for the event
     * @returns {Promise<User[]>} Array of User objects
     * @throws {Error}
     */
    async getAttendees() {
        const db = new EventDB();
        try {
            return db.getAttendeesForEvent(this.id);
        } catch(error) {
            log.error(error);
            log.error(Error("Error trying to get attendees for event"));
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
            log.error(error);
            log.error(new Error("Error trying to find event by id"));
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
                    log.verbose("event retireved by attendee", { userId: userId });
                    break;
                case "Event Planner":
                    eventsData = await db.getEventsCreatedByUser(userId);
                    log.verbose("event retireved by event planner", { userId: userId });
                    break;
                case "Finance Manager":
                    eventsData = await db.getEventsForFinanceManager(userId);
                    log.verbose("event retireved by finance manager", { userId: userId });
                    break;
            }
            return eventsData.map(event => new Event(
                event.id, event.name, event.destinationCode, event.createdBy, event.financeMan, event.startDate, event.endDate, event.org, 
                event.inviteLink, event.description, event.pictureLink, event.maxBudget, event.currentBudget, event.autoApprove, event.autoApproveThreshold
            ));
        } catch(error) {
            log.error(error);
            log.error(new Error("Error trying to get events"));
       } finally {
            db.close();
        }
    }

    /**
     * Get event history by event ID
     * @param {Integer} eventId
     * @returns {Promise<Object[]>} Array of Event History objects
     * @throws {Error}
     */
    static async getEventHistory(eventId) {
        const db = new EventDB();
        try {
            return await db.getEventHistory(eventId);
        } catch(error) {
            log.error(error);
            log.error(new Error("Error trying to get event history"));
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
            log.error(error);
            log.error(new Error("Error trying to find all events"));
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
            log.verbose("event deleted", { eventId: eventId });
            return await db.deleteEvent(eventId);
        } catch(error) {
            log.error(error);
            log.error(new Error("Error trying to delete event"));
       } finally {
            db.close();
        }
    }

}
