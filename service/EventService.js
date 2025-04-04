import express from 'express';
import { Event } from '../business/Event.js'; // Event model
import { User } from '../business/User.js'; // User model
import { AuthService } from './AuthService.js'; // Assuming you already have the AuthService
import Joi from 'joi';
import { logger } from '../service/LogService.mjs'; // logging
import { Email } from '../business/Email.js';


// Init child logger instance
const log = logger.child({
    service : "eventService", //specify module where logs are from
});
export class EventService {
    /**
     * @constructor
     * @param {express.Application} app
     */
    constructor(app) {
        this.app = app;

        // Define all routes for event operations
        this.app.post('/events', this.createEvent);
        this.app.post('/events/invite/new', this.inviteNewAttendee);
        this.app.get('/events/:id', this.getEventById);
        this.app.get('/events', this.getEvents);
        this.app.put('/events/:id', this.updateEvent);
        this.app.delete('/events/:id', this.deleteEvent);
    }

    // ALL CRUD OPERATIONS BELOW
    
    /**
     * Create a new event and return the event ID
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async createEvent(req, res) {
        try {
            // Joi schema for validation
            const schema = Joi.object({
                name: Joi.string().required(),
                destinationCode: Joi.string().required(),
                startDate: Joi.date().required(),
                endDate: Joi.date().required(),
                financeMan: Joi.object({id: Joi.number().integer().required()}).required(),
                description: Joi.string().optional(),
                pictureLink: Joi.string().uri().optional(),
                maxBudget: Joi.number().positive().required(),
                autoApprove: Joi.boolean().optional(),
                autoApproveThreshold: Joi.number().positive().optional(),
                attendees: Joi.array().items(Joi.object({id: Joi.number().integer().required()})).optional()
            });

            // Validate request body
            const { error } = schema.validate(req.body);
            if (error) {
                log.error("error validating event request body", error);
                return res.status(400).json({ error: error.details[0].message });
            }

            // Use data from the request body and authenticated user
            const { name, destinationCode, startDate, endDate, financeMan, inviteLink, description, pictureLink, maxBudget, autoApprove, autoApproveThreshold } = req.body;
            const user = res.locals.user;  // user from authenticator middleware
            const userOrg = res.locals.user.org;  // user organization from authenticator middleware
            const currentBudget = maxBudget;

            // Create the event
            const newEvent = new Event(
                null,  // ID will be auto-generated
                name, 
                destinationCode,
                user,  // createdBy will be the current user
                financeMan,
                startDate,
                endDate,
                userOrg,  // org will be the current user's org
                inviteLink,
                description,
                pictureLink,
                maxBudget,
                currentBudget,
                autoApprove,
                autoApproveThreshold
            );
            
            log.verbose("creating new event", {
                name: newEvent.name,
                userId: newEvent.userId,  
                financeMan: newEvent.financeMan,
                startDate: newEvent.startDate,
                endDate: newEvent.endDate,
                userOrg: newEvent.userOrg,  
                inviteLink: newEvent.inviteLink,
                description: newEvent.description,
                pictureLink: newEvent.inviteLink,
                maxBudget: newEvent.maxBudget,
                currentBudget: newEvent.currentBudget
            })

            // Save event to the database
            const eventId = await newEvent.save();

            // Update the event budget history
            await newEvent.updateBudgetHistory(user.id);

            // Add attendees to the event
            if (req.body.attendees) {
                await newEvent.addAttendees(req.body.attendees);
            }
            
            // Respond with the created event ID
            res.status(201).json({ message: "Event created successfully", eventId });
        } catch (err) {
            log.error("Error creating event:", err);
            res.status(500).json({ error: "Unable to create event." });
        }
    }

    /**
     * Invite a new attendee to an event
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async inviteNewAttendee(req, res) {
        try {
            const userOrg = res.locals.user.org;  // user organization from authenticator middleware
            // Joi schema for validation
            const schema = Joi.object({
                eventId: Joi.number().integer().required(),
                attendee: Joi.object({email: Joi.string().email().required()}).required()
            });

            // Validate request body
            const { error } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            // Use data from the request body
            const { eventId, attendee } = req.body;

            // Retrieve the event by ID
            const event = await Event.findById(eventId);
            if (!event) {
                return res.status(404).json({ message: "Event not found" });
            }

            // Ensure the user is authorized to invite attendees to this event
            if (event.createdBy.id !== res.locals.user.id) {
                return res.status(403).json({ message: "Unauthorized: You cannot invite attendees to this event" });
            }

            //Create the new user
            const newAttendee = new User(null, null, null, attendee.email, null, null, null, null, userOrg, null, null, null, null, null);
            var tempPass = await User.hashPass(attendee.email + Date.now() + Math.random() + userOrg.id);
            tempPass = tempPass.substring(0, 12);
            newAttendee.pass = tempPass;
            newAttendee.hashedPass = await User.hashPass(tempPass);

            // Save user to the database
            await newAttendee.save();

            // Add the new attendee to the event
            await event.addNewAttendee(newAttendee);

            res.status(200).json({ message: "Attendee invited successfully" });
        } catch (err) {
            console.error("Error inviting attendee:", err);
            res.status(500).json({ error: "Unable to invite attendee." });
        }
    }

    /**
     * Get event by ID
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async getEventById(req, res) {
        try {
            const eventId = req.params.id;

            // Get the event by ID
            const event = await Event.findById(eventId);

            // Get event history
            const eventHistory = await Event.getEventHistory(eventId);

            // Add history to the event object
            event.history = eventHistory;

            if (event) {
                res.status(200).json(event);
            } else {
                res.status(404).json({ message: "Event not found" });
            }
        } catch (err) {
            log.error("Error retrieving event:", err);
            res.status(500).json({ error: "Unable to fetch event." });
        }
    }

    /**
     * Get events for a given user
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async getEvents(req, res) {
        try {
            const events = await Event.getEvents(res.locals.user.id, res.locals.user.role);
            res.status(200).json(events);
        } catch (err) {
            log.error("Error retrieving events:", err);
            res.status(500).json({ error: "Unable to fetch events." });
        }
    }

    /**
     * Get all events
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async getAllEvents(req, res) {
        try {
            const events = await Event.findAll();
            res.status(200).json(events);
        } catch (err) {
            log.error("Error retrieving all events:", err);
            res.status(500).json({ error: "Unable to fetch events." });
        }
    }

    /**
     * Update an existing event by ID
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async updateEvent(req, res) {
        try {
            const schema = Joi.object({
                name: Joi.string().optional(),
                destinationCode: Joi.string().optional(),
                startDate: Joi.date().optional(),
                endDate: Joi.date().optional(),
                financeMan: Joi.object({id: Joi.number().integer().required()}).optional(),
                description: Joi.string().optional(),
                pictureLink: Joi.string().uri().optional(),
                maxBudget: Joi.number().positive().optional(),
                autoApprove: Joi.boolean().optional(),
                autoApproveThreshold: Joi.number().optional()
            });

            // Validate request body
            const { error } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: error.details[0].message });
            }

            const eventId = req.params.id;
            const eventData = req.body;
            const user = res.locals.user;  // user from authenticator middleware

            // Retrieve the event by ID
            const event = await Event.findById(eventId);
            if (!event) {
                return res.status(404).json({ message: "Event not found" });
            }

            // Ensure the user is authorized to update this event

            if (event.createdBy.id !== user.id && event.financeMan.id !== user.id) {
              log.verbose("user attempted to make unauthorized event modifications", { userId: user.id, event: event })
                return res.status(403).json({ message: "Unauthorized: You cannot update this event" });
            }

            const updatedBudget = (eventData.maxBudget && eventData.maxBudget != event.maxBudget);

            // Update event properties
            Object.assign(event, eventData);  // Update only the provided fields

            const success = await event.save();  // Save updated event

            if (success && updatedBudget) {
                // Update the event budget history
                await event.updateBudgetHistory(user.id);

                // Notify event planner of budget change.
                const email = new Email('no-reply@jlabupch.uk', event.createdBy.email, "Event Budget Updated", `The budget for ${event.name} has been updated to ${event.maxBudget}.`);
                await email.sendEmail();

            }


            if (success) {
                log.verbose("Event updated successfully", { userId: userId, event: event, eventData: eventData });
                res.status(200).json({ message: "Event updated successfully" });
            }
            else {
                log.verbose("Could not update event", { userId: userId, event: event, eventData: eventData });
                res.status(500).json({ message: "Could not update event" });
            }
        } catch (err) {
            log.error("Error updating event:", err);
            res.status(500).json({ error: "Unable to update event." });
        }
    }

    /**
     * Delete an event by ID
     * @param {express.Request} req
     * @param {express.Response} res
     * @returns {Promise<void>}
     */
    async deleteEvent(req, res) {
        try {
            const eventId = req.params.id;
            const userId = res.locals.user.id;  // user ID from authenticator middleware

            // Retrieve the event by ID
            const event = await Event.findById(eventId);
            if (!event) {
                return res.status(404).json({ message: "Event not found" });
            }

            // Ensure the user is authorized to delete this event
            if (event.createdBy !== userId) {
                log.verbose("Unauthorized user attempt to delete event", { userId: userId, event: event })
                return res.status(403).json({ message: "Unauthorized: You cannot delete this event" });
            }

            await Event.delete(eventId);  // Delete the event from the database
            log.verbose("Authorized user deleted event", { userId: userId, event: event })
            res.status(200).json({ message: "Event deleted successfully" });
        } catch (err) {
            log.error("Error deleting event:", err);
            res.status(500).json({ error: "Unable to delete event." });
        }
    }
}
