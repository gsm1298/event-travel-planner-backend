import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import ejs from 'ejs';
import { Duffel } from '@duffel/api';
import { User } from '../business/User.js';
import { Flight } from '../business/Flight.js';
import { Util } from '../business/Util.js';
import Joi from 'joi';
import { logger } from '../service/LogService.mjs';
import Amadeus from 'amadeus';
import { Email } from '../business/Email.js';
import { Event } from '../business/Event.js';
import { AuthService } from './AuthService.js';

// Init child logger instance
const log = logger.child({
    service: "flightService", //specify module where logs are from

});

//Initialize env config and load in env for appropriate modules
dotenv.config({ path: [`${path.dirname('.')}/.env.backend`, `${path.dirname('.')}/../.env`] });

const duffel = new Duffel({
    token: `${process.env.duffelToken}`
})

const amadeus = new Amadeus({
    clientId: `${process.env.amadeusToken}`,
    clientSecret: `${process.env.amadeusSecret}`
})

// Flight Service Class
export class FlightService {
    /**
     * @constructor
     * 
     * @param {express.Application} app
     */
    constructor(app) {
        app.post('/flights/search', this.search);

        app.post('/flights/hold', this.hold);

        app.post('/flights/booking', this.booking);

        app.get('/flights/eventflights/:id', this.getEventFlights);

        app.get('/flights/bookedflight/:id', this.getBookedFlight);
    }


    // Endpoints -----------------------------------------------------------------

    // Search for Flight
    /**@type {express.RequestHandler} */
    async search(req, res) {

        // Check if the user is an attendee
        if (!AuthService.authorizer(req, res, ["Attendee"])) {
            log.verbose("unauthorized user attempted to search for a flight", { userId: res.locals.user.id });
            return res.status(403).json({ error: "Unauthorized access" });
        }

        // Init some variables
        var input = req.body;
        var origin_airport;

        // JOI Validation
        const schema = Joi.object({
            lat: Joi.number().unsafe().required(),
            long: Joi.number().unsafe().required(),
            departure_date: Joi.string().isoDate().required(),
            return_date: Joi.string().isoDate().optional(),
            destination: Joi.string().required(),
            type: Joi.number().required()
        });

        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        // Call to Amadeus to return list of closest airport codes
        // Accepts in a longitude and latitude value provided by Google Places API from Front
        try {
            await amadeus.referenceData.locations.airports.get({
                latitude: input.lat, longitude: input.long
            }).then(resp => {
                origin_airport = resp.data[0].iataCode;
            })
        } catch (err) {
            log.error("Error at Flight Search", err);
            return res.status(500).json({ error: "Internal server error" });
        }

        // Instantiate vars before the try/catch block for scoping
        var offers;
        var data = [];

        try {
            // Generate offer search and call Duffel api
            // Generate one-way or round trip based on input type value
            if (input.type == 0) {
                await duffel.offerRequests.create({
                    slices: [
                        {
                            origin: origin_airport,
                            destination: input.destination,
                            departure_date: input.departure_date
                        }
                    ],
                    passengers: [
                        {
                            type: "adult"
                        }
                    ],
                    cabin_class: "economy"
                }).then(resp =>
                    offers = resp
                )
            } else if (input.type == 1) {
                offers = await duffel.offerRequests.create({
                    slices: [
                        {
                            origin: origin_airport,
                            destination: input.destination,
                            departure_date: input.departure_date
                        },
                        {
                            origin: input.destination,
                            destination: origin_airport,
                            departure_date: input.return_date
                        }
                    ],
                    passengers: [
                        {
                            type: "adult"
                        }
                    ],
                    cabin_class: "economy"
                }).then(resp =>
                    offers = resp
                )
            } else {
                throw new Error("Invalid Flight Type!");
            }

            var search_key = offers.data.client_key;

            // Parse through api data and store necessary info to data
            offers.data.offers.forEach((o) => {
                if (o.payment_requirements.payment_required_by == null) {
                    return;
                }

                // Init empty array to hold parsed slice data
                var slices = []

                // Call Utils to parse
                o.slices.forEach((s) => slices.push(Util.parseSlice(s)));

                // Format Duffel data
                data.push({
                    offer_id: o.id,
                    passenger_id: o.passengers[0].id,
                    airline: o.owner.name,
                    price: o.total_amount,
                    duration: o.slices[0].duration,
                    destination_airport: o.slices[0].destination.iata_code,
                    origin_airport: o.slices[0].origin.iata_code,
                    logo: o.owner.logo_symbol_url,
                    flight_class: o.slices[0].fare_brand_name,
                    flight_type: slices[0].flight_type,
                    details: slices,
                    search_key: search_key
                })

            });

            res.status(200).send(JSON.stringify(data));
        } catch (err) {
            log.error("Error at Offer Search:  ", err);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    // Place Flight on Hold
    /**@type {express.RequestHandler} */
    async hold(req, res) {
        // Check if the user is an attendee
        if (!AuthService.authorizer(req, res, ["Attendee"])) {
            log.verbose("unauthorized user attempted to hold a flight", { userId: res.locals.user.id });
            return res.status(403).json({ error: "Unauthorized access" });
        }

        var input = req.body;
        var user;
        var attendee_id;

        // JOI Validation
        const schema = Joi.object({
            offerID: Joi.string().required(),
            passID: Joi.string().required(),
            flight: Joi.object().required(),
            eventID: Joi.number().required(),
        });

        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        try {
            user = await User.GetUserById(res.locals.user.id);
            if (user) {
                attendee_id = await User.GetAttendee(input.eventID, user.id);
                if (!attendee_id) {
                    return res.status(403).json({ error: "User not an attendee" });
                } else{
                    const event = await Event.findById(input.eventID);

                    // Check if event hases ended
                    if (event.CheckIfEventIsOver()) {
                        return res.status(403).json({ error: "Event has already ended" });
                    }
                }
            } else { return res.status(404).json({ error: "User not found" }); }
        } catch (error) {
            log.error("uncaught user get request from flightservice");
            return res.status(500).json({ error: "Internal Server Error" });
        }

        // Check if user already has a flight on hold
        const existingFlight = await Flight.getBookedFlight(input.eventID, user.id);

        if (existingFlight?.status.id == 1) {
            log.verbose("user already has a flight on hold", { email: user.email, eventID: input.eventID });
            return res.status(400).json({ error: "Flight already on hold" });
        } else if (existingFlight?.status.id == 3) {
            log.verbose("user already has a flight booked", { email: user.email, eventID: input.eventID });
            return res.status(400).json({ error: "Flight already booked" });
        }

        try{
            // Create hold on given flight offer
            var confirmation = await duffel.orders.create({
                selected_offers: [input.offerID],
                type: "hold",
                passengers: [
                    {
                        id: input.passID,
                        given_name: user.firstName,
                        family_name: user.lastName,
                        title: user.title,
                        gender: user.gender,
                        phone_number: "+1" + user.phoneNum,
                        email: user.email,
                        born_on: user.dob
                    }
                ]
            })

            // Formatted response data from Duffel
            var data = {
                id: confirmation.data.id,
                offer_id: confirmation.data.offer_id,
                totalPrice: confirmation.data.total_amount,
                expiration: confirmation.data.payment_status.payment_required_by,
                guarantee: confirmation.data.payment_status.price_guarantee_expires_at,
                slices: confirmation.data.slices,
                deptSlice: confirmation.data.slices[0],
                airline: confirmation.data.owner.name,
                airlineLogo: confirmation.data.owner.logo_symbol_url,
                airlineLogoLockup: confirmation.data.owner.logo_lockup_url
            }

            const overallDepartureTime = data.deptSlice.segments[0].departing_at;
            const overallDepartureTimeZone = data.deptSlice.segments[0].origin.time_zone;
            const overallArrivalTime = data.deptSlice.segments[data.deptSlice.segments.length - 1].arriving_at;
            const overallArrivalTimeZone = data.deptSlice.segments[data.deptSlice.segments.length - 1].destination.time_zone;
            const overallDepartureAirportCode = data.deptSlice.origin.iata_code;
            const overallArrivalAirportCode = data.deptSlice.destination.iata_code;
            const overallDuration = data.deptSlice.duration;

            // Init empty array to hold parsed slice data
            const slices = []

            // Call Utils to parse
            data.slices.forEach((s) => slices.push(Util.parseSlice(s)));

            const dbItinerary = {
              price: input.flight.price,
              airline: data.airline,
              logoURL: data.airlineLogo,
              offer_id: data.offer_id,
              itinerary: slices
            }
            //console.log(JSON.stringify(dbItinerary))

            // Insert new hold into DB
            var newHold = new Flight(null, attendee_id, input.flight.price, overallDepartureTime, 
            overallDepartureAirportCode, overallArrivalTime, overallArrivalAirportCode, { id: 1 }, 
            null, input.flight.seatNumber, null, null, data.id, JSON.stringify(dbItinerary), null);
            const newHoldID = await newHold.save();

            const templatePath = path.join(process.cwd(), 'email_templates', 'flightHoldEmail.ejs');
            // Prepare data to pass into template
            const templateData = {
              user: {
                firstName: user.firstName
              },
              flight: {
                depart_loc: overallDepartureAirportCode,
                depart_time: new Date(overallDepartureTime).toLocaleDateString('en-US', {
                  timeZone: overallDepartureTimeZone,
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true,
                  timeZoneName: 'short'
                }),
                arrive_loc: overallArrivalAirportCode,
                arrive_time: new Date(overallArrivalTime).toLocaleDateString('en-US', {
                  timeZone: overallArrivalTimeZone,
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true,
                  timeZoneName: 'short'
                }),
                price: data.totalPrice,
                duration: overallDuration.replace('P', '').replace('D', 'd ').replace('T', '').replace('H', 'h ').replace('M', 'm'),
                airlineLogo: data.airlineLogoLockup
              }
            };

            let htmlContent;
            try {
              htmlContent = await ejs.renderFile(templatePath, templateData);
            } catch (renderErr) {
              log.error("Error rendering email template:", renderErr);
            }

            // Use generated htmlContent to send email
            const email = new Email(
              'no-reply@jlabupch.uk',
              user.email,
              "Flight on Hold",
              null,
              htmlContent
            );
            email.sendEmail();

            log.verbose("user flight hold confirmed", { email: user.email, confirmationID: confirmation.data.id });
            res.status(200).send(JSON.stringify(data));

            // Now that flight is held, check auto approval and book if the price is in the threshold.
            // Check if the event has auto approval
            const event = await Event.findById(input.eventID);
            const flight = await Flight.getFlightByID(newHoldID);


            // Create email template for finance manager approval email
            const approvalTemplate = path.join(process.cwd(), 'email_templates', 'flightAwaitingApproval.ejs');
            // Prepare data to pass into template
            const approvalTemplateData = {
                eventName: event.name
            };

            let approvalHtmlContent;
            try {
                approvalHtmlContent = await ejs.renderFile(approvalTemplate, approvalTemplateData);
            } catch (renderErr) {
              log.error("Error rendering email template:", renderErr);
            }

            // Use generated htmlContent to send email
            const approvalEmail = new Email(
              'no-reply@jlabupch.uk',
              event.financeMan.email,
              "Flight Awaiting Approval",
              null,
              approvalHtmlContent
            );


            // Set up the template for auto approval email
            const autoApproveTemplatePath = path.join(process.cwd(), 'email_templates', 'flightApprovedEmail.ejs');
            let htmlAutoApproveContent;
            try {
              htmlAutoApproveContent = await ejs.renderFile(autoApproveTemplatePath, templateData);
            } catch (renderErr) {
              log.error("Error rendering email template:", renderErr);
            }

            // Use generated htmlContent to send email
            const autoApprovalEmail = new Email(
                'no-reply@jlabupch.uk',
                user.email,
                "Flight Approved",
                null,
                htmlAutoApproveContent
              );


            if (event.autoApprove) {
                // Check if the flight price is within the auto approval threshold
                const autoApprovalThreshold = event.autoApproveThreshold;
                const flightPrice = data.totalPrice;
                if (flightPrice <= autoApprovalThreshold) {
                    // Auto approve the flight
                    flight.status.id = 3; 
                    flight.confirmation_code = "Confirmed";
                    flight.approved_by = event.financeMan.id; 
                    flight.save();

                    // Update the event history
                    await event.updateEventHistory(event.financeMan.id, flight.flight_id);

                    // Log and send email to user
                    log.verbose("user flight booking confirmed via auto approval", { email: user.email, confirmationID: confirmation.data.id });
                    // Send email to user
                    autoApprovalEmail.sendEmail();
                } else {
                    // Send email to finance manager for manual approval
                    approvalEmail.sendEmail();
                }
            } else { 
                // Send email to finance manager for manual approval
                approvalEmail.sendEmail();
            }
        } catch (error) {
            log.error("Error at Flight Hold (Auto Approval): ", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    // Book Flight
    /**@type {express.RequestHandler} */
    async booking(req, res) {

        // Check if the user is a finance Manager
        if (!AuthService.authorizer(req, res, ["Finance Manager"])) {
            log.verbose("unauthorized user attempted to book a flight", { userId: res.locals.user.id });
            return res.status(403).json({ error: "Unauthorized access" });
        }
        
        const schema = Joi.object({
            id: Joi.number().required(),
            price: Joi.number().positive().required(),
            eventID: Joi.number().required(),
            selection: Joi.boolean().required()
        });

        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        var input = req.body;

        try {
            const event = await Event.findById(input.eventID);

            // Check if event is over
            if (event.CheckIfEventIsOver()) {
                log.verbose("event is already over", { eventId: event.id });
                return res.status(400).json({ message: "Event is already over" });
            }
            var flight = await Flight.getFlightByID(input.id);
            if (!flight) {
                return res.status(404).json({ error: "Flight not found" });
            }

            // UNCOMMENT TO ENABLE PAYMENT THROUGH DUFFLE
            // Payment Creation 
            // var confirmation = await duffel.payments.create({
            //     'order_id': input.id,
            //     'payment': {
            //         'type': 'balance',
            //         'amount': input.price,
            //         'currency': 'USD'
            //     }
            // })

            const oldFilghtStatus = flight.status.id;

            // Update DB record
            if(input.selection) {
                flight.status.id = 3;
                flight.confirmation_code = "Confirmed";
            } else {
                flight.status.id = 2
                flight.confirmation_code = "Denied";
            }
            flight.approved_by = res.locals.user.id;
            flight.save();

            // Get Flight Attendee Info and Event Info
            const client = await User.GetUserByAttendee(flight.attendee_id);

            // Check if flight was set to approved from pending
            if (flight.status.id == 3 && oldFilghtStatus == 1) {
                // Updated the event history if flight was approved
                await event.updateEventHistory(res.locals.user.id, flight.flight_id);
            }


            // Setup the template for the email
            const templatePath = path.join(process.cwd(), 'email_templates', 'flightApprovedEmail.ejs');
            // Parse the itinerary data from the flight object
            const data = JSON.parse(flight.itinerary);

            // Prepare data to pass into template
            const templateData = {
              user: {
                firstName: client.firstName
              },
              flight: {
                depart_loc: flight.depart_loc,
                depart_time: new Date(flight.depart_time).toLocaleDateString('en-US', {
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true,
                  timeZoneName: 'short'
                }),
                arrive_loc: flight.arrive_loc,
                arrive_time: new Date(flight.arrive_time).toLocaleDateString('en-US', {
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true,
                  timeZoneName: 'short'
                }),
                price: flight.price,
                duration: data.itinerary[0].duration.replace('P', '').replace('D', 'd ').replace('T', '').replace('H', 'h ').replace('M', 'm'),
                airlineLogo: data.logoURL
              }
            };

            let htmlContent;
            try {
              htmlContent = await ejs.renderFile(templatePath, templateData);
            } catch (renderErr) {
              log.error("Error rendering email template:", renderErr);
            }

            // Use generated htmlContent to send email
            const approvedEmail = new Email(
              'no-reply@jlabupch.uk',
              client.email,
              "Flight Approved",
              null,
              htmlContent
            );

            // Setup the temeplate for denued email
            let htmlDeniedContent;
            const deniedTemplatePath = path.join(process.cwd(), 'email_templates', 'flightDeniedEmail.ejs');
            try {
              htmlDeniedContent = await ejs.renderFile(deniedTemplatePath, templateData);
            } catch (renderErr) {
              log.error("Error rendering email template:", renderErr);
            }

            // Use generated htmlContent to send email
            const deniedEmail = new Email(
              'no-reply@jlabupch.uk',
              client.email,
              "Flight Denied",
              null,
              htmlDeniedContent
            );

            // Send email to user based on flight status
            // 2 = Denied, 3 = Approved
            switch (flight.status.id) {
                case 2:
                    // Send email to user
                    deniedEmail.sendEmail();

                    log.verbose("flight denied", { flightID: flight.flight_id });
                    return res.status(200).json({ success: 'Flight Denied' });

                case 3:
                    // Send email to user
                    approvedEmail.sendEmail();
    
                    log.verbose("flight approved", { flightID: flight.flight_id });
                    return res.status(200).json({ success: 'Flight Approved' });
            }

        } catch (error) {
            log.error("Error at Booking: ", error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    // Get all Flights for input Event
    // For Finance Use
    /**@type {express.RequestHandler} */
    async getEventFlights(req, res) {
        log.verbose("getEventFlights", { eventID: req.params.id });

        try {
            const eventID = req.params.id;
            const flights = await Flight.getFlightsByEvent(eventID);
            if (flights) {
                res.status(200).json(flights);
            } else {
                res.status(400).json({ message: "Flights not found" });
            }
        } catch (error) {
            log.error("Error retrieving flights for event:", error);
            res.status(500).json({ error: "Unable to fetch flights" });
        }
    }

    // Get booked flight for user given input Event and User
    // For Attendee
    /**@type {express.RequestHandler} */
    async getBookedFlight(req, res) {
        try {
            const eventID = req.params.id;
            const flight = await Flight.getBookedFlight(eventID, res.locals.user.id);
            //console.log(flight);
            if(flight) {
                res.status(200).json(flight);
            } else {
                res.status(404).json({message: "No Booking Found"});
            }
        } catch (error) {
            log.error("Error retrieving booked flight for user:", error);
            res.status(500).json({ error: "Unable to fetch flight" });
        }
    }

}